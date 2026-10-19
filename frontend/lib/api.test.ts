import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, ask } from "./api.ts";
import type { AskEvent } from "./types.ts";

const step = { type: "step", node: "planner", attempt: 0, summary: "Plan: answerable", detail: "" };
const answer = { type: "answer", kind: "answerable", text: "1,176 orders." };
const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join("");
const respond = (res: Response): typeof fetch => async () => res;

async function drain(events: AsyncGenerator<AskEvent>): Promise<AskEvent[]> {
  const out: AskEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

test("yields steps, then the answer", async () => {
  const events = await drain(ask("q", { fetchImpl: respond(new Response(sse(step, answer))) }));
  assert.deepEqual(
    events.map((e) => e.type),
    ["step", "answer"],
  );
});

test("an error event ends the stream without a second, closed-connection error", async () => {
  const events = await drain(
    ask("q", { fetchImpl: respond(new Response(sse(step, { type: "error", message: "Model unavailable" }))) }),
  );
  assert.deepEqual(
    events.map((e) => e.type),
    ["step", "error"],
  );
});

test("a stream that ends without an answer throws, so the turn never spins forever", async () => {
  await assert.rejects(
    drain(ask("q", { fetchImpl: respond(new Response(sse(step))) })),
    (e: unknown) => e instanceof ApiError && /closed before an answer/.test(e.message),
  );
});

test("429 says when to retry, from the JSON body", async () => {
  const res = Response.json({ detail: "Rate limit reached", retry_after_s: 1740 }, { status: 429 });
  await assert.rejects(drain(ask("q", { fetchImpl: respond(res) })), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 429);
    assert.equal(e.retryAfterS, 1740);
    assert.match(e.message, /29 min/);
    return true;
  });
});

test("429 falls back to the Retry-After header", async () => {
  const res = new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "120" } });
  await assert.rejects(drain(ask("q", { fetchImpl: respond(res) })), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.retryAfterS, 120);
    assert.match(e.message, /2 min/);
    return true;
  });
});

test("an HTML error page (proxy, cold start) becomes a readable sentence", async () => {
  const res = new Response("<html><body>502 Bad Gateway</body></html>", {
    status: 502,
    headers: { "Content-Type": "text/html" },
  });
  await assert.rejects(drain(ask("q", { fetchImpl: respond(res) })), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 502);
    assert.doesNotMatch(e.message, /</);
    assert.match(e.message, /waking up/);
    return true;
  });
});

test("POSTs the question as JSON, with the admin token when given", async () => {
  let url = "";
  let init: RequestInit = {};
  const fetchImpl: typeof fetch = async (input, i) => {
    url = String(input);
    init = i ?? {};
    return new Response(sse(answer));
  };
  await drain(ask("How many orders?", { token: "t0k", fetchImpl }));
  assert.match(url, /\/ask$/);
  assert.equal(init.method, "POST");
  const headers = new Headers(init.headers);
  assert.equal(headers.get("X-Admin-Token"), "t0k");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(String(init.body)), { question: "How many orders?" });
});
