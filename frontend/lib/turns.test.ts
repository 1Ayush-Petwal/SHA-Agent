import assert from "node:assert/strict";
import test from "node:test";
import { turnsReducer, type Turn } from "./turns.ts";
import type { Answer, StepEvent } from "./types.ts";

const step: StepEvent = { type: "step", node: "planner", attempt: 0, summary: "Plan: answerable", detail: "" };
const answer = { type: "answer", kind: "answerable", text: "done" } as Answer;
const start = (id: number, question = `q${id}`) => ({ type: "start", id, question }) as const;

test("start appends a running turn", () => {
  const [t] = turnsReducer([], start(1, "How many orders?"));
  assert.deepEqual(t, { id: 1, question: "How many orders?", steps: [], answer: null, status: "running", error: null });
});

test("steps append; the answer completes the turn", () => {
  let turns: Turn[] = turnsReducer([], start(1));
  turns = turnsReducer(turns, { type: "event", id: 1, event: step });
  turns = turnsReducer(turns, { type: "event", id: 1, event: answer });
  assert.equal(turns[0].steps.length, 1);
  assert.equal(turns[0].status, "done");
  assert.equal(turns[0].answer, answer);
});

test("a new question stops the running one, and its late events are ignored", () => {
  let turns: Turn[] = turnsReducer([], start(1));
  turns = turnsReducer(turns, start(2));
  turns = turnsReducer(turns, { type: "event", id: 1, event: answer });
  assert.equal(turns[0].status, "cancelled");
  assert.equal(turns[0].answer, null);
  assert.equal(turns[1].status, "running");
});

test("an error event or a failure ends the turn with its message", () => {
  let turns: Turn[] = turnsReducer([start(1), start(2)].reduce<Turn[]>(turnsReducer, []), {
    type: "event",
    id: 2,
    event: { type: "error", message: "Model unavailable" },
  });
  assert.deepEqual([turns[1].status, turns[1].error], ["error", "Model unavailable"]);
  turns = turnsReducer(turnsReducer(turns, start(3)), { type: "fail", id: 3, message: "Offline" });
  assert.deepEqual([turns[2].status, turns[2].error], ["error", "Offline"]);
});

test("cancel only touches a running turn", () => {
  let turns: Turn[] = turnsReducer(turnsReducer([], start(1)), { type: "event", id: 1, event: answer });
  turns = turnsReducer(turns, { type: "cancel", id: 1 });
  assert.equal(turns[0].status, "done");
});
