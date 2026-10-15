# Fixpoint — Self-Healing Data Analyst: Project Spec

Oct 8, 2026 · @Ankur

## Summary

Fixpoint is a self-healing data analyst. A business user asks a question in plain English; a team of agents writes SQL and Python, runs it in a sandbox against the company warehouse, checks the result, repairs its own mistakes and answers with a chart and an explanation. It is built in Python to evidence every line of the Illuminati Consulting LLM Engineer JD.

It heals at three levels:

1. **Within a question.** A failed run or a failed check goes to a Debugger agent, which repairs and reruns, up to 3 attempts, escalating to a stronger model on the last one.
2. **Across questions.** Every verified query and every error-to-fix lesson is stored in a vector index and retrieved for similar future questions, so accuracy rises as the memory fills.
3. **Across time.** Saved reports run nightly. When a schema change breaks one, Fixpoint repairs it, proves the repair reproduces the last known-good numbers, and asks for approval in Slack before replacing it.

The finished project has to show five measured results, not claims:

- accuracy on a 200-question business golden set and on BIRD Mini-Dev (PostgreSQL), first attempt versus after repair
- a learning curve: accuracy against questions seen, with and without memory
- heal rate and false-heal rate on 20 injected schema changes
- cost per correct answer across 3 models, before and after routing and caching
- FAISS versus Chroma versus Pinecone on recall@10, p95 latency and cost



## Business problem and success metrics

The client is a mid-size e-commerce marketplace, modelled on Olist, whose data team is the bottleneck for every business question. Category managers, ops leads and finance wait days for answers to ad-hoc questions, and saved reports break silently whenever the warehouse schema changes.

Fixpoint answers routine questions directly, asks when a business term is ambiguous, refuses when the data cannot answer, and keeps saved reports running through schema changes. Baselines are measured in phase 1 and in the pilot, never assumed; targets are relative to them.


| Metric                    | How it is measured                                      | Target                                                   |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Answer accuracy           | Execution match on the golden-set test split            | +10 points over a single-shot baseline on the same model |
| Confidently wrong answers | Wrong answers marked as verified                        | 5% or less                                               |
| Clarification quality     | Asked when the gold label says ambiguous, not otherwise | F1 0.8 or higher                                         |
| Refusal accuracy          | Unanswerable questions correctly declined               | 90% or higher                                            |
| Time to answer            | p50 and p95 wall clock, question to answer              | p50 under 60 s                                           |
| Cost per correct answer   | Langfuse token cost divided by correct answers          | Cut 40% or more by routing and caching                   |
| Report heal rate          | Injected schema breakages repaired and approved         | 80% or higher                                            |
| False heals               | A repaired report that changes historical numbers       | 0 auto-applied                                           |
| Safety                    | PII leaked, write statements executed                   | 0 and 0                                                  |
| Pilot task success        | Pilot users who got a correct answer without help       | 70% or higher                                            |


Out of scope: writing to the warehouse, real-time dashboards, and replacing a BI tool.

## Datasets

Fixpoint runs on one real marketplace warehouse (Olist, 99,441 orders), a second warehouse it never sees during development (AdventureWorks), public benchmarks for credibility, and corpora you write yourself. Olist counts below were computed from the CSVs on 8 Oct 2026.

### Public data


| Dataset                                                                                 | Size                                                                                   | License                                                                                                    | Used for                                                                                     |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Olist Brazilian E-Commerce](https://github.com/olist/work-at-olist-data)               | 9 tables, 99,441 orders, Sep 2016 to Oct 2018, 120 MB                                  | MIT (Olist's own repo; same tables on Kaggle as olistbr/brazilian-ecommerce)                               | The main warehouse                                                                           |
| [Olist Marketing Funnel](https://github.com/Catherinedataa/Olist-Sales-Funnel-Analysis) | 8,000 qualified leads, 842 closed deals; joins on sellerid                             | Check the Kaggle page (olistbr/marketing-funnel-olist)                                                     | A second subject area: lead-to-seller funnel questions                                       |
| [AdventureWorks for Postgres](https://github.com/lorint/AdventureWorks-for-Postgres)    | 68 tables in 5 schemas, about 20,000 customers, 31,000 sales                           | Microsoft sample data; the converter repo is all rights reserved, so run it locally, don't redistribute it | Unseen second tenant: generalization and multi-tenant demo                                   |
| TPC-H via DuckDB's tpch extension                                                       | Scale factor 1, about 6M lineitem rows                                                 | TPC sample generator                                                                                       | Load tests for timeouts, row limits and the EXPLAIN cost guard                               |
| [BIRD Mini-Dev](https://github.com/bird-bench/mini_dev)                                 | 500 question-SQL pairs, 11 databases, PostgreSQL split, expert "evidence" per question | CC BY-SA 4.0                                                                                               | External accuracy number; published GPT-4 baseline is 35.8% execution accuracy on PostgreSQL |
| [BIRD-CRITIC-PG](https://arxiv.org/html/2506.18951v2)                                   | 530 PostgreSQL debugging tasks from real StackOverflow issues, scored by test cases    | See bird-critic.github.io                                                                                  | The Debugger agent measured on its own                                                       |
| [BIRD-Interact-Lite](https://arxiv.org/abs/2510.05318v2)                                | 300 tasks, 18 databases, PostgreSQL 14, with a user simulator                          | CC BY-SA 4.0 (paper)                                                                                       | Stretch: the Clarifier on ambiguous, multi-turn tasks                                        |
| [DABstep](https://huggingface.co/blog/dabstep)                                          | 450+ tasks; payments.csv of about 138k transactions plus manual.md of business rules   | See the dataset card                                                                                       | The pandas path: multi-step analysis that needs a manual retrieved                           |
| [deepset/prompt-injections](https://huggingface.co/datasets/deepset/prompt-injections)  | Under 1,000 labeled prompts                                                            | Apache-2.0                                                                                                 | Scoring the prompt-injection guardrail                                                       |
| PostgreSQL 16 docs, pandas API reference                                                | Functions, date/time, window-function chapters; pandas API pages                       | PostgreSQL License, BSD-3                                                                                  | The Debugger's documentation index                                                           |


```bash
git clone --depth 1 https://github.com/olist/work-at-olist-data           # 9 Olist CSVs
kaggle datasets download -d olistbr/marketing-funnel-olist                  # funnel add-on
python -c "from datasets import load_dataset; load_dataset('birdsql/bird_mini_dev')"   # split mini_dev_pg
# BIRD Mini-Dev databases: the 'Complete Package' link in the mini_dev README
huggingface-cli download adyen/DABstep --repo-type dataset --local-dir data/dabstep
huggingface-cli download deepset/prompt-injections --repo-type dataset --local-dir data/injections
duckdb -c "INSTALL tpch; LOAD tpch; CALL dbgen(sf=1); EXPORT DATABASE 'data/tpch' (FORMAT parquet);"
# AdventureWorks: download AdventureWorks-oltp-install-script.zip from Microsoft's sql-server-samples
# releases, then: ruby update_csvs.rb && psql -d Adventureworks < install.sql
```



### Data you create


| Corpus              | Contents                                                                                                                                                                          | Used for                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Data dictionary     | dbt-style schema.yml for 9 tables and 52 columns, each trap below written into the column notes                                                                                   | Schema-linking index                         |
| Metric glossary     | About 40 metrics (GMV, AOV, repeat purchase rate, on-time delivery, late-delivery review gap, seller churn, cohort retention), each with definition, SQL template, owner, version | Glossary index; the business owns it         |
| Golden set          | 200 questions: 150 answerable in 3 tiers, 30 ambiguous, 20 unanswerable; gold SQL and a result snapshot each; 70/30 train/test split                                              | Accuracy, clarification and refusal metrics  |
| Verified-query seed | The 105 train-split golden questions with their SQL                                                                                                                               | Starting memory; grows with approved answers |
| Saved reports       | 10 recurring reports (weekly GMV by state, late deliveries by seller, review trend)                                                                                               | Nightly runs and drift healing               |
| Drift scenarios     | 20 migration scripts: renamed column, split table, type change, cents vs reais, new soft-delete flag, timezone shift                                                              | Heal-rate and false-heal metrics             |
| Replay feed         | Olist orders replayed one day at a time so "today" moves, plus 10 labeled injected anomalies                                                                                      | Scheduled reports and the anomaly tool       |
| Synthetic PII       | Faker ptBR names, emails, phones and CPF numbers added to customers                                                                                                               | PII masking tests with Presidio              |
| Red-team set        | 50 hostile prompts plus 30 instructions planted in review comments                                                                                                                | Guardrail tests                              |




### Traps in the Olist data, verified

These are why the Verifier, the glossary and the lessons memory exist. Each becomes a golden-set question and a data-dictionary note.


| Trap                    | Evidence in the files                                                                                     | What Fixpoint must do                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| customerid is per order | 99,441 customerid values but 96,096 customeruniqueid; only 2,997 people (3.1%) ordered twice              | Use customeruniqueid for any per-person metric    |
| Item rows fan out joins | 9,803 orders have more than one row in orderitems                                                         | Aggregate items before joining payments           |
| Split payments          | 2,961 orders have more than one payment row                                                               | Sum payments per order first                      |
| Duplicate reviews       | 99,224 review rows, 98,410 unique reviewid; 547 orders reviewed twice                                     | Deduplicate before averaging scores               |
| Geolocation fan-out     | 1,000,163 rows for 19,015 zip prefixes                                                                    | Aggregate to one point per prefix before joining  |
| Order status            | 96,478 delivered, 625 canceled; 8 delivered orders have no delivery date                                  | Glossary says which statuses count as a sale      |
| Portuguese categories   | 73 categories, 71 translations; pcgamer and one kitchen category untranslated; 610 products uncategorized | Join the translation table, keep a fallback name  |
| Misspelled columns      | productnamelenght, productdescriptionlenght                                                               | Schema linker must match the real spelling        |
| Partial periods         | 4 orders in Sep 2016, none in Nov 2016, 16 in Sep 2018, 4 in Oct 2018                                     | Flag partial months in any trend                  |
| A real anomaly          | 24 Nov 2017 (Black Friday): 1,176 orders against a median day of 148                                      | The anomaly tool must find it unprompted          |
| Free text               | 40,977 review comments in Portuguese                                                                      | The natural surface for planted prompt injections |




## Architecture

[Image_in/public]: Fixpoint architecture · 5 layers, 2 guarded execution paths

Questions enter through FastAPI or the nightly scheduler; workers run the agent graph, which calls models, retrieval and the two execution paths. Python never connects to the database: it only receives result files.


| Layer                   | Choice                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| Language                | Python 3.12, typed, uv, ruff, mypy, pytest                         |
| API and workers         | FastAPI, Redis, arq                                                |
| Orchestration           | LangGraph, Postgres checkpointer                                   |
| Ingestion               | LlamaIndex (docs index)                                            |
| Models                  | LiteLLM gateway over a frontier, a small and an open-weights model |
| Embeddings and reranker | bge-small-en-v1.5, bge-reranker-base                               |
| Vector stores           | FAISS, Chroma, Pinecone, pgvector                                  |
| Databases               | Postgres 16 for the warehouse and app state                        |
| Sandbox                 | Docker with gVisor; E2B fallback                                   |
| Tracing                 | OpenTelemetry, Langfuse                                            |
| Interfaces              | Slack Bolt, Chainlit, MCP server                                   |
| CI and deploy           | GitHub Actions, GCE VM with Docker Compose                         |




## Agent graph

[embedded content: Agent graph · 10 nodes, 2 human pauses, 1 repair loop

Each node has its own versioned prompt and model tier. The graph state carries the plan, retrieved context, code, results and an attempt counter, checkpointed in Postgres after every node. It pauses for a person twice: to answer a clarifying question, and to approve a memory write.

### LangGraph workflow

[embedded content: LangGraph workflow · 10 nodes, 6 routing functions, 2 interrupts

This is the same graph as LangGraph runs it: node names, the state keys each node writes, and the value each routing function returns. The state and wiring below map one-to-one onto the diagram.

```python
class FixpointState(TypedDict):
    question: str
    user_role: str
    route: Literal["clear", "ambiguous"]
    clarification: str | None
    plan: Plan | None                 # steps, metrics, grain, answerable
    schema_ctx: list[Column]
    examples: list[VerifiedQuery]
    code: str
    lang: Literal["sql", "python"]
    result_path: str | None           # Parquet written by the executor
    error: str | None                 # failure signature, e.g. "42703:column <col> does not exist"
    verdict: Verdict | None           # passed, failed_check
    attempts: int
    last_signature: str | None        # previous failure, to spot a repeat
    answer: Answer | None
    verified: bool
```

```python
g = StateGraph(FixpointState)
for name, fn in NODES.items():        # router, clarifier, planner, schema_linker, coder,
    g.add_node(name, fn)              # executor, verifier, debugger, explainer, memory_writer

g.add_edge(START, "router")
g.add_conditional_edges("router", route_question, {"clear": "planner", "ambiguous": "clarifier"})
g.add_edge("clarifier", "planner")
g.add_conditional_edges("planner", route_plan, {"answerable": "schema_linker", "unanswerable": "explainer"})
g.add_edge("schema_linker", "coder")
g.add_edge("coder", "executor")
g.add_conditional_edges("executor", route_exec, {"ok": "verifier", "error": "debugger"})
g.add_conditional_edges("verifier", route_verify, {"pass": "explainer", "fail": "debugger"})
g.add_conditional_edges("debugger", route_debug, {"retry": "coder", "replan": "planner", "give_up": "explainer"})
g.add_conditional_edges("explainer", route_answer, {"verified": "memory_writer", "unverified": END})
g.add_edge("memory_writer", END)

app = g.compile(checkpointer=checkpointer)   # PostgresSaver, required for interrupt()

def route_debug(s: FixpointState) -> str:
    if s["attempts"] >= 3:
        return "give_up"
    if s["error"] == s["last_signature"]:
        return "replan"
    return "retry"
```



## Sandbox and SQL safety

Generated code can never write to the warehouse, reach the internet, see a credential or run longer than its timeout. SQL and Python take different paths, and Python never touches the database at all: it receives query results as read-only Parquet files.

**SQL path** (a guarded database connection, no container):

1. Parse with sqlglot. Allow exactly one SELECT or WITH statement; reject DML, DDL, COPY and deny-listed functions (pgsleep, pgreadfile, dblink, loimport).
2. Check every table against the caller's role; Postgres row-level security enforces the same rule underneath.
3. Run EXPLAIN (FORMAT JSON) first. Above a cost or estimated-row threshold, send it back to the Coder to narrow, without running it.
4. Execute as fixpointro (SELECT grants only) with statementtimeout 15 s, defaulttransactionreadonly on, and a 10,000-row cap.
5. Write the result to Parquet in the job's workspace and record the query in the audit log.

**Python path** (pandas, statsmodels, scikit-learn, charts):

- A fresh container per job from one pinned image, run under gVisor (runsc), destroyed afterwards; a small pre-warmed pool hides start-up time.
- No network, non-root user, read-only root filesystem, tmpfs /tmp, 1 GB memory, 1 CPU, 128 processes, 30 s wall clock.
- Inputs mounted read-only, one writable output folder; stdout and stderr truncated to 20,000 characters before the model sees them.
- Hosted fallback for the cloud deploy: E2B sandboxes, behind the same runner interface.



## RAG and vector stores

Retrieval decides which tables, metrics, past queries and past fixes the Coder sees. Schema-linking recall is the number every RAG change is judged by: the share of tables and columns in the gold SQL (extracted with sqlglot) that retrieval surfaced.


| Index            | Documents                                                                                   | Chunk                                                         | Retrieved by                         |
| ---------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| Data dictionary  | 9 table docs, 52 column docs, 5 sample values each, English names for Portuguese categories | One column, prefixed with its table summary                   | Schema Linker                        |
| Metric glossary  | About 40 metrics, each with synonyms, definition, SQL template, owner, version, status      | One metric                                                    | Planner and Coder                    |
| Verified queries | Question, SQL, tables used, who verified it and when                                        | One pair, embedded on the question                            | Coder, as top-3 few-shot examples    |
| Lessons          | Error signature, context, failed snippet, fix, success and failure counts                   | One lesson                                                    | Debugger, filtered by SQLSTATE first |
| Docs             | PostgreSQL and pandas pages; the DABstep manual for that benchmark                          | About 400 tokens by section heading, ingested with LlamaIndex | Debugger                             |


**Retrieval pipeline**

1. The Planner splits the question into sub-questions and guesses likely column names (HyDE-style) to search with.
2. Hybrid search: BM25 (hand-written first, then a library) and dense embeddings (bge-small-en-v1.5 locally), fused with reciprocal rank fusion, k = 60.
3. A cross-encoder (bge-reranker-base) reranks the top 30 down to 8 columns or tables.
4. Breadth-first search over the foreign-key graph adds the tables on the shortest join path between the chosen ones.
5. Context is packed to a token budget with a stable prefix (system prompt, schema summary, core glossary) so prompt caching hits.

**Vector store interface.** One class with upsert, query (with metadata filter) and delete, and four backends: FAISS (exact flat index as the baseline, then HNSW), Chroma (persistent, for development), Pinecone serverless (free Starter plan: 2 GB, 5 indexes, AWS us-east-1) and pgvector as a bonus baseline. The benchmark runs the same embeddings and queries through each and reports recall@10 against exact search, p50 and p95 latency, build time and monthly cost.

Retrieval metrics: schema-linking recall@8, MRR for verified-query retrieval, nDCG@10 for docs.

## Self-healing

In-task repair alone is table stakes: an April 2026 report on a self-healing text-to-PostgreSQL pipeline gained 4.6 points on BIRD Mini-Dev and still saw repairs break correct answers. Fixpoint's edge is the two levels above it: memory that compounds, and reports that heal with proof.

### Level 1: repair within a question

Every failure is reduced to a signature before the Debugger sees it. SQL errors use the Postgres SQLSTATE code plus the message with identifiers stripped; Python errors use the exception type plus a normalized message; Verifier failures use the check's name.


| SQLSTATE | Error                     | Typical cause                                    | First repair move                                       |
| -------- | ------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| 42703    | undefinedcolumn           | Guessed or misspelled column (productnamelenght) | Re-run schema linking for that column, retrieve lessons |
| 42P01    | undefinedtable            | Hallucinated or renamed table                    | Re-link against the dictionary                          |
| 42803    | groupingerror             | Column missing from GROUP BY                     | Retrieve lessons; usually mechanical                    |
| 42883    | undefinedfunction         | Another dialect's function (DATEDIFF)            | Retrieve from the PostgreSQL docs index                 |
| 22P02    | invalidtextrepresentation | Bad cast of a text timestamp                     | Cast with totimestamp; check sample values              |
| 22012    | divisionbyzero            | Rate over an empty group                         | Wrap the divisor in NULLIF                              |
| 57014    | querycanceled             | Hit the 15 s timeout                             | Aggregate earlier, add filters, check EXPLAIN           |


Loop rules: at most 3 repairs; the same signature twice sends the question back to the Planner; the third attempt escalates to the stronger model. The first verified result wins, so a repair can never replace a correct answer. Out of budget, Fixpoint says what it tried and that it could not verify an answer, never a silent guess.

### Level 2: memory across questions

- **Writes need proof.** Only results that passed the Verifier and were approved by a user (or matched gold) become verified queries or lessons.
- **Deduplicate.** A new item within cosine 0.92 of an existing one updates that item's counts instead.
- **Provenance and quarantine.** Every item records the task that created it; items retrieved more often in failures than in successes are quarantined, and the owner can revoke any item.
- **Learned terms wait for an owner.** A definition a user gives in a clarification ("active means ordered in the last 90 days") is saved as pending until the glossary owner approves it in Slack.
- **No leakage.** Memory is written only from the train split and live use; the test split is never written.



### Level 3: saved reports that heal

1. Each saved report runs nightly on the replay feed.
2. A break is either an error or silent drift: row count off 50% from its 7-day mean, a null-rate spike, or a column gone from informationschema.
3. A schema diff against the last good snapshot proposes mappings: a renamed column is matched on name similarity, type and value overlap.
4. The Level 1 loop repairs the query with the diff as context.
5. Back-test: old query on the snapshot and new query on the live schema over the same historical window. Counts must match exactly, sums within 0.01%.
6. A match goes to the owner as a Slack approval card with the diff. A mismatch is never applied; the owner gets the explanation instead.

A false heal is a repair that runs but changes historical numbers. The target is zero applied.

### Memory records

```python
class VerifiedQuery(BaseModel):
    id: UUID; question: str; sql: str; tables: list[str]
    result_hash: str; verified_by: str; verified_at: datetime
    uses: int = 0; failures: int = 0; status: Literal["active", "quarantined", "revoked"]

class Lesson(BaseModel):
    id: UUID; signature: str          # e.g. "42703:column <col> does not exist"
    error_class: str; tables: list[str]; dialect: str = "postgresql"
    failed_snippet: str; fix: str; fixed_snippet: str; source_task: UUID
    successes: int = 0; failures: int = 0; status: Literal["active", "quarantined", "revoked"]

class GlossaryEntry(BaseModel):
    term: str; synonyms: list[str]; definition: str; sql_template: str
    owner: str; version: int; status: Literal["approved", "pending"]

class SavedReport(BaseModel):
    id: UUID; name: str; question: str; sql: str; cron: str; owner: str
    last_good_sql: str; last_good_result_hash: str; last_good_schema: dict
```



## Verifier

A query that runs is not a query that is right. The Verifier runs cheap deterministic checks first and an LLM critic last, and any failure goes to the Debugger with the check's name as its signature.


| Check                | Catches                                       | How                                                                                                          |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Policy               | Writes, multiple statements, forbidden tables | sqlglot parse against the role's allow-list                                                                  |
| Fan-out              | Double counting from a join                   | Compare the result's total to the same total on the base table; compare COUNT() to COUNT(DISTINCT grain key) |
| Grain                | Wrong level of detail                         | Result columns against the dimensions in the Planner's plan                                                  |
| Range                | Impossible values                             | Shares within 0 to 100%, no negative counts, dates inside 4 Sep 2016 to 17 Oct 2018                          |
| Emptiness            | A wrong filter                                | Empty or single-row result where the plan expects many                                                       |
| Partial period       | Misleading trends                             | Flag months under 10% of median monthly volume                                                               |
| Glossary conformance | A metric computed the wrong way               | Core expression compared to the glossary's SQL template                                                      |
| Dual computation     | Subtle SQL logic errors                       | The headline number recomputed in pandas from raw rows; both must agree                                      |
| Numbers in text      | Hallucinated figures in the answer            | Every number in the narrative must appear in the result, after rounding                                      |
| LLM critic           | Answering a different question                | Rubric score 1 to 5 on whether the result answers the question as asked                                      |


The critic is calibrated before it is trusted: its pass and fail calls are scored against the golden set. A critic that always passes, or always fails, is broken; lesson 55 of the course covers making it converge.

## Evaluation plan

The golden set is the primary yardstick, BIRD Mini-Dev the external one; every number is reported with a 95% bootstrap interval over 3 seeds.

### Golden set, by tier


| Tier                              | Count | Example questions on Olist                                                                                                                                                                      |
| --------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: single table or simple join    | 50    | How many orders were delivered in 2017? Top 5 categories by revenue, in English.                                                                                                                |
| 2: traps and business definitions | 60    | Repeat purchase rate in 2017. Average delay in days for late orders, by customer state, Q4 2017.                                                                                                |
| 3: multi-step analysis            | 40    | Monthly cohort retention for customers whose first order was in 2017. Do late deliveries lower review scores, and by how much? Which sellers' revenue fell over 30% quarter on quarter in 2018? |
| Ambiguous                         | 30    | Who are our best customers? How are sales doing?                                                                                                                                                |
| Unanswerable                      | 20    | What is customer acquisition cost? (no spend data) What is profit margin by category? (no cost data)                                                                                            |


Every gold answer is run and inspected by hand. LLM-drafted candidates are welcome; unverified ones are not.

### Metrics


| Metric                          | Definition                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Execution accuracy              | Result equals the gold result: order-insensitive unless an order was asked for, sums within 0.01% |
| First-try versus final accuracy | Accuracy before and after repair; the gap is the repair uplift                                    |
| Repair regressions              | Questions right on the first try and wrong after repair (should be 0 by design)                   |
| Repairs per question            | Mean and p95 attempts                                                                             |
| Clarification F1                | Asked when the label says ambiguous, not otherwise                                                |
| Refusal accuracy                | Unanswerable questions declined with the reason                                                   |
| Schema-linking recall@8         | Gold tables and columns retrieved                                                                 |
| Cost per correct answer         | Total token cost divided by correct answers                                                       |
| Latency                         | p50 and p95, question to answer                                                                   |
| Heal rate and false heals       | Over 20 drift scenarios on 10 saved reports                                                       |
| Guardrails                      | Injection block rate, PII leaks (target 0), writes executed (target 0)                            |




### Experiments

1. **Ablation ladder.** Single-shot, then add schema RAG, repair loop, Verifier, memory, multi-agent. Each rung's accuracy and cost.
2. **Learning curve.** Stream the 105 train questions in 3 random orders; score the test split every 15 questions, with and without memory.
3. **Models.** A frontier model, a small fast model and an open-weights coder model on the full system: accuracy against cost.
4. **Vector stores.** The FAISS, Chroma, Pinecone and pgvector table from the RAG section.
5. **Routing and caching.** Cost per correct answer before and after cheap-first routing, prompt caching and the semantic cache.
6. **BIRD Mini-Dev (PostgreSQL, 500).** Report execution accuracy next to the published baselines and the April 2026 self-healing report (49.0% on 437 of these questions), stating any differences in setup.
7. **BIRD-CRITIC-PG (530).** The Debugger alone, scored by the benchmark's test cases.

CI gate: a 30-question smoke subset runs on every pull request and fails the build if accuracy drops more than 3 points or cost rises more than 20%; the full suite runs nightly.

## Production

Fixpoint ships as one FastAPI service with workers, reachable from Slack, a web chat and MCP clients, traced end to end and deployed from CI.

- **API.** POST /ask returns a job id; GET /jobs/{id}/events streams agent steps over SSE; POST /approvals/{id} records a human decision; /reports manages saved reports. JWT auth with a role claim that maps to a database role.
- **Interfaces.** A Slack bot (Bolt for Python) with /ask, threaded answers with chart images, and approval buttons. A Chainlit web chat that shows each agent step. An MCP server exposing askquestion, runsavedreport and searchglossary.
- **Workers and state.** Redis queue with arq workers; LangGraph checkpoints in Postgres, so a crashed job resumes and a human-approval pause can last days.
- **Guardrails.** An injection classifier on user input, scored on deepset/prompt-injections. Data values fenced, labelled as data and truncated inside prompts. Presidio masks PII columns before the model or the user sees them. A hand-written token-bucket rate limit per user and a hard token budget per question.
- **Observability.** OpenTelemetry with the GenAI semantic conventions: one trace per question, a span per agent node, tool call and model call, with tokens and cost as attributes, exported to self-hosted Langfuse.
- **Cost.** Prompt caching on the stable prefix. A semantic cache that reuses a verified answer for a near-identical question on the same data version (LRU, cleared on data refresh). Cheap model for routing and schema linking; stronger model only after repeated failure. LiteLLM enforces a monthly spend cap.
- **CI/CD.** GitHub Actions: ruff, mypy, pytest, the eval smoke gate, Docker build, push, deploy.
- **Deploy.** One GCE VM running Docker Compose: API, workers, Postgres with pgvector, Redis, Langfuse, and the sandbox runner with gVisor; Caddy for TLS. Stretch: GKE, with each sandbox run as a Kubernetes Job.



## Build plan

[embedded content: Build plan · hour estimates typed in chat, cumulative

Each phase ends at a gate you can show someone. If the interview comes before phase 6, stop at the line: phases 0 to 5 already evidence RAG, multi-agent orchestration, sandboxing, evaluation and memory. Course lessons refer to Phase 19 of the ai-engineering-from-scratch repository.

## Repository layout

```text
fixpoint/
  apps/
    api/            FastAPI app, auth, SSE, approvals
    slack/          Bolt bot
    chat/           Chainlit UI
    mcp/            MCP server
  fixpoint/
    graph/          LangGraph state, nodes, edges, checkpointer
    agents/         router, clarifier, planner, schema_linker, coder, debugger, explainer
    verify/         deterministic checks, critic
    sandbox/        SQL guard, Docker and E2B runners
    retrieval/      bm25.py, dense.py, rrf.py, rerank.py, fk_graph.py
      stores/       faiss.py, chroma.py, pinecone.py, pgvector.py
    memory/         verified queries, lessons, glossary, write and quarantine rules
    reports/        scheduler, drift detection, schema diff, back-test
    guards/         injection, PII, rate limit, budget
    llm/            LiteLLM gateway, prompts/ (versioned), semantic cache
    telemetry/      OpenTelemetry setup
  data/
    load/           Olist, AdventureWorks, TPC-H loaders
    dictionary/     schema.yml
    glossary/       metrics.yml
    drift/          20 migration scripts
    replay/         daily replay feed, anomaly injector
  evals/
    golden/         olist.jsonl (train, test)
    runners/        golden, bird_minidev, bird_critic, dabstep, drift, redteam
    reports/        results and charts per run
  infra/            docker-compose.yml, Dockerfiles, sandbox image, Caddyfile
  .github/workflows/  ci.yml, nightly-evals.yml              |
```

Open questions:

- [ ] When is the interview? It decides whether to stop after phase 5. 
- [ ] Which model credits do you have (Gemini free tier, Anthropic, OpenAI, Groq)? It sets the 3-model lineup
Answer : Keep Gemini as the main right now, after a while we will add other's as well.

- [ ] Who are the 5 to 10 pilot users, and what task sheet do they get?
Answer: 

- [ ] Confirm the marketing-funnel dataset's license on its Kaggle page before publishing results on it.



## Sources

- [Olist work-at-olist-data repository](https://github.com/olist/work-at-olist-data) (CSVs profiled 8 Oct 2026)
- [Olist Sales Funnel Analysis](https://github.com/Catherinedataa/Olist-Sales-Funnel-Analysis) (marketing-funnel counts)
- [AdventureWorks for Postgres](https://github.com/lorint/AdventureWorks-for-Postgres)
- [BIRD Mini-Dev](https://github.com/bird-bench/mini_dev)
- [SWE-SQL: BIRD-CRITIC and BIRD-Fixer](https://arxiv.org/html/2506.18951v2)
- [BIRD-Interact](https://arxiv.org/abs/2510.05318v2)
- [DABstep announcement](https://huggingface.co/blog/dabstep) and [Adyen on Hugging Face](https://huggingface.co/adyen)
- [deepset/prompt-injections](https://huggingface.co/datasets/deepset/prompt-injections/tree/main)
- [Pinecone pricing](https://pinecone.io/pricing/)
- [SQL Query Engine: A Self-Healing LLM Pipeline for Natural Language to PostgreSQL Translation](https://arxiv.org/abs/2604.16511)


