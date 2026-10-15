# FixPoint : Data Analyst Agent 

Fixpoint is a self-healing data analyst. A business user asks a question in plain English; a team of agents writes SQL and Python, runs it in a sandbox against the company warehouse, checks the result, repairs its own mistakes and answers with a chart and an explanation. 

### Self Healing Property:

It heals at three levels:

1. ++**Within a question.**++ A failed run or a failed check goes to a Debugger agent, which repairs and reruns, up to 3 attempts, escalating to a stronger model on the last one.
2. ++**Across questions.**++ Every verified query and every error-to-fix lesson is stored in a vector index and retrieved for similar future questions, so accuracy rises as the memory fills.
3. ++**Across time++.** Saved reports run nightly. When a schema change breaks one, Fixpoint repairs it, proves the repair reproduces the last known-good numbers, and asks for approval in Slack before replacing it.

### Features of Project: 

- Accuracy on a 200-question business golden set and on BIRD Mini-Dev (PostgreSQL), first attempt versus after repair
- A learning curve: accuracy against questions seen, with and without memory
- Heal rate and false-heal rate on 20 injected schema changes
- Cost per correct answer across 3 models, before and after routing and caching
- FAISS versus Chroma versus Pinecone on recall@10, p95 latency and cost

## Business Problem Statement :

The client is a mid-size e-commerce marketplace, modelled on Olist, whose data team is the bottleneck for every business question. Category managers, ops leads and finance wait days for answers to ad-hoc questions, and saved reports break silently whenever the warehouse schema changes.

### Fix-point Solution:

Fixpoint answers routine questions directly, asks when a business term is ambiguous, refuses when the data cannot answer, and keeps saved reports running through schema changes.

## Datasets used:

Fixpoint runs on one real marketplace warehouse (Olist, 99,441 orders), a second warehouse it never sees during development (AdventureWorks), public benchmarks for credibility, and corpora you write yourself. Olist counts below were computed from the CSVs on 8 Oct 2026.


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
