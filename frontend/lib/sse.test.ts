import assert from "node:assert/strict";
import test from "node:test";
import { sseData } from "./sse.ts";

async function collect(chunks: string[]): Promise<string[]> {
  async function* source() {
    yield* chunks;
  }
  const out: string[] = [];
  for await (const data of sseData(source())) out.push(data);
  return out;
}

test("one payload per blank-line-terminated event", async () => {
  assert.deepEqual(await collect(['data: {"a":1}\n\ndata: {"b":2}\n\n']), ['{"a":1}', '{"b":2}']);
});

test("an event split across chunks is joined", async () => {
  assert.deepEqual(await collect(['data: {"a"', ":1}\n", "\n"]), ['{"a":1}']);
});

test("CRLF endings, including a CRLF split between chunks", async () => {
  assert.deepEqual(await collect(["data: 1\r\n\r", "\ndata: 2\r\n\r\n"]), ["1", "2"]);
});

test("multi-line data joins with newlines; comments and other fields are ignored", async () => {
  assert.deepEqual(await collect([": ping\n\nevent: step\ndata: a\ndata: b\n\n"]), ["a\nb"]);
});

test("an unterminated trailing event is dropped", async () => {
  assert.deepEqual(await collect(['data: 1\n\ndata: {"trunc']), ["1"]);
});
