import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLES } from "../examples.ts";
import { SCENARIOS } from "./ask-scenarios.ts";

test("each example question reaches its own scenario", () => {
  const keys = EXAMPLES.map((q) => SCENARIOS.find(([k]) => q.toLowerCase().includes(k))?.[0]);
  assert.ok(keys.every(Boolean), `unmatched: ${EXAMPLES.filter((_, i) => !keys[i])}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("every stream ends in exactly one answer or error, except the dropped connection", () => {
  for (const [key, make] of SCENARIOS) {
    const s = make();
    if (s.kind !== "stream") continue;
    const terminal = s.events.filter((e) => e.type !== "step");
    if (key === "mock drop") {
      assert.equal(terminal.length, 0, key);
    } else {
      assert.equal(terminal.length, 1, key);
      assert.notEqual(s.events.at(-1)?.type, "step", key);
    }
  }
});
