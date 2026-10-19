import { Check, Wrench, X } from "lucide-react";

// An illustration of one chat turn, drawn in static markup. Its numbers show the UI, not a measured result.
const BARS = [
  ["books_general_interest", 4.45],
  ["luggage_accessories", 4.32],
  ["health_beauty", 4.19],
  ["sports_leisure", 4.17],
  ["toys", 4.16],
] as const;

const STEPS = [
  ["ok", "Plan", "one review per order, then average per category"],
  ["ok", "Write SQL", "joins items, products and reviews"],
  ["fail", "Check", "1,236 duplicate rows: reviews fan out the join"],
  ["repair", "Repair", "deduplicate reviews before averaging"],
  ["ok", "Check", "passed"],
] as const;

const ICON = {
  ok: <Check className="size-3.5 text-primary" />,
  fail: <X className="size-3.5 text-danger-foreground" />,
  repair: <Wrench className="size-3.5 text-warning-foreground" />,
};

export function MockWindow() {
  return (
    <div className="rounded-[18px] border border-panel-border/60 bg-panel/60 p-2.5 shadow-lifted" aria-hidden>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-1.5 border-b px-3 py-2">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="flex-1 pr-10 text-center text-xs text-muted-foreground">Fixpoint</span>
        </div>
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-1.5 text-[0.8rem]">
            <p className="mb-1.5 ml-auto max-w-[92%] rounded-[12px] rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">
              What is the average review score by product category?
            </p>
            {STEPS.map(([kind, label, text], i) => (
              <div
                key={i}
                className={
                  kind === "fail"
                    ? "flex items-start gap-1.5 rounded-md border border-danger-foreground/20 bg-danger px-2 py-1"
                    : kind === "repair"
                      ? "flex items-start gap-1.5 rounded-md border border-panel-border bg-panel px-2 py-1"
                      : "flex items-start gap-1.5 px-2 py-1"
                }
              >
                <span className="mt-0.5">{ICON[kind]}</span>
                <span className="shrink-0 font-medium">{label}</span>
                <span className="text-muted-foreground">{text}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-lg border bg-background/60 p-4">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground">
              <Check className="size-3.5" /> Verified after 2 attempts
            </span>
            <p className="text-sm">
              Books (general interest) leads with an average score of 4.45 among categories with at least 500 orders.
            </p>
            <div className="flex flex-col gap-1.5">
              {BARS.map(([category, score]) => (
                <div key={category} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-[0.7rem]">
                  <span className="truncate font-mono text-muted-foreground">{category}</span>
                  <span className="h-2.5 rounded-r-[4px] bg-chart-1" style={{ width: `${(score / 5) * 100}%` }} />
                  <span className="text-right tabular">{score.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <p className="font-mono text-[0.7rem] text-muted-foreground">SQL · 2 attempts · $0.0058 · Trace</p>
          </div>
        </div>
      </div>
    </div>
  );
}
