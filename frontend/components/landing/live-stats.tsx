"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatTile } from "@/components/stat-tile";
import { listRuns } from "@/lib/api";
import { latestDone } from "@/lib/evals";
import { formatDate, pct, seconds, usd } from "@/lib/format";
import type { EvalRun } from "@/lib/types";

/** Quotes the latest finished eval run. Without one (or if the API is down) the section doesn't render: no hard-coded numbers. */
export function LiveStats() {
  const [run, setRun] = useState<EvalRun | null>(null);
  useEffect(() => {
    listRuns().then(
      (runs) => setRun(latestDone(runs)),
      () => setRun(null),
    );
  }, []);
  if (!run) return null;
  const n = `n=${run.n_answerable} answerable questions`;
  return (
    <section id="evals" className="scroll-mt-16 border-t py-20">
      <div className="reveal mx-auto max-w-[1100px] px-4 sm:px-6">
        <p className="eyebrow text-center">Evals</p>
        <h2 className="mt-3 text-center text-[clamp(1.7rem,3.5vw,2.3rem)] leading-tight font-[720] tracking-[-0.03em]">
          Measured on a hand-verified golden set.
        </h2>
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Final accuracy" value={pct(run.final_acc)} note={n} />
          <StatTile label="First-try accuracy" value={pct(run.first_try_acc)} note={n} />
          <StatTile label="Cost per correct answer" value={usd(run.cost_per_correct)} />
          <StatTile label="Median latency" value={seconds(run.p50_ms)} />
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          From run #{run.id} on the {run.split} split, memory {run.memory ? "on" : "off"}, {formatDate(run.started_at)}.{" "}
          <Link href="/evals" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Every run and question <ArrowRight className="size-3.5" />
          </Link>
        </p>
      </div>
    </section>
  );
}
