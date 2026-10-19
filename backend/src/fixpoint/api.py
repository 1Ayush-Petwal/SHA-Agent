"""HTTP API: /ask streams the agent's steps and answer as server-sent events; evals and memory endpoints."""

import asyncio
import datetime as dt
import functools
import hmac
import logging
import math
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, StringConstraints

from fixpoint import tracing
from fixpoint.agent import Agent, Answer
from fixpoint.config import settings
from fixpoint.db import init_app_schema, make_pool, run_sql
from fixpoint.evals import EvalAlreadyRunning, Split, load_golden, run_eval, start_run

log = logging.getLogger(__name__)
Kind = Literal["answerable", "ambiguous", "unanswerable"]
Question = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=settings.max_question_chars)
]


class RateLimiter:
    """A token bucket per client: `per_hour` questions, refilled continuously."""

    # ponytail: in memory and per process (one Render instance); buckets of IPs that never return are never freed
    def __init__(self, per_hour: int, clock: Callable[[], float] = time.monotonic):
        self.capacity, self.rate, self.clock = per_hour, per_hour / 3600, clock
        self.buckets: dict[str, tuple[float, float]] = {}  # client -> (tokens, when counted)

    def take(self, client: str) -> float | None:
        """Spend one token. None when allowed, otherwise the seconds until a token is free."""
        now = self.clock()
        tokens, then = self.buckets.get(client, (self.capacity, now))
        tokens = min(self.capacity, tokens + (now - then) * self.rate)
        if tokens < 1:
            self.buckets[client] = (tokens, now)
            return (1 - tokens) / self.rate
        self.buckets[client] = (tokens - 1, now)
        return None


def is_admin(token: str | None) -> bool:
    return bool(settings.admin_token and token) and hmac.compare_digest(
        (token or "").encode(), settings.admin_token.encode()
    )


AdminToken = Annotated[str | None, Header(alias="X-Admin-Token")]


def require_admin(token: AdminToken = None) -> None:
    if not token:
        raise HTTPException(401, "Admin token required.")
    if not is_admin(token):
        raise HTTPException(403, "Admin token rejected.")


def too_many(detail: str, wait_s: float) -> HTTPException:
    return HTTPException(429, detail, headers={"Retry-After": str(math.ceil(wait_s))})


def ip_limit(request: Request, token: AdminToken = None) -> None:
    """Per-IP question limit. The admin token skips it. Behind a proxy, run uvicorn with --proxy-headers."""
    if is_admin(token):
        return
    wait = request.app.state.limiter.take(request.client.host if request.client else "unknown")
    if wait is not None:
        raise too_many("Question limit reached for now.", wait)


async def daily_cap(request: Request) -> None:
    """Global questions per UTC day, counted in Postgres so restarts don't reset it."""
    async with request.app.state.pool.connection() as conn:
        cur = await conn.execute(
            "INSERT INTO app.daily_questions (day, n) VALUES ((now() AT TIME ZONE 'utc')::date, 1) "
            "ON CONFLICT (day) DO UPDATE SET n = app.daily_questions.n + 1 RETURNING n"
        )
        row = await cur.fetchone()
    if row and row[0] > settings.daily_question_cap:
        now = dt.datetime.now(dt.UTC)
        midnight = dt.datetime.combine(now.date() + dt.timedelta(days=1), dt.time(), dt.UTC)
        raise too_many("The demo's daily question limit is reached.", (midnight - now).total_seconds())


# --- models ---


class AskRequest(BaseModel):
    question: Question


class StreamError(BaseModel):
    type: Literal["error"] = "error"
    message: str


class MemoryRequest(BaseModel):
    question: Question
    sql: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class MemorySaved(BaseModel):
    status: Literal["inserted", "merged"]


class StartRunRequest(BaseModel):
    split: Split
    memory: bool


class RunStarted(BaseModel):
    id: int


class EvalRun(BaseModel):
    id: int
    status: Literal["running", "done", "failed"]
    started_at: dt.datetime
    finished_at: dt.datetime | None
    git_sha: str
    model: str
    split: Split
    memory: bool
    n: int
    n_answerable: int
    n_ambiguous: int
    n_unanswerable: int
    first_try_acc: float | None
    final_acc: float | None
    repair_uplift: float | None
    repair_regressions: int | None
    confidently_wrong: int | None
    clarification_f1: float | None
    refusal_acc: float | None
    cost_per_correct: float | None
    p50_ms: int | None
    p95_ms: int | None


class EvalResult(BaseModel):
    question_id: str
    question: str
    kind: Kind
    predicted_kind: Kind | None  # None when the agent crashed on the question
    first_try_correct: bool
    final_correct: bool
    verified: bool
    attempts: int
    cost_usd: float
    latency_ms: int
    gold_sql: str
    agent_sql: str
    trace_url: str | None


class RunDetail(BaseModel):
    run: EvalRun
    results: list[EvalResult]


def _ms(seconds: float | None) -> int | None:
    return None if seconds is None else round(seconds * 1000)


RUNS_SQL = """
SELECT r.id, r.status, r.started_at, r.finished_at, r.git_sha, r.model, r.split, r.memory, r.metrics,
       (SELECT count(*) FROM app.eval_results e WHERE e.run_id = r.id) AS scored
FROM app.eval_runs r
"""


def _run(row: tuple[Any, ...]) -> EvalRun:
    id_, status, started_at, finished_at, git_sha, model, split, memory, metrics, scored = row
    m = metrics or {}  # a running or failed run has no metrics yet; n counts the questions scored so far
    return EvalRun(
        id=id_,
        status=status,
        started_at=started_at,
        finished_at=finished_at,
        git_sha=git_sha,
        model=model,
        split=split,
        memory=memory,
        n=m.get("n", scored),
        n_answerable=m.get("n_answerable", 0),
        n_ambiguous=m.get("n_ambiguous", 0),
        n_unanswerable=m.get("n_unanswerable", 0),
        first_try_acc=m.get("first_try_accuracy"),
        final_acc=m.get("final_accuracy"),
        repair_uplift=m.get("repair_uplift"),
        repair_regressions=m.get("repair_regressions"),
        confidently_wrong=m.get("confidently_wrong"),
        clarification_f1=m.get("clarification_f1"),
        refusal_acc=m.get("refusal_accuracy"),
        cost_per_correct=m.get("cost_per_correct"),
        p50_ms=_ms(m.get("latency_p50_s")),
        p95_ms=_ms(m.get("latency_p95_s")),
    )


def _result(r: dict[str, Any]) -> EvalResult:
    return EvalResult(
        question_id=r["id"],
        latency_ms=round(r["latency_s"] * 1000),
        **{k: r[k] for k in EvalResult.model_fields if k not in ("question_id", "latency_ms")},
    )


# --- app ---


def _log_failure(task: asyncio.Task[Any]) -> None:
    # run_eval has already recorded the failure on the run; this keeps the traceback in the server log.
    if not task.cancelled() and (e := task.exception()):
        log.error("eval run failed", exc_info=e)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    from fixpoint.llm import Gemini
    from fixpoint.memory import VectorMemory, gemini_embed

    pool = make_pool(settings.database_url)
    await pool.open()
    await init_app_schema(pool)
    memory = VectorMemory(pool, gemini_embed())
    await memory.load()
    app.state.pool, app.state.memory = pool, memory
    app.state.agent = Agent(Gemini(), functools.partial(run_sql, pool), memory)
    app.state.limiter = RateLimiter(settings.ip_questions_per_hour)
    app.state.eval_tasks = set()
    try:
        yield
    finally:
        for task in app.state.eval_tasks:
            task.cancel()  # run_eval marks the run failed, so the pool must still be open
        await asyncio.gather(*app.state.eval_tasks, return_exceptions=True)
        await pool.close()
        tracing.flush()


def create_app() -> FastAPI:
    app = FastAPI(title="Fixpoint", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Admin-Token"],
        expose_headers=["Retry-After"],
    )

    @app.exception_handler(RequestValidationError)
    async def one_sentence(request: Request, exc: RequestValidationError) -> JSONResponse:
        # The UI shows `detail` as is, so make it a sentence rather than FastAPI's list of errors.
        detail = "; ".join(f"{'.'.join(map(str, e['loc'][1:])) or 'body'}: {e['msg']}" for e in exc.errors())
        return JSONResponse({"detail": detail}, status_code=422)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/ask", dependencies=[Depends(ip_limit), Depends(daily_cap)])
    async def ask(body: AskRequest, request: Request) -> StreamingResponse:
        agent: Agent = request.app.state.agent

        async def events() -> AsyncIterator[str]:
            # A client disconnect cancels this generator, and with it the graph run.
            config, trace_id = tracing.new_trace("ask")
            try:
                async for event in agent.run(body.question, config):
                    if isinstance(event, Answer):
                        event.trace_url = await tracing.trace_url(trace_id)
                    yield f"data: {event.model_dump_json()}\n\n"
            except Exception:
                log.exception("ask failed: %r", body.question)
                error = StreamError(message="Something went wrong while answering. Please try again.")
                yield f"data: {error.model_dump_json()}\n\n"

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
        )

    @app.post("/memory", dependencies=[Depends(require_admin)])
    async def save_memory(body: MemoryRequest, request: Request) -> MemorySaved:
        return MemorySaved(status=await request.app.state.memory.add(body.question, body.sql, "live"))

    @app.get("/evals/runs")
    async def list_runs(request: Request) -> list[EvalRun]:
        async with request.app.state.pool.connection() as conn:
            rows = await (await conn.execute(RUNS_SQL + "ORDER BY r.id DESC")).fetchall()
        return [_run(row) for row in rows]

    @app.get("/evals/runs/{run_id}")
    async def get_run(run_id: int, request: Request) -> RunDetail:
        async with request.app.state.pool.connection() as conn:
            row = await (await conn.execute(RUNS_SQL + "WHERE r.id = %s", (run_id,))).fetchone()
            if row is None:
                raise HTTPException(404, f"No eval run {run_id}.")
            cur = await conn.execute("SELECT result FROM app.eval_results WHERE run_id = %s", (run_id,))
            results = [_result(r) for (r,) in await cur.fetchall()]
        order = {item["id"]: i for i, item in enumerate(load_golden())}  # the golden set's order, as written
        results.sort(key=lambda r: order.get(r.question_id, len(order)))
        return RunDetail(run=_run(row), results=results)

    @app.post("/evals/runs", status_code=202, dependencies=[Depends(require_admin)])
    async def start_eval(body: StartRunRequest, request: Request) -> RunStarted:
        pool = request.app.state.pool
        try:
            run_id = await start_run(pool, body.split, body.memory)
        except EvalAlreadyRunning:
            raise HTTPException(409, "An eval run is already in progress.") from None
        task = asyncio.create_task(run_eval(pool, run_id, body.split, body.memory))
        tasks: set[asyncio.Task[Any]] = request.app.state.eval_tasks
        tasks.add(task)  # a reference, so the task isn't garbage-collected mid-run
        task.add_done_callback(tasks.discard)
        task.add_done_callback(_log_failure)
        return RunStarted(id=run_id)

    return app


app = create_app()
