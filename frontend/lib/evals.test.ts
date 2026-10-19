import assert from "node:assert/strict";
import test from "node:test";
import { anyRunning, flags, latestDone, pickComparison } from "./evals.ts";
import type { EvalResult, EvalRun } from "./types.ts";

const run = (id: number, over: Partial<EvalRun>): EvalRun =>
  ({ id, status: "done", split: "test", memory: true, started_at: `2026-10-16T0${id}:00:00Z`, ...over }) as EvalRun;

test("compares the newest finished on/off pair on one split", () => {
  const runs = [
    run(5, { memory: true, status: "running" }),
    run(4, { memory: true, split: "train" }),
    run(3, { memory: true }),
    run(2, { memory: false }),
    run(1, { memory: false, split: "train", status: "failed" }),
  ];
  const pair = pickComparison(runs);
  assert.deepEqual([pair?.on.id, pair?.off.id], [3, 2]);
});

test("no comparison without both memory settings finished on one split", () => {
  assert.equal(pickComparison([run(2, { memory: true }), run(1, { memory: false, split: "train" })]), null);
  assert.equal(pickComparison([]), null);
});

test("latestDone prefers the newest finished test-split run", () => {
  const runs = [run(3, { split: "train" }), run(2, {}), run(1, {})];
  assert.equal(latestDone(runs)?.id, 2);
  assert.equal(latestDone([run(1, { split: "train" })])?.id, 1);
  assert.equal(latestDone([run(1, { status: "running" })]), null);
});

test("anyRunning", () => {
  assert.equal(anyRunning([run(1, {}), run(2, { status: "running" })]), true);
  assert.equal(anyRunning([run(1, {})]), false);
});

test("flags confidently-wrong and repair regressions", () => {
  const r = (o: Partial<EvalResult>) => ({ kind: "answerable", ...o }) as EvalResult;
  assert.deepEqual(flags(r({ verified: true, final_correct: false, first_try_correct: false })), {
    confidentlyWrong: true,
    regression: false,
  });
  assert.deepEqual(flags(r({ verified: true, final_correct: false, first_try_correct: true })), {
    confidentlyWrong: true,
    regression: true,
  });
  assert.deepEqual(flags(r({ verified: false, final_correct: false, first_try_correct: false })), {
    confidentlyWrong: false,
    regression: false,
  });
});
