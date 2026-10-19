"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ErrorNote } from "@/components/error-note";
import { StatusBadge } from "@/components/evals/status-badge";
import { PillGroup } from "@/components/pill-group";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAdminToken } from "@/lib/admin";
import { ApiError, listRuns, startRun } from "@/lib/api";
import { anyRunning, pickComparison } from "@/lib/evals";
import { f1, formatDate, pct, pts, seconds, usd } from "@/lib/format";
import type { EvalRun, Split } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";

const SPLITS: readonly Split[] = ["test", "train", "all"];

/** A metric over its sample size on a second line, so wide tables stay narrow enough to read on a phone. */
function Sampled({ value, n }: { value: string; n: number }) {
  return (
    <>
      {value}
      {value !== "-" && <span className="block text-xs font-normal text-muted-foreground">n={n}</span>}
    </>
  );
}

function StartRun({ token, running, onStarted }: { token: string; running: boolean; onStarted: () => Promise<unknown> }) {
  const [split, setSplit] = useState<Split>("test");
  const [memory, setMemory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      await startRun(split, memory, token);
      await onStarted();
    } catch (e) {
      setMessage(
        e instanceof ApiError && e.status === 409
          ? "A run is already in progress. Start another when it finishes."
          : e instanceof ApiError
            ? e.message
            : "Couldn't start the run.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-panel-border bg-panel px-4 py-3">
      <span className="text-sm font-semibold">New eval run</span>
      <PillGroup label="Split" value={split} options={SPLITS} onChange={setSplit} />
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={memory} onCheckedChange={setMemory} />
        Memory
      </label>
      <Button size="sm" className="ml-auto" onClick={start} disabled={busy || running}>
        {running ? "Run in progress" : busy ? "Starting" : "Start run"}
      </Button>
      {message && (
        <p role="alert" className="w-full text-sm text-danger-foreground">
          {message}
        </p>
      )}
    </section>
  );
}

function Comparison({ runs }: { runs: EvalRun[] }) {
  const pair = pickComparison(runs);
  if (!pair) return null;
  const rows: [string, (r: EvalRun) => React.ReactNode][] = [
    ["First-try accuracy", (r) => <Sampled value={pct(r.first_try_acc)} n={r.n_answerable} />],
    ["Final accuracy", (r) => <Sampled value={pct(r.final_acc)} n={r.n_answerable} />],
    ["Repair uplift", (r) => pts(r.repair_uplift)],
    ["Confidently wrong", (r) => String(r.confidently_wrong ?? "-")],
    ["Clarification F1", (r) => <Sampled value={f1(r.clarification_f1)} n={r.n_ambiguous} />],
    ["Refusal accuracy", (r) => <Sampled value={pct(r.refusal_acc)} n={r.n_unanswerable} />],
    ["Cost per correct answer", (r) => usd(r.cost_per_correct)],
    ["Latency p50", (r) => seconds(r.p50_ms)],
    ["Latency p95", (r) => seconds(r.p95_ms)],
  ];
  return (
    <section className="rounded-lg border bg-card p-4 shadow-soft sm:p-5">
      <p className="eyebrow">Memory on vs off</p>
      <h2 className="mt-1.5">What memory adds, on the {pair.on.split} split</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">
                Memory off{" "}
                <Link href={`/evals/${pair.off.id}`} className="font-normal text-primary hover:underline">
                  #{pair.off.id}
                </Link>
              </th>
              <th className="num">
                Memory on{" "}
                <Link href={`/evals/${pair.on.id}`} className="font-normal text-primary hover:underline">
                  #{pair.on.id}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="num whitespace-nowrap">{f(pair.off)}</td>
                <td className="num font-semibold whitespace-nowrap">{f(pair.on)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RunsTable({ runs }: { runs: EvalRun[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2>All runs</h2>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-soft">
        <table className="data-table whitespace-nowrap [&_td]:px-2.5 [&_th]:px-2.5">
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              <th>Setup</th>
              <th className="num">First try</th>
              <th className="num">Final</th>
              <th className="num">Uplift</th>
              <th className="num">Clarif. F1</th>
              <th className="num">Refusal</th>
              <th className="num">$ / correct</th>
              <th className="num">Latency p50</th>
              <th>Build</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/evals/${r.id}`} className="font-medium text-primary hover:underline">
                    #{r.id}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{formatDate(r.started_at)}</span>
                </td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td>
                  {r.split}
                  <span className="block text-xs text-muted-foreground">memory {r.memory ? "on" : "off"}</span>
                </td>
                <td className="num">
                  <Sampled value={pct(r.first_try_acc)} n={r.n_answerable} />
                </td>
                <td className="num font-semibold">
                  <Sampled value={pct(r.final_acc)} n={r.n_answerable} />
                </td>
                <td className="num">{pts(r.repair_uplift)}</td>
                <td className="num">
                  <Sampled value={f1(r.clarification_f1)} n={r.n_ambiguous} />
                </td>
                <td className="num">
                  <Sampled value={pct(r.refusal_acc)} n={r.n_unanswerable} />
                </td>
                <td className="num">{usd(r.cost_per_correct)}</td>
                <td className="num">
                  {seconds(r.p50_ms)}
                  {r.p95_ms != null && (
                    <span className="block text-xs text-muted-foreground">p95 {seconds(r.p95_ms)}</span>
                  )}
                </td>
                <td>
                  {r.model}
                  <code className="block font-mono text-xs text-muted-foreground">{r.git_sha}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RunsView() {
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token] = useAdminToken();
  const load = useCallback(
    () =>
      listRuns().then(
        (r) => {
          setRuns(r);
          setError(null);
        },
        (e: unknown) => setError(e instanceof ApiError ? e.message : "Couldn't load eval runs."),
      ),
    [],
  );
  const running = runs ? anyRunning(runs) : false;
  usePolling(load, running);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Evals</p>
        <h1 className="mt-2">Measured, not claimed</h1>
        <p className="mt-1.5 max-w-[64ch] text-muted-foreground">
          Each run asks the golden questions and scores every answer against a hand-verified result. Accuracy always
          shows its sample size: with 10 answerable test questions, one question moves accuracy by 10 points.
        </p>
      </header>
      {token && <StartRun token={token} running={running} onStarted={load} />}
      {error && <ErrorNote message={error} onRetry={() => void load()} />}
      {runs === null && !error && <p className="text-sm text-muted-foreground">Loading runs</p>}
      {runs?.length === 0 && <p className="text-sm text-muted-foreground">No eval runs yet.</p>}
      {runs && runs.length > 0 && (
        <>
          <Comparison runs={runs} />
          <RunsTable runs={runs} />
        </>
      )}
    </div>
  );
}
