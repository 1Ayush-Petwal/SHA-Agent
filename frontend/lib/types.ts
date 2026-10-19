// Hand-maintained mirror of the API's Pydantic models (backend/src/fixpoint/agent.py) and the eval
// contract in docs/superpowers/specs/2026-10-16-frontend-design.md. Change both sides together.

export type NodeName = "planner" | "coder" | "executor" | "verifier" | "debugger" | "explainer";
export type Kind = "answerable" | "ambiguous" | "unanswerable";
/** Postgres numerics arrive as strings (Pydantic serializes Decimal that way). */
export type Cell = string | number | boolean | null;

export interface StepEvent {
  type: "step";
  node: NodeName;
  attempt: number;
  summary: string;
  detail: string;
}

export interface Chart {
  type: "bar" | "line" | "table";
  x: string | null;
  y: string[];
}

export interface Memory {
  question: string;
  sql: string;
  score: number;
}

export interface Answer {
  type: "answer";
  kind: Kind;
  text: string;
  sql: string;
  columns: string[];
  rows: Cell[][];
  truncated: boolean;
  chart: Chart;
  warnings: string[];
  memories_used: Memory[];
  options: string[];
  refusal_reason: string;
  closest_question: string;
  verified: boolean;
  attempts: number;
  cost_usd: number;
  trace_url: string | null;
}

export interface StreamError {
  type: "error";
  message: string;
}

export type AskEvent = StepEvent | Answer | StreamError;

export type Split = "train" | "test" | "all";
export type RunStatus = "running" | "done" | "failed";

export interface EvalRun {
  id: number;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  git_sha: string;
  model: string;
  split: Split;
  memory: boolean;
  n: number;
  n_answerable: number;
  n_ambiguous: number;
  n_unanswerable: number;
  first_try_acc: number | null;
  final_acc: number | null;
  repair_uplift: number | null;
  repair_regressions: number | null;
  confidently_wrong: number | null;
  clarification_f1: number | null;
  refusal_acc: number | null;
  cost_per_correct: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
}

export interface EvalResult {
  question_id: string;
  question: string;
  kind: Kind;
  predicted_kind: Kind;
  first_try_correct: boolean;
  final_correct: boolean;
  verified: boolean;
  attempts: number;
  cost_usd: number;
  latency_ms: number;
  gold_sql: string;
  agent_sql: string;
  trace_url: string | null;
}

export interface RunDetail {
  run: EvalRun;
  results: EvalResult[];
}
