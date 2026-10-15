
## JD coverage map

Every responsibility, must-have and "what you learn" line in the JD has a named Fixpoint component that evidences it.


| JD line                                                 | Fixpoint component                                                                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scalable LLM applications in Python                     | Async FastAPI service, Redis job queue for long analyses, stateless workers, Docker Compose                                                                           |
| Build and optimize RAG pipelines                        | Four indexes (data dictionary, metric glossary, verified queries, lessons); hybrid BM25 plus dense retrieval, reranking; every change scored on schema-linking recall |
| Multi-agent systems and orchestration                   | LangGraph graph of Router, Clarifier, Planner, Schema Linker, Coder, Executor, Verifier, Debugger, Explainer, with checkpoints and human approval                     |
| Integrate LLMs with APIs, databases, enterprise systems | Postgres warehouse through a read-only role, Slack bot, scheduled reports, tools exposed as an MCP server [ Later Feature ]                                           |
| Vector databases (FAISS, Pinecone, Chroma)              | One VectorStore interface, three backends, a published benchmark table [ Which Ones to use ]                                                                          |
| Prompt engineering, evaluation, optimization            | Versioned prompts, Pydantic structured outputs, golden set, BIRD Mini-Dev, CI eval gate                                                                               |
| Translate business problems into AI solutions           | Business brief, metric glossary owned by the business, clarifying questions, pilot with real users                                                                    |
| Experiment with models, frameworks, architectures       | LiteLLM gateway, 3 models on one eval set, single-agent versus multi-agent ablation                                                                                   |
| Python, DSA, system design                              | Hand-written BM25, RRF, LRU semantic cache, token-bucket rate limiter, a scaling design doc                                                                           |
| LangChain, LlamaIndex                                   | LlamaIndex for document ingestion, LangGraph for orchestration, each after a hand-built version                                                                       |
| REST APIs, backend, integrations                        | JWT auth, SSE streaming of agent steps, OpenAPI docs, Slack webhooks                                                                                                  |
| Basic ML concepts                                       | Embeddings, a scikit-learn query router with a confusion matrix, anomaly detection and forecasting tools                                                              |
| Git, Docker, modern workflows                           | GitHub Actions: lint, tests, eval gate, image build, deploy                                                                                                           |
| Production-grade systems, deployment challenges         | gVisor sandbox, guardrails, OpenTelemetry traces in Langfuse, retries and fallbacks                                                                                   |
| Enterprise AI architecture                              | Row-level access by role, PII masking, audit log of every query run                                                                                                   |
| Cost and performance optimization                       | Prompt caching, semantic cache, cheap-model-first routing, cost per correct answer                                                                                    |
| Live client use case, consulting                        | Pilot with 5 to 10 users on a task sheet, ROI write-up                                                                                                                |


## Target resume bullets

The entry this project earns, with brackets for numbers you measure. Fill them only from the eval reports.

**Fixpoint: Self-Healing Data Analyst Agent** | Python, LangGraph, LlamaIndex, FastAPI, PostgreSQL, FAISS, Chroma, Pinecone, Docker

- Built a multi-agent LangGraph data analyst (planner, schema linker, coder, sandboxed executor, verifier, debugger) over a 9-table Postgres warehouse: X% execution accuracy on a 200-question business golden set and Y% on BIRD Mini-Dev (PostgreSQL), Z points above single-shot.
- Built hybrid RAG (BM25, dense, cross-encoder rerank) over a data dictionary, metric glossary and a self-growing memory of verified queries and error fixes, lifting accuracy from A% to B% as memory grew; benchmarked FAISS, Chroma and Pinecone on recall@10 and p95 latency.
- Shipped self-healing scheduled reports that repaired N of 20 injected schema changes with zero false heals via back-tested fixes and Slack approval; cut cost per correct answer C% with caching and cheap-model routing; deployed with a gVisor sandbox, OpenTelemetry tracing and a CI eval gate.



## Risks and open questions


| Risk                                                              | Mitigation                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Prior art: in-task self-healing text-to-PostgreSQL already exists | Lead the README with what it lacks: memory with a learning curve, a Verifier, back-tested report healing |
| Repairs turn right answers wrong                                  | First verified result wins; repair regressions tracked as a metric                                       |
| Memory poisoning: one wrong verified query spreads                | Proof before writes, provenance, quarantine on failure ratio, owner revoke                               |
| Benchmark contamination: BIRD may be in model training data       | Golden set is the primary yardstick; BIRD is supporting evidence                                         |
| API spend on 3 models times many runs                             | Small models while developing, frontier only for final runs, LiteLLM spend cap                           |
| gVisor needs a VM, not Cloud Run                                  | GCE VM by default; E2B behind the same runner interface                                                  |
| Scope: about 92 hours                                             | Phases 0 to 5 are a complete, defensible project on their own                          