import { Check, Loader2, RefreshCw, Wrench, X } from "lucide-react";
import type { StepEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABEL: Record<StepEvent["node"], string> = {
  planner: "Plan",
  coder: "Write SQL",
  executor: "Run",
  verifier: "Check",
  debugger: "Repair",
  explainer: "Explain",
};

type Kind = "ok" | "fail" | "repair" | "replan";

// "Failed" and "Gave up: ..." are the summaries the agent's fail() and explainer() emit (backend/src/fixpoint/agent.py).
function kindOf(step: StepEvent, index: number): Kind {
  if (step.summary === "Failed" || step.summary.startsWith("Gave up")) return "fail";
  if (step.node === "debugger") return "repair";
  if (step.node === "planner" && index > 0) return "replan";
  return "ok";
}

// Summaries that only restate the node's label ("Write SQL  Wrote SQL") are dropped.
const ECHO = new Set(["Wrote SQL", "Explained"]);

function summaryOf(step: StepEvent): string {
  if (step.summary === "Failed") return step.detail.split("\n")[0];
  if (ECHO.has(step.summary)) return "";
  return step.summary
    .replace(/^Repair \(strong model\): /, "Strong model: ")
    .replace(/^(Plan|Repair): /, "")
    .replace(/^1 rows$/, "1 row");
}

const ICON: Record<Kind, React.ReactNode> = {
  ok: <Check className="size-4 text-primary" />,
  fail: <X className="size-4 text-danger-foreground" />,
  repair: <Wrench className="size-4 text-warning-foreground" />,
  replan: <RefreshCw className="size-4 text-warning-foreground" />,
};

export function StepTimeline({ steps, running }: { steps: StepEvent[]; running: boolean }) {
  if (!steps.length && !running) return null;
  return (
    <ol className="flex flex-col gap-1" aria-label="Agent steps" aria-live="polite">
      {steps.map((s, i) => {
        const kind = kindOf(s, i);
        const attemptStarts = s.attempt > 1 && s.attempt !== steps[i - 1]?.attempt;
        const showDetail = s.detail && !(kind === "fail" && !s.detail.includes("\n"));
        return (
          <li key={i}>
            {attemptStarts && (
              <p className="mt-2 mb-1 px-1 text-[0.68rem] font-semibold tracking-[0.12em] text-faint uppercase">
                Attempt {s.attempt}
              </p>
            )}
            <div
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm",
                kind === "fail" && "border border-danger-foreground/20 bg-danger",
                (kind === "repair" || kind === "replan") && "border border-panel-border bg-panel",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{ICON[kind]}</span>
                <span className="shrink-0 font-medium">{kind === "replan" ? "Replan" : LABEL[s.node]}</span>
                <span className="min-w-0 flex-1 break-words text-muted-foreground">{summaryOf(s)}</span>
              </div>
              {showDetail && (
                <details className="mt-1 pl-6">
                  <summary className="text-xs text-muted-foreground">Details</summary>
                  <pre className="mt-1.5 max-h-64 overflow-auto rounded-md bg-muted p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {s.detail}
                  </pre>
                </details>
              )}
            </div>
          </li>
        );
      })}
      {running && (
        <li className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Working
        </li>
      )}
    </ol>
  );
}
