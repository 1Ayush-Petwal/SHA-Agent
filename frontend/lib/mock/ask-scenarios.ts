import type { Answer, AskEvent, StepEvent } from "../types.ts";

/** What the mock /ask does with a question: stream events, or answer with an HTTP status before streaming. */
export type Scripted = { kind: "stream"; events: AskEvent[] } | { kind: "status"; status: number; body: unknown };

const step = (node: StepEvent["node"], attempt: number, summary: string, detail = ""): StepEvent => ({
  type: "step",
  node,
  attempt,
  summary,
  detail,
});
const trace = (id: string) => `https://cloud.langfuse.com/project/mock/traces/${id}`;
const stream = (...events: AskEvent[]): Scripted => ({ kind: "stream", events });

function answer(a: Partial<Answer> & Pick<Answer, "kind" | "text">): Answer {
  return {
    type: "answer",
    sql: "",
    columns: [],
    rows: [],
    truncated: false,
    chart: { type: "table", x: null, y: [] },
    warnings: [],
    memories_used: [],
    options: [],
    refusal_reason: "",
    closest_question: "",
    verified: false,
    attempts: 0,
    cost_usd: 0,
    trace_url: null,
    ...a,
  };
}

const BLACK_FRIDAY_SQL = `SELECT count(*) AS orders
FROM orders
WHERE order_purchase_timestamp::date = '2017-11-24'`;

function blackFriday(): Scripted {
  return stream(
    step("planner", 0, "Plan: answerable", "Count orders whose purchase date is 24 November 2017."),
    step("coder", 1, "Wrote SQL", `Using 1 similar verified queries\n${BLACK_FRIDAY_SQL}`),
    step("executor", 1, "1 rows"),
    step("verifier", 1, "Checks passed"),
    step("explainer", 1, "Explained"),
    answer({
      kind: "answerable",
      text: "1,176 orders were placed on Black Friday 2017 (24 November 2017).",
      sql: BLACK_FRIDAY_SQL,
      columns: ["orders"],
      rows: [[1176]],
      verified: true,
      attempts: 1,
      cost_usd: 0.0019,
      trace_url: trace("black-friday"),
      memories_used: [
        { question: "How many orders are there in total?", sql: "SELECT count(*) AS orders FROM orders", score: 0.81 },
      ],
    }),
  );
}

const PAYMENT_SQL = `SELECT payment_type, count(*) AS payments
FROM order_payments
GROUP BY payment_type
ORDER BY payments DESC`;

function paymentTypes(): Scripted {
  return stream(
    step("planner", 0, "Plan: answerable", "Count payment rows per payment type."),
    step("coder", 1, "Wrote SQL", PAYMENT_SQL),
    step("executor", 1, "5 rows"),
    step("verifier", 1, "Checks passed"),
    step("explainer", 1, "Explained"),
    answer({
      kind: "answerable",
      text: "Credit card is by far the most used payment type with 76,795 payments, followed by boleto with 19,784. Only 3 payments have no defined type.",
      sql: PAYMENT_SQL,
      columns: ["payment_type", "payments"],
      rows: [
        ["credit_card", 76795],
        ["boleto", 19784],
        ["voucher", 5775],
        ["debit_card", 1529],
        ["not_defined", 3],
      ],
      chart: { type: "bar", x: "payment_type", y: ["payments"] },
      verified: true,
      attempts: 1,
      cost_usd: 0.0023,
      trace_url: trace("payment-types"),
    }),
  );
}

const MONTHLY: [string, number][] = [
  ["2016-09", 4], ["2016-10", 324], ["2016-12", 1], ["2017-01", 800], ["2017-02", 1780], ["2017-03", 2682],
  ["2017-04", 2404], ["2017-05", 3700], ["2017-06", 3245], ["2017-07", 4026], ["2017-08", 4331],
  ["2017-09", 4285], ["2017-10", 4631], ["2017-11", 7544], ["2017-12", 5673], ["2018-01", 7269],
  ["2018-02", 6728], ["2018-03", 7211], ["2018-04", 6939], ["2018-05", 6873], ["2018-06", 6167],
  ["2018-07", 6292], ["2018-08", 6512], ["2018-09", 16], ["2018-10", 4],
];
const MONTHLY_SQL = `SELECT date_trunc('month', order_purchase_timestamp) AS month, count(*) AS orders
FROM orders
GROUP BY 1
ORDER BY 1`;

function monthly(): Scripted {
  const warning =
    "partial_period: 2016-09, 2016-10, 2016-12, 2018-09, 2018-10 have under 10% of the median volume, likely incomplete";
  return stream(
    step("planner", 0, "Plan: answerable", "Truncate purchase timestamps to months.\nCount orders per month."),
    step("coder", 1, "Wrote SQL", MONTHLY_SQL),
    step("executor", 1, "25 rows"),
    step("verifier", 1, "Checks passed", warning),
    step("explainer", 1, "Explained", warning),
    answer({
      kind: "answerable",
      text: "Orders grew from 800 in January 2017 to a peak of 7,544 in November 2017, the Black Friday month, then held between 6,167 and 7,269 a month through August 2018. The first and last few months are incomplete data, not real drops.",
      sql: MONTHLY_SQL,
      columns: ["month", "orders"],
      rows: MONTHLY.map(([m, n]) => [`${m}-01T00:00:00`, n]),
      chart: { type: "line", x: "month", y: ["orders"] },
      warnings: [warning],
      verified: true,
      attempts: 1,
      cost_usd: 0.0031,
      trace_url: trace("monthly"),
    }),
  );
}

const REVIEW_SQL_BAD = `SELECT p.product_category_name_english AS category, round(avg(r.review_score), 2) AS avg_review_score
FROM order_reviews r
JOIN order_items oi USING (order_id)
JOIN products p USING (product_id)
GROUP BY 1
ORDER BY 2 DESC`;
const REVIEW_SQL = `WITH r AS (
  SELECT DISTINCT ON (order_id) order_id, review_score
  FROM order_reviews
  ORDER BY order_id, review_answer_timestamp DESC
), oc AS (
  SELECT DISTINCT oi.order_id,
         COALESCE(t.product_category_name_english, p.product_category_name, 'unknown') AS category
  FROM order_items oi
  JOIN products p USING (product_id)
  LEFT JOIN product_category_name_translation t USING (product_category_name)
)
SELECT category, round(avg(r.review_score), 2) AS avg_review_score, count(*) AS orders
FROM oc JOIN r USING (order_id)
GROUP BY 1
HAVING count(*) >= 500
ORDER BY 2 DESC`;

function reviewScore(): Scripted {
  return stream(
    step(
      "planner",
      0,
      "Plan: answerable",
      "Deduplicate reviews to one per order.\nMap each order to its categories, with English names.\nAverage the review score per category with at least 500 orders.",
    ),
    step("coder", 1, "Wrote SQL", REVIEW_SQL_BAD),
    step("executor", 1, "Failed", "UndefinedColumn: column p.product_category_name_english does not exist"),
    step(
      "debugger",
      2,
      "Repair: English names live in product_category_name_translation, and reviews need one row per order",
      REVIEW_SQL,
    ),
    step("executor", 2, "8 rows"),
    step("verifier", 2, "Checks passed"),
    step("explainer", 2, "Explained"),
    answer({
      kind: "answerable",
      text: "Among categories with at least 500 orders, books (general interest) has the highest average review score at 4.45, and bed, bath and table the lowest at 3.92. Reviews were deduplicated to one per order first.",
      sql: REVIEW_SQL,
      columns: ["category", "avg_review_score", "orders"],
      rows: [
        ["books_general_interest", "4.45", 518],
        ["luggage_accessories", "4.32", 1027],
        ["health_beauty", "4.19", 8650],
        ["sports_leisure", "4.17", 7530],
        ["toys", "4.16", 3830],
        ["housewares", "4.11", 5800],
        ["computers_accessories", "3.98", 6530],
        ["bed_bath_table", "3.92", 9300],
      ],
      chart: { type: "bar", x: "category", y: ["avg_review_score", "orders"] },
      verified: true,
      attempts: 2,
      cost_usd: 0.0058,
      trace_url: trace("review-score"),
    }),
  );
}

const REVENUE_SQL = `SELECT COALESCE(t.product_category_name_english, p.product_category_name, 'unknown') AS category,
       sum(oi.price) AS revenue
FROM order_items oi
JOIN orders o USING (order_id)
JOIN products p USING (product_id)
LEFT JOIN product_category_name_translation t USING (product_category_name)
WHERE o.order_status = 'delivered'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 8`;

function categoryRevenue(): Scripted {
  return stream(
    step("planner", 0, "Plan: answerable", "Sum item prices of delivered orders per English category name."),
    step("coder", 1, "Wrote SQL", REVENUE_SQL),
    step("executor", 1, "8 rows"),
    step("verifier", 1, "Checks passed"),
    step("explainer", 1, "Explained"),
    answer({
      kind: "answerable",
      text: "Health and beauty brings in the most delivered revenue at 1,233,131.72, just ahead of watches and gifts at 1,166,176.98. Revenue here is item price only, without freight.",
      sql: REVENUE_SQL,
      columns: ["category", "revenue"],
      rows: [
        ["health_beauty", "1233131.72"],
        ["watches_gifts", "1166176.98"],
        ["bed_bath_table", "1023434.76"],
        ["sports_leisure", "954852.55"],
        ["computers_accessories", "888724.61"],
        ["furniture_decor", "711927.69"],
        ["housewares", "615628.69"],
        ["cool_stuff", "610204.10"],
      ],
      chart: { type: "bar", x: "category", y: ["revenue"] },
      verified: true,
      attempts: 1,
      cost_usd: 0.0027,
      trace_url: trace("category-revenue"),
    }),
  );
}

const TOP_CUSTOMERS_SQL = `SELECT c.customer_unique_id, sum(oi.price) AS spend
FROM orders o
JOIN customers c USING (customer_id)
JOIN order_items oi USING (order_id)
WHERE o.order_status = 'delivered'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10`;

function topCustomers(): Scripted {
  const ids = [
    "0a0a92112bd4c708ca5fde585afaa872", "da122df9eeddfedc1dc1f5349a1a690c", "763c8b1c9c68a0229c42c9fc6f662b93",
    "dc4802a71eae9be1dd28f5d788ceb526", "459bef486812aa25204be022145caa62", "ff4159b92c40ebe40454e3e6a7c35ed6",
    "4007669dec559734d6f53e029e360987", "5d0a2980b292d049061542014e8960bf", "eebb5dda148d3893cdaf5b5ca3040ccb",
    "48e1ac109decbb87765a3eade6854098",
  ];
  const spend = ["13440.00", "7388.00", "6735.00", "6729.00", "6499.00", "6350.00", "6300.00", "5934.60", "4690.00", "4590.00"];
  return stream(
    step("planner", 0, "Plan: answerable", "Sum item prices of delivered orders per person (customer_unique_id).\nKeep the top 10."),
    step("coder", 1, "Wrote SQL", TOP_CUSTOMERS_SQL),
    step("executor", 1, "10 rows"),
    step("verifier", 1, "Checks passed"),
    step("explainer", 1, "Explained"),
    answer({
      kind: "answerable",
      text: "The biggest spender bought 13,440.00 in delivered items, almost twice the next customer at 7,388.00. The rest of the top 10 spent between 4,590.00 and 6,735.00.",
      sql: TOP_CUSTOMERS_SQL,
      columns: ["customer_unique_id", "spend"],
      rows: ids.map((id, i) => [id, spend[i]]),
      chart: { type: "bar", x: "customer_unique_id", y: ["spend"] },
      verified: true,
      attempts: 1,
      cost_usd: 0.0024,
      trace_url: trace("top-customers"),
    }),
  );
}

function ambiguous(): Scripted {
  return stream(
    step("planner", 0, "Plan: ambiguous"),
    answer({
      kind: "ambiguous",
      text: "This could mean a few things. Which did you mean?",
      options: [
        "Which 10 customers have spent the most on delivered orders?",
        "Which 10 customers have placed the most orders?",
        "How many customers have placed more than one order?",
      ],
      cost_usd: 0.0011,
      trace_url: trace("best-customers"),
    }),
  );
}

function unanswerable(): Scripted {
  const reason = "The warehouse has prices and freight, but no product costs, so margin can't be computed.";
  const closest = "What is the delivered revenue by product category?";
  return stream(
    step("planner", 0, "Plan: unanswerable"),
    answer({
      kind: "unanswerable",
      text: `I can't answer that from this data. ${reason} The closest question I can answer: ${closest}`,
      refusal_reason: reason,
      closest_question: closest,
      cost_usd: 0.0009,
      trace_url: trace("profit"),
    }),
  );
}

const REPEAT_SQL_1 = `SELECT c.customer_unique_id, sum(p.payment_value) AS revenue
FROM orders o
JOIN customers c USING (customer_id)
JOIN order_items oi USING (order_id)
JOIN order_payments p USING (order_id)
GROUP BY c.customer_unique_id, oi.order_item_id`;
const REPEAT_SQL_2 = `SELECT c.customer_unique_id, sum(p.payment_value) AS revenue
FROM orders o
JOIN customers c USING (customer_id)
JOIN order_payments p USING (order_id)
JOIN order_items oi USING (order_id)
GROUP BY c.customer_unique_id, p.payment_sequential`;
const REPEAT_SQL_3 = `WITH per_order AS (
  SELECT o.order_id, c.customer_unique_id, sum(oi.price) AS revenue
  FROM orders o
  JOIN customers c USING (customer_id)
  JOIN order_items oi USING (order_id)
  WHERE o.order_status = 'delivered'
  GROUP BY 1, 2
), people AS (
  SELECT customer_unique_id, count(*) AS orders, sum(revenue) AS revenue
  FROM per_order
  GROUP BY 1
)
SELECT round(100.0 * sum(revenue) FILTER (WHERE orders > 1) / sum(revenue), 2) AS repeat_revenue_pct
FROM people`;

function replan(): Scripted {
  const dup = "grain_duplicates: 2997 duplicate rows on ['customer_unique_id']: a fan-out join or a missing GROUP BY";
  return stream(
    step("planner", 0, "Plan: answerable", "Sum payments per customer.\nSplit customers into one-time and repeat."),
    step("coder", 1, "Wrote SQL", REPEAT_SQL_1),
    step("executor", 1, "98666 rows"),
    step("verifier", 1, "Failed", dup),
    step("debugger", 2, "Repair: join payments before items so each payment counts once", REPEAT_SQL_2),
    step("executor", 2, "99440 rows"),
    step("verifier", 2, "Failed", dup),
    step(
      "planner",
      2,
      "Plan: answerable",
      "Aggregate revenue per order first, from items, not payments.\nThen aggregate per person (customer_unique_id).\nShare of revenue from people with more than one order.",
    ),
    step("coder", 3, "Wrote SQL", REPEAT_SQL_3),
    step("executor", 3, "1 rows"),
    step("verifier", 3, "Checks passed"),
    step("explainer", 3, "Explained"),
    answer({
      kind: "answerable",
      text: "Repeat customers bring in 5.81% of delivered revenue.",
      sql: REPEAT_SQL_3,
      columns: ["repeat_revenue_pct"],
      rows: [["5.81"]],
      verified: true,
      attempts: 3,
      cost_usd: 0.0094,
      trace_url: trace("replan"),
    }),
  );
}

const LATE_SQL = `SELECT oi.seller_id,
       100.0 * count(*) FILTER (WHERE o.order_delivered_customer_date > o.order_estimated_delivery_date)
         / count(DISTINCT o.order_id) AS late_pct
FROM orders o
JOIN order_items oi USING (order_id)
GROUP BY 1
ORDER BY 2 DESC
LIMIT 12`;

function unverified(): Scripted {
  const tried = [
    "Attempt 1: empty_result: 0 rows, but many expected",
    "Attempt 2: division by zero",
    "Attempt 3: range: metric late_pct is a percentage outside 0-100",
    "Attempt 4: range: metric late_pct is a percentage outside 0-100",
  ];
  const list = tried.map((t) => `- ${t}`).join("\n");
  return stream(
    step("planner", 0, "Plan: answerable", "Late share of delivered orders per seller."),
    step("coder", 1, "Wrote SQL", LATE_SQL.replace("GROUP BY", "WHERE o.order_status = 'late'\nGROUP BY")),
    step("executor", 1, "0 rows"),
    step("verifier", 1, "Failed", "empty_result: 0 rows, but many expected"),
    step("debugger", 2, "Repair: there is no 'late' status; compare delivery and estimated dates", LATE_SQL.replace("count(DISTINCT o.order_id)", "count(o.order_delivered_customer_date) - count(*)")),
    step("executor", 2, "Failed", "DivisionByZero: division by zero"),
    step("debugger", 3, "Repair: divide by delivered orders instead", LATE_SQL),
    step("executor", 3, "12 rows"),
    step("verifier", 3, "Failed", "range: metric late_pct is a percentage outside 0-100"),
    step("debugger", 4, "Repair (strong model): count late items per distinct order", LATE_SQL),
    step("executor", 4, "12 rows"),
    step("verifier", 4, "Failed", "range: metric late_pct is a percentage outside 0-100"),
    step("explainer", 4, "Gave up: unverified", list),
    answer({
      kind: "answerable",
      text: `I could not verify an answer after 4 attempts, so treat any result as unverified. What I tried:\n${list}`,
      sql: LATE_SQL,
      columns: ["seller_id", "late_pct"],
      rows: Array.from({ length: 12 }, (_, i) => [`seller_${String(i + 1).padStart(2, "0")}`, (180 - i * 13).toFixed(1)]),
      chart: { type: "bar", x: "seller_id", y: ["late_pct"] },
      verified: false,
      attempts: 4,
      cost_usd: 0.0211,
      trace_url: trace("unverified"),
    }),
  );
}

function truncated(): Scripted {
  const sql = "SELECT order_id, order_item_id, price\nFROM order_items";
  return stream(
    step("planner", 0, "Plan: answerable", "List every order item with its price."),
    step("coder", 1, "Wrote SQL", sql),
    step("executor", 1, "10001 rows"),
    step("verifier", 1, "Checks passed"),
    step("explainer", 1, "Explained"),
    answer({
      kind: "answerable",
      text: "Here are the order items with their prices. The result is longer than 10,000 rows, so it was cut off.",
      sql,
      columns: ["order_id", "order_item_id", "price"],
      rows: Array.from({ length: 500 }, (_, i) => [
        (0x10000000 + i * 7919).toString(16).padEnd(32, "a"),
        1 + (i % 3),
        (9.9 + ((i * 37) % 400)).toFixed(2),
      ]),
      truncated: true,
      verified: true,
      attempts: 1,
      cost_usd: 0.0018,
      trace_url: trace("truncated"),
    }),
  );
}

const streamError = (): Scripted =>
  stream(
    step("planner", 0, "Plan: answerable", "Count orders."),
    { type: "error", message: "The model provider returned an error. Try again in a moment." },
  );

const dropped = (): Scripted =>
  stream(step("planner", 0, "Plan: answerable", "Count orders."), step("coder", 1, "Wrote SQL", "SELECT count(*) FROM orders"));

const rateLimited = (): Scripted => ({
  kind: "status",
  status: 429,
  body: { detail: "Rate limit reached", retry_after_s: 1740 },
});

/** Keyword (lowercase substring of the question) to scenario, first match wins. `mock ...` triggers reach states no example does. */
export const SCENARIOS: [string, () => Scripted][] = [
  ["mock 429", rateLimited],
  ["mock error", streamError],
  ["mock drop", dropped],
  ["mock replan", replan],
  ["mock unverified", unverified],
  ["mock truncated", truncated],
  ["black friday", blackFriday],
  ["payment type", paymentTypes],
  ["each month", monthly],
  ["review score", reviewScore],
  ["best customers", ambiguous],
  ["profit", unanswerable],
  ["revenue by product category", categoryRevenue],
  ["spent the most", topCustomers],
];

export function scenarioFor(question: string): Scripted {
  const q = question.toLowerCase();
  return (SCENARIOS.find(([key]) => q.includes(key))?.[1] ?? paymentTypes)();
}
