import type { EvalResult, EvalRun } from "./types.ts";

const newestFirst = (runs: EvalRun[]) =>
  runs.filter((r) => r.status === "done").sort((a, b) => b.started_at.localeCompare(a.started_at));

/** The newest finished memory-on and memory-off runs on the same split, taking the split with the newest such pair. */
export function pickComparison(runs: EvalRun[]): { on: EvalRun; off: EvalRun } | null {
  const done = newestFirst(runs);
  for (const r of done) {
    const other = done.find((o) => o.split === r.split && o.memory !== r.memory);
    if (other) return r.memory ? { on: r, off: other } : { on: other, off: r };
  }
  return null;
}

/** The run the landing page quotes: the newest finished test-split run, else the newest finished run. */
export function latestDone(runs: EvalRun[]): EvalRun | null {
  const done = newestFirst(runs);
  return done.find((r) => r.split === "test") ?? done[0] ?? null;
}

export const anyRunning = (runs: EvalRun[]) => runs.some((r) => r.status === "running");

/** Failure modes worth a badge: verified but wrong, and right on the first try but wrong after repair. */
export function flags(r: EvalResult): { confidentlyWrong: boolean; regression: boolean } {
  return {
    confidentlyWrong: r.kind === "answerable" && r.verified && !r.final_correct,
    regression: r.first_try_correct && !r.final_correct,
  };
}
