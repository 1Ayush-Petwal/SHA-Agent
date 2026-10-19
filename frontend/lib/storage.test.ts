import assert from "node:assert/strict";
import test from "node:test";
import { readStored, writeStored } from "./storage.ts";

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

test("round-trips and removes", () => {
  const store = memory();
  writeStored("k", "v", store);
  assert.equal(readStored("k", store), "v");
  writeStored("k", null, store);
  assert.equal(readStored("k", store), null);
});

test("a throwing or missing storage reads as empty and never throws", () => {
  assert.equal(readStored("k", throwing), null);
  assert.doesNotThrow(() => writeStored("k", "v", throwing));
  assert.equal(readStored("k", undefined), null);
});
