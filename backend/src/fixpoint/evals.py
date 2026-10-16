"""Golden set and evaluation."""

import asyncio
import functools
import itertools
import json
import math
import os
import re
import statistics
import subprocess
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal

import psycopg
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from fixpoint import tracing
from fixpoint.agent import Agent, Answer
from fixpoint.config import settings
from fixpoint.db import make_pool, run_sql
from fixpoint.llm import LLM, Gemini

GOLDEN = Path(__file__).parent / "golden.jsonl"
DATE = re.compile(r"^(\d{4}-\d{2})(?:-(\d{2}))?(?:[T ](\d{2}:\d{2}:\d{2})(?:\.0+)?)?(?:Z|[+-]\d{2}:?\d{2})?$")
REL_TOL = 1e-4  # 0.01%


def _normal(v: Any) -> Any:
    """Ints and floats become one number; dates become ISO, with month starts and midnights reading as dates."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    if isinstance(v, str) and (m := DATE.match(v)):
        month, day, time = m.groups()
        date = f"{month}-{day or '01'}"
        return date if time in (None, "00:00:00") else f"{date}T{time}"
    return v


def _key(v: Any) -> tuple[int, Any]:
    return (0, 0) if v is None else (1, v) if isinstance(v, float) else (2, str(v))


def _same(a: Any, b: Any) -> bool:
    if isinstance(a, float) and isinstance(b, float):
        return math.isclose(a, b, rel_tol=REL_TOL)
    return bool(a == b)


def _rows_equal(gold: list[list[Any]], pred: list[list[Any]], ordered: bool) -> bool:
    if not ordered:
        # ponytail: sorting, then comparing with tolerance, can misalign values within 0.01% of each other
        gold, pred = sorted(gold, key=lambda r: [_key(v) for v in r]), sorted(pred, key=lambda r: [_key(v) for v in r])
    return len(gold) == len(pred) and all(_same(a, b) for g, p in zip(gold, pred) for a, b in zip(g, p, strict=True))


def result_matches(gold: list[list[Any]], pred: list[list[Any]] | None, order_matters: bool) -> bool:
    """Every gold column must equal some predicted column as a value vector (names ignored, extra columns allowed),
    with rows compared as a multiset unless order matters."""
    if not pred or len(pred) != len(gold):
        return False
    gold = [[_normal(v) for v in row] for row in gold]
    pred = [[_normal(v) for v in row] for row in pred]
    candidates = [
        [k for k in range(len(pred[0])) if _rows_equal([[r[j]] for r in gold], [[r[k]] for r in pred], order_matters)]
        for j in range(len(gold[0]))
    ]
    # ponytail: tries every column assignment; fine for the handful of columns a business answer has
    return any(
        _rows_equal(gold, [[r[k] for k in combo] for r in pred], order_matters)
        for combo in itertools.product(*candidates)
    )


def load_golden(path: Path = GOLDEN) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


async def snapshot_golden(path: Path = GOLDEN) -> None:
    """Run every gold SQL, check known counts (`expect`), and store the results as snapshots."""
    items = load_golden(path)
    pool = make_pool(settings.database_url)
    await pool.open()
    try:
        for item in items:
            if item["kind"] != "answerable":
                continue
            r = await run_sql(pool, item["sql"])
            if r.truncated or not r.rows:
                raise ValueError(f"{item['id']}: gold result is empty or truncated")
            if "expect" in item and r.rows != item["expect"]:
                raise ValueError(f"{item['id']}: got {r.rows}, known answer is {item['expect']}")
            item["snapshot"] = {"columns": r.columns, "rows": r.rows}
            print(f"{item['id']:28} {len(r.rows):>3} rows  {r.rows[0]}")
    finally:
        await pool.close()
    path.write_text("".join(json.dumps(i) + "\n" for i in items))


def _ratio(num: float, den: float, digits: int = 3) -> float | None:
    return round(num / den, digits) if den else None


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Run metrics from per-question results. Accuracies are fractions of their n."""
    answerable = [r for r in results if r["kind"] == "answerable"]
    unanswerable = [r for r in results if r["kind"] == "unanswerable"]
    first = sum(r["first_try_correct"] for r in answerable)
    final = sum(r["final_correct"] for r in answerable)
    tp = sum(r["kind"] == "ambiguous" and r["predicted_kind"] == "ambiguous" for r in results)
    fp = sum(r["kind"] != "ambiguous" and r["predicted_kind"] == "ambiguous" for r in results)
    fn = sum(r["kind"] == "ambiguous" and r["predicted_kind"] != "ambiguous" for r in results)
    correct = sum(r["final_correct"] for r in results)
    latencies = sorted(r["latency_s"] for r in results)
    return {
        "n": len(results),
        "n_answerable": len(answerable),
        "n_ambiguous": sum(r["kind"] == "ambiguous" for r in results),
        "n_unanswerable": len(unanswerable),
        "first_try_accuracy": _ratio(first, len(answerable)),
        "final_accuracy": _ratio(final, len(answerable)),
        "repair_uplift": _ratio(final - first, len(answerable)),
        "repaired": sum(not r["first_try_correct"] and r["final_correct"] for r in answerable),
        "repair_regressions": sum(r["first_try_correct"] and not r["final_correct"] for r in answerable),
        "confidently_wrong": sum(r["verified"] and not r["final_correct"] for r in answerable),
        "clarification_f1": _ratio(2 * tp, 2 * tp + fp + fn),
        "refusal_accuracy": _ratio(sum(r["final_correct"] for r in unanswerable), len(unanswerable)),
        "cost_usd": round(sum(r["cost_usd"] for r in results), 4),
        "cost_per_correct": _ratio(sum(r["cost_usd"] for r in results), correct, 4),
        "latency_p50_s": round(statistics.median(latencies), 1) if latencies else None,
        "latency_p95_s": latencies[math.ceil(0.95 * len(latencies)) - 1] if latencies else None,
        "errors": sum(bool(r.get("error")) for r in results),
    }


class EvalAlreadyRunning(Exception):
    pass


Split = Literal["train", "test", "all"]


def git_sha() -> str:
    if sha := os.environ.get("RENDER_GIT_COMMIT"):
        return sha[:7]
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], check=False, capture_output=True, text=True, timeout=5
        )
        return out.stdout.strip() or "unknown"
    except OSError:
        return "unknown"


async def start_run(pool: AsyncConnectionPool, split: Split, memory: bool) -> int:
    """Record a new running eval. Raises EvalAlreadyRunning if one is in progress (one at a time, by index)."""
    try:
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO app.eval_runs (split, memory, git_sha, model) VALUES (%s, %s, %s, %s) RETURNING id",
                (split, memory, git_sha(), f"{settings.fast_model} / {settings.strong_model}"),
            )
            row = await cur.fetchone()
    except psycopg.errors.UniqueViolation as e:
        raise EvalAlreadyRunning from e
    assert row is not None
    return int(row[0])


async def _score_one(agent: Agent, item: dict[str, Any]) -> dict[str, Any]:
    config, trace_id = tracing.new_trace(f"eval {item['id']}")
    started = time.monotonic()
    answer: Answer | None = None
    error = None
    try:
        async for event in agent.run(item["question"], config):
            if isinstance(event, Answer):
                answer = event
    except Exception as e:  # noqa: BLE001  # one broken question is a wrong answer, not a failed run
        error = f"{type(e).__name__}: {e}"
    latency = round(time.monotonic() - started, 1)

    if item["kind"] == "answerable" and answer is not None:
        gold, order = item["snapshot"]["rows"], item["order_matters"]
        first = answer.first_try is not None and result_matches(gold, answer.first_try.rows, order)
        final = answer.kind == "answerable" and result_matches(gold, answer.rows, order)
    else:  # ambiguous and unanswerable questions are right when the planner labels them so
        first = final = answer is not None and answer.kind == item["kind"]
    tracing.score(trace_id, "correct", final)
    return {
        "id": item["id"],
        "kind": item["kind"],
        "tier": item.get("tier"),
        "question": item["question"],
        "gold_sql": item.get("sql", ""),
        "agent_sql": answer.sql if answer else "",
        "predicted_kind": answer.kind if answer else None,
        "first_try_correct": first,
        "final_correct": final,
        "verified": bool(answer and answer.verified),
        "attempts": answer.attempts if answer else 0,
        "latency_s": latency,
        "cost_usd": answer.cost_usd if answer else 0.0,
        "trace_url": await tracing.trace_url(trace_id),
        "error": error,
    }


async def run_eval(
    pool: AsyncConnectionPool,
    run_id: int,
    split: Split,
    memory: bool,
    llm: LLM | None = None,
    on_result: Callable[[dict[str, Any]], None] = lambda r: None,
) -> dict[str, Any]:
    """Answer every golden question in the split, score it, and record the run. Never writes memory."""
    try:
        store = None
        if memory:
            from fixpoint.memory import VectorMemory, gemini_embed

            store = VectorMemory(pool, gemini_embed())
            await store.load()
        agent = Agent(llm or Gemini(), functools.partial(run_sql, pool), store)
        items = [i for i in load_golden() if split == "all" or i["split"] == split]
        gate = asyncio.Semaphore(2)  # ponytail: 2 questions at a time keeps under Gemini rate limits

        async def one(item: dict[str, Any]) -> dict[str, Any]:
            async with gate:
                result = await _score_one(agent, item)
            async with pool.connection() as conn:
                await conn.execute(
                    "INSERT INTO app.eval_results (run_id, question_id, result) VALUES (%s, %s, %s)",
                    (run_id, item["id"], Jsonb(result)),
                )
            on_result(result)
            return result

        metrics = summarize(await asyncio.gather(*(one(i) for i in items)))
        async with pool.connection() as conn:
            await conn.execute(
                "UPDATE app.eval_runs SET status = 'done', metrics = %s, finished_at = now() WHERE id = %s",
                (Jsonb(metrics), run_id),
            )
        return metrics
    except BaseException as e:  # including cancellation: never leave a run stuck in 'running'
        async with pool.connection() as conn:
            await conn.execute(
                "UPDATE app.eval_runs SET status = 'failed', error = %s, finished_at = now() WHERE id = %s",
                (f"{type(e).__name__}: {e}", run_id),
            )
        raise
