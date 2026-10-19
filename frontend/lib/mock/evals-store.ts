import type { EvalResult, EvalRun, Kind, RunDetail, Split } from "../types.ts";

type Outcome = Pick<EvalResult, "first_try_correct" | "final_correct" | "verified" | "attempts"> & {
  predicted_kind?: Kind;
};

const pass: Outcome = { first_try_correct: true, final_correct: true, verified: true, attempts: 1 };
const repaired: Outcome = { first_try_correct: false, final_correct: true, verified: true, attempts: 2 };
const confidentlyWrong: Outcome = { first_try_correct: false, final_correct: false, verified: true, attempts: 1 };
const regressed: Outcome = { first_try_correct: true, final_correct: false, verified: true, attempts: 2 };
const gaveUp: Outcome = { first_try_correct: false, final_correct: false, verified: false, attempts: 4 };
/** Ambiguous and unanswerable questions are scored on the planner's kind alone. */
const said = (kind: Kind): Outcome => ({ ...gaveUp, verified: false, attempts: 0, predicted_kind: kind });

interface Question {
  id: string;
  kind: Kind;
  question: string;
  gold: string;
  wrong?: string;
  on: Outcome;
  off: Outcome;
}

// The 20 test-split questions of backend/src/fixpoint/golden.jsonl, with made-up outcomes per memory setting.
const QUESTIONS: Question[] = [
  { id: "s1-delivered", kind: "answerable", question: "How many orders were delivered?", gold: "SELECT count(*) AS orders FROM orders WHERE order_status = 'delivered'", on: pass, off: pass },
  { id: "s2-repeat-customers", kind: "answerable", question: "How many customers have placed more than one order?", gold: "SELECT count(*) AS customers FROM (SELECT c.customer_unique_id FROM orders o JOIN customers c USING (customer_id) GROUP BY 1 HAVING count(*) > 1) t", wrong: "SELECT count(*) AS customers FROM (SELECT customer_id FROM orders GROUP BY 1 HAVING count(*) > 1) t", on: repaired, off: confidentlyWrong },
  { id: "s2-aov", kind: "answerable", question: "What is the average order value of delivered orders?", gold: "SELECT round(avg(v), 2) AS avg_order_value FROM (SELECT oi.order_id, sum(oi.price) AS v FROM order_items oi JOIN orders o USING (order_id) WHERE o.order_status = 'delivered' GROUP BY 1) t", on: pass, off: pass },
  { id: "s2-monthly-2017", kind: "answerable", question: "How many delivered orders were there each month in 2017?", gold: "SELECT date_trunc('month', order_purchase_timestamp)::date AS month, count(*) AS orders FROM orders WHERE order_status = 'delivered' AND order_purchase_timestamp >= '2017-01-01' AND order_purchase_timestamp < '2018-01-01' GROUP BY 1 ORDER BY 1", on: pass, off: repaired },
  { id: "s2-late-pct", kind: "answerable", question: "What percentage of delivered orders arrived after the estimated delivery date?", gold: "SELECT round(100.0 * count(*) FILTER (WHERE order_delivered_customer_date::date > order_estimated_delivery_date::date) / count(order_delivered_customer_date), 2) AS late_pct FROM orders WHERE order_status = 'delivered'", on: pass, off: pass },
  { id: "s3-best-reviewed-category", kind: "answerable", question: "Among product categories with at least 500 delivered orders, which has the highest average review score? Use English category names.", gold: "WITH r AS (SELECT DISTINCT ON (order_id) order_id, review_score FROM order_reviews ORDER BY order_id, review_answer_timestamp DESC) , oc AS (SELECT DISTINCT oi.order_id, COALESCE(t.product_category_name_english, p.product_category_name, 'unknown') AS category FROM order_items oi JOIN orders o USING (order_id) JOIN products p USING (product_id) LEFT JOIN product_category_name_translation t USING (product_category_name) WHERE o.order_status = 'delivered') SELECT category FROM oc JOIN r USING (order_id) GROUP BY 1 HAVING count(*) >= 500 ORDER BY avg(r.review_score) DESC LIMIT 1", wrong: "SELECT COALESCE(t.product_category_name_english, p.product_category_name) AS category FROM order_reviews r JOIN order_items oi USING (order_id) JOIN products p USING (product_id) LEFT JOIN product_category_name_translation t USING (product_category_name) GROUP BY 1 HAVING count(*) >= 500 ORDER BY avg(r.review_score) DESC LIMIT 1", on: repaired, off: gaveUp },
  { id: "s3-mom-growth", kind: "answerable", question: "In which month of 2017 did delivered revenue grow the most in absolute terms compared with the previous month?", gold: "WITH m AS (SELECT date_trunc('month', o.order_purchase_timestamp)::date AS month, sum(oi.price) AS revenue FROM orders o JOIN order_items oi USING (order_id) WHERE o.order_status = 'delivered' GROUP BY 1), g AS (SELECT month, revenue - lag(revenue) OVER (ORDER BY month) AS growth FROM m) SELECT month FROM g WHERE month >= '2017-01-01' AND month < '2018-01-01' ORDER BY growth DESC LIMIT 1", wrong: "WITH m AS (SELECT date_trunc('month', o.order_purchase_timestamp)::date AS month, sum(p.payment_value) AS revenue FROM orders o JOIN order_payments p USING (order_id) WHERE o.order_status = 'delivered' GROUP BY 1), g AS (SELECT month, revenue - lag(revenue) OVER (ORDER BY month) AS growth FROM m) SELECT month FROM g WHERE month >= '2017-01-01' AND month < '2018-01-01' ORDER BY growth DESC LIMIT 1", on: regressed, off: pass },
  { id: "s3-retention-jan-2018", kind: "answerable", question: "Of customers whose first order (of any status) was placed in January 2018, what percentage placed another order, of any status, on a later day within 90 days of that first order?", gold: "WITH o AS (SELECT c.customer_unique_id, o.order_purchase_timestamp::date AS day FROM orders o JOIN customers c USING (customer_id)), f AS (SELECT customer_unique_id, min(day) AS first_day FROM o GROUP BY 1), r AS (SELECT f.customer_unique_id, bool_or(o.day > f.first_day AND o.day <= f.first_day + 90) AS returned FROM f JOIN o USING (customer_unique_id) WHERE f.first_day >= '2018-01-01' AND f.first_day < '2018-02-01' GROUP BY 1) SELECT round(100.0 * count(*) FILTER (WHERE returned) / count(*), 2) AS returned_pct FROM r", wrong: "SELECT round(100.0 * count(*) FILTER (WHERE n > 1) / count(*), 2) AS returned_pct FROM (SELECT customer_id, count(*) AS n FROM orders WHERE order_purchase_timestamp >= '2018-01-01' AND order_purchase_timestamp < '2018-02-01' GROUP BY 1) t", on: gaveUp, off: gaveUp },
  { id: "s3-voucher-revenue-share", kind: "answerable", question: "What percentage of delivered revenue came from orders paid at least partly with a voucher?", gold: "WITH rev AS (SELECT oi.order_id, sum(oi.price) AS revenue FROM order_items oi JOIN orders o USING (order_id) WHERE o.order_status = 'delivered' GROUP BY 1) SELECT round(100.0 * sum(revenue) FILTER (WHERE order_id IN (SELECT order_id FROM order_payments WHERE payment_type = 'voucher')) / sum(revenue), 2) AS voucher_revenue_pct FROM rev", on: pass, off: repaired },
  { id: "s3-top-reviewed-sellers", kind: "answerable", question: "Among sellers with at least 100 delivered orders, which 3 have the highest average review score across their orders, highest first?", gold: "WITH r AS (SELECT DISTINCT ON (order_id) order_id, review_score FROM order_reviews ORDER BY order_id, review_answer_timestamp DESC), so AS (SELECT DISTINCT oi.seller_id, oi.order_id FROM order_items oi JOIN orders o USING (order_id) WHERE o.order_status = 'delivered') SELECT so.seller_id FROM so LEFT JOIN r USING (order_id) GROUP BY 1 HAVING count(*) >= 100 ORDER BY avg(r.review_score) DESC LIMIT 3", wrong: "SELECT oi.seller_id FROM order_items oi JOIN order_reviews r USING (order_id) GROUP BY 1 HAVING count(*) >= 100 ORDER BY avg(r.review_score) DESC LIMIT 3", on: pass, off: confidentlyWrong },
  { id: "a1", kind: "ambiguous", question: "Who are our best customers?", gold: "", on: said("ambiguous"), off: said("ambiguous") },
  { id: "a2", kind: "ambiguous", question: "How are sales doing?", gold: "", on: said("answerable"), off: said("answerable") },
  { id: "a3", kind: "ambiguous", question: "Which products perform best?", gold: "", on: said("ambiguous"), off: said("ambiguous") },
  { id: "a4", kind: "ambiguous", question: "What is our busiest period?", gold: "", on: said("ambiguous"), off: said("answerable") },
  { id: "a5", kind: "ambiguous", question: "Which sellers are the worst?", gold: "", on: said("ambiguous"), off: said("ambiguous") },
  { id: "u1", kind: "unanswerable", question: "What is the profit margin by product category?", gold: "", on: said("unanswerable"), off: said("unanswerable") },
  { id: "u2", kind: "unanswerable", question: "How many people visited the website last month?", gold: "", on: said("unanswerable"), off: said("unanswerable") },
  { id: "u3", kind: "unanswerable", question: "What is the age distribution of our customers?", gold: "", on: said("unanswerable"), off: said("unanswerable") },
  { id: "u4", kind: "unanswerable", question: "Which marketing channel brings in the most customers?", gold: "", on: said("unanswerable"), off: said("unanswerable") },
  { id: "u5", kind: "unanswerable", question: "What percentage of orders were returned for a refund?", gold: "", on: said("unanswerable"), off: said("ambiguous") },
];

function results(memory: boolean): EvalResult[] {
  return QUESTIONS.map((q, i): EvalResult => {
    const o = memory ? q.on : q.off;
    const predicted = o.predicted_kind ?? "answerable";
    const classified = q.kind !== "answerable";
    const tries = Math.max(o.attempts, 1);
    return {
      question_id: q.id,
      question: q.question,
      kind: q.kind,
      predicted_kind: predicted,
      first_try_correct: classified ? predicted === q.kind : o.first_try_correct,
      final_correct: classified ? predicted === q.kind : o.final_correct,
      verified: o.verified,
      attempts: o.attempts,
      cost_usd: Number((0.0012 + 0.0011 * tries + (i % 5) * 0.0003).toFixed(4)),
      latency_ms: 6000 + tries * 9000 + ((i * 7919) % 9000),
      gold_sql: q.gold,
      agent_sql: classified ? "" : o.final_correct ? q.gold : (q.wrong ?? q.gold),
      trace_url: `https://cloud.langfuse.com/project/mock/traces/${memory ? "on" : "off"}-${q.id}`,
    };
  });
}

type Metrics = Omit<EvalRun, "id" | "status" | "started_at" | "finished_at" | "git_sha" | "model" | "split" | "memory">;

const NO_METRICS: Metrics = {
  n: 0, n_answerable: 0, n_ambiguous: 0, n_unanswerable: 0, first_try_acc: null, final_acc: null,
  repair_uplift: null, repair_regressions: null, confidently_wrong: null, clarification_f1: null,
  refusal_acc: null, cost_per_correct: null, p50_ms: null, p95_ms: null,
};

function summarize(rs: EvalResult[]): Metrics {
  const ans = rs.filter((r) => r.kind === "answerable");
  const amb = rs.filter((r) => r.kind === "ambiguous");
  const una = rs.filter((r) => r.kind === "unanswerable");
  const share = (xs: EvalResult[], f: (r: EvalResult) => boolean) => (xs.length ? xs.filter(f).length / xs.length : null);
  const first = share(ans, (r) => r.first_try_correct);
  const final = share(ans, (r) => r.final_correct);
  const tp = amb.filter((r) => r.predicted_kind === "ambiguous").length;
  const predicted = rs.filter((r) => r.predicted_kind === "ambiguous").length;
  const precision = predicted ? tp / predicted : 0;
  const recall = amb.length ? tp / amb.length : 0;
  const correct = ans.filter((r) => r.final_correct).length;
  const latency = rs.map((r) => r.latency_ms).sort((a, b) => a - b);
  const quantile = (p: number) => latency[Math.min(latency.length - 1, Math.floor(p * latency.length))];
  return {
    n: rs.length,
    n_answerable: ans.length,
    n_ambiguous: amb.length,
    n_unanswerable: una.length,
    first_try_acc: first,
    final_acc: final,
    repair_uplift: first === null || final === null ? null : final - first,
    repair_regressions: ans.filter((r) => r.first_try_correct && !r.final_correct).length,
    confidently_wrong: ans.filter((r) => r.verified && !r.final_correct).length,
    clarification_f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    refusal_acc: share(una, (r) => r.predicted_kind === "unanswerable"),
    cost_per_correct: correct ? rs.reduce((s, r) => s + r.cost_usd, 0) / correct : null,
    p50_ms: quantile(0.5),
    p95_ms: quantile(0.95),
  };
}

interface Stored {
  run: EvalRun;
  results: EvalResult[];
  finishesAt?: number;
}

interface Store {
  runs: Stored[];
}

const BASE = { git_sha: "508bdb2", model: "gemini-3.8-flash" };

function seed(): Store {
  const interrupted = results(true).slice(0, 6);
  return {
    runs: [
      {
        run: { id: 1, status: "failed", started_at: "2026-10-15T21:40:00Z", finished_at: "2026-10-15T21:52:00Z", split: "test", memory: true, ...BASE, ...NO_METRICS, n: interrupted.length },
        results: interrupted,
      },
      {
        run: { id: 2, status: "done", started_at: "2026-10-16T01:05:00Z", finished_at: "2026-10-16T01:21:00Z", split: "test", memory: false, ...BASE, ...summarize(results(false)) },
        results: results(false),
      },
      {
        run: { id: 3, status: "done", started_at: "2026-10-16T01:30:00Z", finished_at: "2026-10-16T01:44:00Z", split: "test", memory: true, ...BASE, ...summarize(results(true)) },
        results: results(true),
      },
    ],
  };
}

// On globalThis so every route module (and dev hot reloads) shares one store.
const g = globalThis as typeof globalThis & { __fixpointMockEvals?: Store };
const store = () => (g.__fixpointMockEvals ??= seed());

/** A started run finishes 15 s later, the next time anyone reads it. */
function settle(s: Stored): void {
  if (s.run.status !== "running" || !s.finishesAt || Date.now() < s.finishesAt) return;
  s.results = results(s.run.memory);
  s.run = { ...s.run, status: "done", finished_at: new Date().toISOString(), ...summarize(s.results) };
}

export function listRuns(): EvalRun[] {
  const { runs } = store();
  runs.forEach(settle);
  return runs.map((s) => s.run).reverse();
}

export function getRun(id: number): RunDetail | null {
  const s = store().runs.find((r) => r.run.id === id);
  if (!s) return null;
  settle(s);
  return { run: s.run, results: s.results };
}

/** Starts a run, or returns null when one is already running (the API answers 409). */
export function startRun(split: Split, memory: boolean): { id: number } | null {
  const { runs } = store();
  runs.forEach(settle);
  if (runs.some((s) => s.run.status === "running")) return null;
  const id = Math.max(...runs.map((s) => s.run.id)) + 1;
  runs.push({
    run: { id, status: "running", started_at: new Date().toISOString(), finished_at: null, split, memory, ...BASE, ...NO_METRICS },
    results: [],
    finishesAt: Date.now() + 15_000,
  });
  return { id };
}
