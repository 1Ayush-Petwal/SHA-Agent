"""HTTP seam: SSE framing of /ask, the rate limit, admin gating and one eval run at a time."""

import asyncio
import dataclasses
import json
import os

import httpx
import pytest
from fastapi.testclient import TestClient
from test_agent import COUNT_PLAN, ORDERS, FakeLLM, FakeSQL

from fixpoint import api
from fixpoint.agent import Agent, Answer, Explanation, SQLDraft

TOKEN = "s3cret"


class Canned:
    async def run(self, question, config=None):
        yield Answer(kind="ambiguous", text="Which did you mean?", options=["a", "b"])


class Exploding:
    async def run(self, question, config=None):
        raise RuntimeError("model down")
        yield  # pragma: no cover


class FakeMemory:
    def __init__(self):
        self.saved = []

    async def add(self, question, sql, source):
        self.saved.append((question, sql, source))
        return "inserted"


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


@pytest.fixture
def make_client(monkeypatch):
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)  # no tracing: tests never call the network
    monkeypatch.setattr(api, "settings", dataclasses.replace(api.settings, admin_token=TOKEN))

    def make(agent=None, clock=None):
        app = api.create_app()  # no lifespan: state is set by hand, and nothing touches a database
        app.dependency_overrides[api.daily_cap] = lambda: None
        app.state.agent = agent or Canned()
        app.state.limiter = api.RateLimiter(10, clock or Clock())
        app.state.memory = FakeMemory()
        return TestClient(app)

    return make


def events(response):
    assert response.headers["content-type"].startswith("text/event-stream")
    chunks = response.text.split("\n\n")
    assert chunks[-1] == "", "the stream ends with a complete event"
    assert all(c.startswith("data: ") and "\n" not in c for c in chunks[:-1])
    return [json.loads(c.removeprefix("data: ")) for c in chunks[:-1]]


def test_ask_streams_steps_then_one_answer(make_client):
    llm = FakeLLM(COUNT_PLAN, SQLDraft(sql="q1"), Explanation(text="There are 99,441 orders."))
    client = make_client(Agent(llm, FakeSQL({"q1": ORDERS})))

    got = events(client.post("/ask", json={"question": "  How many orders are there?  "}))

    assert [e["type"] for e in got] == ["step"] * 5 + ["answer"]
    assert [e["node"] for e in got[:-1]] == ["planner", "coder", "executor", "verifier", "explainer"]
    answer = got[-1]
    assert (answer["text"], answer["rows"], answer["verified"]) == ("There are 99,441 orders.", [[99441]], True)
    assert "first_try" not in answer and answer["trace_url"] is None


def test_ask_failure_ends_the_stream_with_an_error_event(make_client):
    got = events(make_client(Exploding()).post("/ask", json={"question": "anything"}))
    assert got == [{"type": "error", "message": "Something went wrong while answering. Please try again."}]


@pytest.mark.parametrize("question", ["", "   ", "x" * 501])
def test_ask_rejects_empty_and_long_questions_with_a_sentence(make_client, question):
    r = make_client().post("/ask", json={"question": question})
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str) and r.json()["detail"].startswith("question: ")


def test_rate_limit_per_ip_refills_over_time_and_admin_skips_it(make_client):
    clock = Clock()
    client = make_client(clock=clock)
    ask = lambda **kw: client.post("/ask", json={"question": "q"}, **kw)

    assert all(ask().status_code == 200 for _ in range(10))
    limited = ask()
    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == "360"  # 10 an hour: one token every 6 minutes
    assert ask(headers={"X-Admin-Token": TOKEN}).status_code == 200

    clock.now += 359
    assert ask().status_code == 429
    clock.now += 1
    assert ask().status_code == 200
    assert ask().status_code == 429


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("post", "/memory", {"question": "How many orders?", "sql": "SELECT count(*) FROM orders"}),
        ("post", "/evals/runs", {"split": "test", "memory": True}),
    ],
)
def test_admin_endpoints_need_the_token(make_client, method, path, body):
    client = make_client()
    assert client.request(method, path, json=body).status_code == 401
    assert client.request(method, path, json=body, headers={"X-Admin-Token": "wrong"}).status_code == 403


def test_admin_saves_a_verified_answer_to_memory(make_client):
    client = make_client()
    r = client.post(
        "/memory",
        json={"question": "How many orders?", "sql": "SELECT count(*) FROM orders"},
        headers={"X-Admin-Token": TOKEN},
    )
    assert r.json() == {"status": "inserted"}
    assert client.app.state.memory.saved == [("How many orders?", "SELECT count(*) FROM orders", "live")]


def test_no_admin_token_configured_means_no_admin(make_client, monkeypatch):
    client = make_client()
    monkeypatch.setattr(api, "settings", dataclasses.replace(api.settings, admin_token=""))
    assert client.post("/memory", json={"question": "q", "sql": "s"}, headers={"X-Admin-Token": "x"}).status_code == 403


def test_cors_lets_the_frontend_send_the_admin_token_and_read_retry_after(make_client):
    r = make_client().options(
        "/ask",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-admin-token",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"


URL = os.environ.get("TEST_DATABASE_URL")


@pytest.mark.db
@pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")
def test_a_second_eval_run_is_refused_while_one_is_running(monkeypatch):
    from fixpoint.db import init_app_schema, make_pool
    from fixpoint.evals import start_run

    monkeypatch.setattr(api, "settings", dataclasses.replace(api.settings, admin_token=TOKEN))

    async def go():
        pool = make_pool(URL or "")
        await pool.open()
        app = api.create_app()
        app.state.pool = pool
        try:
            await init_app_schema(pool)  # fails any run left running
            run_id = await start_run(pool, "test", False)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://t") as client:
                r = await client.post(
                    "/evals/runs", json={"split": "test", "memory": True}, headers={"X-Admin-Token": TOKEN}
                )
                assert (r.status_code, r.json()) == (409, {"detail": "An eval run is already in progress."})

                runs = (await client.get("/evals/runs")).json()
                assert runs[0]["id"] == run_id and runs[0]["status"] == "running"
                assert (runs[0]["n"], runs[0]["final_acc"], runs[0]["p50_ms"]) == (0, None, None)
                detail = (await client.get(f"/evals/runs/{run_id}")).json()
                assert detail == {"run": runs[0], "results": []}
                assert (await client.get("/evals/runs/999999999")).status_code == 404
        finally:
            async with pool.connection() as conn:
                await conn.execute("DELETE FROM app.eval_runs WHERE status = 'running'")
            await pool.close()

    asyncio.run(go())
