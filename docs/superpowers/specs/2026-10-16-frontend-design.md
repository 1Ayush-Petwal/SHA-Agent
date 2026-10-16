# Fixpoint frontend design

Date: 2026-10-16. Parent PRD: GitHub issue #1 (Frontend, API and Testing sections).

## Goal

A Next.js frontend for Fixpoint (Chat and Evals pages) that is built and checked while the backend API is still in progress, and that works against the real API by setting one env var, with no rewrite.

## Decisions

- Location `frontend/` at repo root, deployed to Vercel. pnpm, Next.js App Router, TypeScript, Tailwind, shadcn/ui, Recharts.
- **Mock mode.** `lib/api.ts` uses `NEXT_PUBLIC_API_URL`, and falls back to `/api/mock` when it is unset. The mock is a set of Next route handlers under `app/api/mock/` that emit real SSE (`/ask`) and JSON (evals, memory), so the production fetch and SSE parsing path is exercised from day one. To remove the mock, delete that folder.
- Types in `lib/types.ts` are maintained by hand (PRD decision). Chat types mirror `backend/src/fixpoint/agent.py` (`StepEvent`, `Answer`, `Chart`, `Memory`). Eval types follow the contract below, which the backend will match.
- Admin token is stored in localStorage and sent as the `X-Admin-Token` header. A header control enters or clears it. Admin-only controls render only when it is set (the server still enforces it).
- Visual: shadcn neutral theme, light and dark following the system, monospace SQL. Single column on mobile; wide tables scroll inside their card, never the page.

## API contract

`POST /ask {question}` returns `text/event-stream`, read with fetch (not EventSource). Each event is `data: <json>\n\n`, where the JSON has a `type` field:

- `step`: `{type, node, attempt, summary, detail}`. `node` is one of planner, coder, executor, verifier, debugger, explainer.
- `answer` (once): `{type, kind, text, sql, columns, rows, truncated, chart{type,x,y}, warnings, memories_used[{question,sql,score}], options, refusal_reason, closest_question, verified, attempts, cost_usd, trace_url}`
- `error`: `{type, message}`
- HTTP 429 before the stream: `{detail, retry_after_s?}`

Eval and memory endpoints (proposed here; the backend will implement them to match):

- `GET /evals/runs` returns `EvalRun[]`, newest first:
  `id, status ("running"|"done"|"failed"), started_at, finished_at|null, git_sha, model, split ("train"|"test"|"all"), memory (bool), n, n_answerable, first_try_acc, final_acc, repair_uplift, repair_regressions, confidently_wrong, clarification_f1, refusal_acc, cost_per_correct, p50_ms, p95_ms`. Accuracies are 0..1; any metric may be null while a run is running.
- `GET /evals/runs/{id}` returns `{run: EvalRun, results: EvalResult[]}`, where each `EvalResult` is
  `question_id, question, kind (gold label), predicted_kind, first_try_correct, final_correct, verified, attempts, cost_usd, latency_ms, gold_sql, agent_sql, trace_url|null`
- `POST /evals/runs {split, memory}` (admin) returns 202 `{id}`, or 409 when a run is already in progress.
- `POST /memory {question, sql}` (admin) returns `{status: "inserted"|"merged"}`.

## Chat page

- A session-only list of turns, each a question, its live steps and its answer. Nothing is persisted.
- An empty state with example questions (taken from the golden set wording) that run when clicked.
- Step timeline: steps are grouped by attempt. Each shows its node, the summary, and the detail (SQL, failure) in an expandable block. A repair (debugger) or a replan (planner after attempt 1) is visually distinct.
- Answer card, by variant:
  - verified answerable: explanation text, chart (bar or line per `chart`; none when `chart.type` is `table`), table, SQL (collapsible, copy button), memories used, cost, attempts and a trace link
  - unverified: an amber banner, "Not verified after N attempts", above the same content
  - ambiguous: the text plus option chips; a click asks that option as a new question
  - unanswerable: the reason, plus the closest question as a chip
- Warnings render as callouts. Truncated shows "showing first 500 rows; full result exceeds 10,000".
- A new question, or leaving the page, aborts the in-flight fetch (AbortController), which cancels the server run.
- Errors: an `error` event shows inline on the turn. A 429 shows a friendly "rate limit reached, try again in X". A network failure shows a retry button.
- Admin: "Save to memory" on verified answers only, showing inserted or merged.

## Evals pages

- `/evals`:
  - the runs table: date, git SHA, model, split, memory, status, first-try and final accuracy, repair uplift, clarification F1, refusal accuracy, cost per correct, p50 and p95 latency
  - every accuracy is shown with its n (e.g. `70% (n=10)`)
  - a comparison card for the latest done memory-on and memory-off runs on the same split, side by side
  - the admin run button (split select and memory toggle). A 409 shows "a run is already in progress".
- `/evals/[id]`:
  - the run summary, including confidently wrong and repair regressions
  - the per-question table: kind, predicted kind, first try, final, verified, attempts, cost, latency, trace link
  - badges for confidently wrong (verified but wrong) and regression (right first, wrong final)
  - expanding a row shows gold SQL and agent SQL side by side
- Both pages poll every 5 s while any run shown is `running`.

## Mock data

The mock covers every UI state:

- `/ask` cases, picked by keyword in the question, each with realistic step pacing (~300-800 ms per step):
  - verified first try with a bar chart
  - a line trend with a partial-month warning
  - repaired on attempt 2 (SQL error, then debugger)
  - a replan after the same signature twice
  - unverified after 3 attempts
  - ambiguous
  - unanswerable
  - truncated
  - an `error` event
  - a 429
- Evals mock: one done memory-on run, one done memory-off run, one failed run, and a POST that creates a running run which completes after ~15 s. The detail view includes confidently-wrong and regression rows.

## Testing

- `tsc --noEmit`, `next lint` (or eslint), and `next build` must pass.
- `lib/sse.test.ts`, run by Node's built-in test runner (`node --test`, native TS type stripping, no new dependency). It covers events split across chunks, multiple events in one chunk, a trailing partial event and an `error` event.
- E2E by hand in a real browser in mock mode at 1280 px and 390 px widths, through every chat variant and both eval pages.

## Out of scope

- A CI workflow file (to be added alongside backend CI in one workflow)
- Playwright (deferred by the PRD)
- Auth beyond the admin token
- Chat persistence
