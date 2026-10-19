"use client";

import { ArrowLeft, Check, ChevronRight, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { Fragment, use, useCallback, useState } from "react";
import { ErrorNote } from "@/components/error-note";
import { StatusBadge } from "@/components/evals/status-badge";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { ApiError, getRun } from "@/lib/api";
import { flags } from "@/lib/evals";
import { f1, formatDate, pct, pts, seconds, usd } from "@/lib/format";
import type { EvalResult, EvalRun, RunDetail } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { cn } from "@/lib/utils";

function Mark({ ok, yes = "correct", no = "wrong" }: { ok: boolean; yes?: string; no?: string }) {
  return ok ? (
    <span className="flex h-5 items-center text-success-foreground">
      <Check className="size-4" />
      <span className="sr-only">{yes}</span>
    </span>
  ) : (
    <span className="flex h-5 items-center text-danger-foreground">
      <X className="size-4" />
      <span className="sr-only">{no}</span>
    </span>
  );
}

function RunStats({ run }: { run: EvalRun }) {
  // A sample size only means something next to a number; a failed or running run has none yet.
  const sample = (x: number | null, n: number) => (x == null ? undefined : `n=${n}`);
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile label="First-try accuracy" value={pct(run.first_try_acc)} note={sample(run.first_try_acc, run.n_answerable)} />
      <StatTile label="Final accuracy" value={pct(run.final_acc)} note={sample(run.final_acc, run.n_answerable)} />
      <StatTile label="Repair uplift" value={pts(run.repair_uplift)} note={sample(run.repair_uplift, run.n_answerable)} />
      <StatTile
        label="Confidently wrong"
        value={String(run.confidently_wrong ?? "-")}
        note="verified but wrong"
        tone={run.confidently_wrong ? "danger" : undefined}
      />
      <StatTile
        label="Repair regressions"
        value={String(run.repair_regressions ?? "-")}
        note="right first, wrong final"
        tone={run.repair_regressions ? "danger" : undefined}
      />
      <StatTile label="Clarification F1" value={f1(run.clarification_f1)} note={sample(run.clarification_f1, run.n_ambiguous)} />
      <StatTile label="Refusal accuracy" value={pct(run.refusal_acc)} note={sample(run.refusal_acc, run.n_unanswerable)} />
      <StatTile label="Cost per correct" value={usd(run.cost_per_correct)} />
      <StatTile label="Latency p50" value={seconds(run.p50_ms)} />
      <StatTile label="Latency p95" value={seconds(run.p95_ms)} />
    </section>
  );
}

function SqlCompare({ result }: { result: EvalResult }) {
  if (result.kind !== "answerable") {
    return (
      <p className="py-1 text-sm">
        Expected <strong>{result.kind}</strong>; the planner said <strong>{result.predicted_kind}</strong>.
      </p>
    );
  }
  return (
    <div className="grid gap-3 py-1 md:grid-cols-2">
      {(
        [
          ["Gold SQL", result.gold_sql],
          ["Agent SQL", result.agent_sql],
        ] as const
      ).map(([label, sql]) => (
        <div key={label} className="min-w-0">
          <p className="mb-1.5 text-xs font-semibold">{label}</p>
          <pre className="overflow-x-auto rounded-md border bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {sql || "(none)"}
          </pre>
        </div>
      ))}
    </div>
  );
}

function ResultsTable({ results }: { results: EvalResult[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  if (!results.length) return <p className="text-sm text-muted-foreground">No questions were scored in this run.</p>;
  return (
    <section className="flex flex-col gap-3">
      <h2>Per question</h2>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-soft">
        <table className="data-table min-w-[860px]">
          <thead>
            <tr>
              <th>Question</th>
              <th>Kind</th>
              <th>First try</th>
              <th>Final</th>
              <th>Verified</th>
              <th className="num">Attempts</th>
              <th className="num">Cost</th>
              <th className="num">Latency</th>
              <th>Trace</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const f = flags(r);
              const isOpen = open.has(r.question_id);
              return (
                <Fragment key={r.question_id}>
                  <tr className={cn(isOpen && "bg-muted/40")}>
                    <td className="max-w-[360px]">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggle(r.question_id)}
                        className="flex items-start gap-1.5 text-left hover:text-primary"
                      >
                        <ChevronRight className={cn("mt-0.5 size-4 shrink-0 transition-transform", isOpen && "rotate-90")} />
                        <span>{r.question}</span>
                      </button>
                      {(f.confidentlyWrong || f.regression) && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-5.5">
                          {f.confidentlyWrong && <Badge variant="destructive">Confidently wrong</Badge>}
                          {f.regression && (
                            <Badge variant="outline" className="border-panel-border bg-panel">
                              Repair regression
                            </Badge>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.kind}
                      {r.predicted_kind !== r.kind && (
                        <span className="block text-xs text-danger-foreground">said {r.predicted_kind}</span>
                      )}
                    </td>
                    <td>
                      <Mark ok={r.first_try_correct} />
                    </td>
                    <td>
                      <Mark ok={r.final_correct} />
                    </td>
                    <td>
                      {r.kind === "answerable" ? (
                        <Mark ok={r.verified} yes="verified" no="unverified" />
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </td>
                    <td className="num">{r.attempts || "-"}</td>
                    <td className="num">{usd(r.cost_usd)}</td>
                    <td className="num whitespace-nowrap">{seconds(r.latency_ms)}</td>
                    <td>
                      {r.trace_url ? (
                        <a
                          href={r.trace_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Trace <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={9} className="bg-muted/40">
                        <SqlCompare result={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RunDetailView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      getRun(id).then(
        (d) => {
          setDetail(d);
          setError(null);
        },
        (e: unknown) =>
          setError(
            e instanceof ApiError && e.status === 404
              ? `There is no eval run #${id}.`
              : e instanceof ApiError
                ? e.message
                : "Couldn't load this run.",
          ),
      ),
    [id],
  );
  usePolling(load, detail?.run.status === "running");

  return (
    <div className="flex flex-col gap-7">
      <Link href="/evals" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        All runs
      </Link>
      {error && <ErrorNote message={error} onRetry={() => void load()} />}
      {!detail && !error && <p className="text-sm text-muted-foreground">Loading run</p>}
      {detail && (
        <>
          <header>
            <p className="eyebrow">Eval run</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <h1>Run #{detail.run.id}</h1>
              <StatusBadge status={detail.run.status} />
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {formatDate(detail.run.started_at)} · {detail.run.split} split · memory {detail.run.memory ? "on" : "off"} ·{" "}
              {detail.run.model} · <code className="font-mono">{detail.run.git_sha}</code>
            </p>
          </header>
          <RunStats run={detail.run} />
          {detail.run.status === "running" ? (
            <p className="rounded-lg border border-panel-border bg-panel px-4 py-3 text-sm">
              This run is in progress. Results appear when it finishes; the page refreshes itself.
            </p>
          ) : (
            <ResultsTable results={detail.results} />
          )}
        </>
      )}
    </div>
  );
}
