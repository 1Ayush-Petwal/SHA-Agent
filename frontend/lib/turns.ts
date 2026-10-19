import type { Answer, AskEvent, StepEvent } from "./types.ts";

export type TurnStatus = "running" | "done" | "error" | "cancelled";

export interface Turn {
  id: number;
  question: string;
  steps: StepEvent[];
  answer: Answer | null;
  status: TurnStatus;
  error: string | null;
}

export type TurnAction =
  | { type: "start"; id: number; question: string }
  | { type: "event"; id: number; event: AskEvent }
  | { type: "fail"; id: number; message: string }
  | { type: "cancel"; id: number };

/**
 * Chat state. One turn runs at a time: starting a new one stops any still running, and a stopped or
 * finished turn ignores whatever its old stream still delivers.
 */
export function turnsReducer(turns: Turn[], action: TurnAction): Turn[] {
  if (action.type === "start") {
    const settled = turns.map((t): Turn => (t.status === "running" ? { ...t, status: "cancelled" } : t));
    return [
      ...settled,
      { id: action.id, question: action.question, steps: [], answer: null, status: "running", error: null },
    ];
  }
  return turns.map((t) => (t.id === action.id && t.status === "running" ? apply(t, action) : t));
}

function apply(t: Turn, action: Exclude<TurnAction, { type: "start" }>): Turn {
  switch (action.type) {
    case "cancel":
      return { ...t, status: "cancelled" };
    case "fail":
      return { ...t, status: "error", error: action.message };
    case "event": {
      const e = action.event;
      if (e.type === "step") return { ...t, steps: [...t.steps, e] };
      if (e.type === "answer") return { ...t, answer: e, status: "done" };
      return { ...t, status: "error", error: e.message };
    }
  }
}
