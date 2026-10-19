import { AlertTriangle, Ban, Check, ExternalLink, HelpCircle, ShieldAlert } from "lucide-react";
import { ResultChart } from "@/components/chat/result-chart";
import { ResultTable } from "@/components/chat/result-table";
import { SaveToMemory } from "@/components/chat/save-to-memory";
import { SqlBlock } from "@/components/chat/sql-block";
import { Disclosure } from "@/components/disclosure";
import { Card, CardContent } from "@/components/ui/card";
import { usd } from "@/lib/format";
import type { Answer, Memory } from "@/lib/types";

const WARNING_TITLE: Record<string, string> = {
  partial_period: "Partial months",
  numbers_in_text: "Unchecked number",
};

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border bg-card px-3.5 py-1.5 text-left text-sm shadow-soft transition hover:border-primary/50 hover:text-primary"
    >
      {children}
    </button>
  );
}

function Meta({ answer, save }: { answer: Answer; save?: { question: string; sql: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
      <span className="tabular">Cost {usd(answer.cost_usd)}</span>
      {answer.kind === "answerable" && (
        <span>{answer.attempts === 1 ? "1 attempt" : `${answer.attempts} attempts`}</span>
      )}
      {answer.trace_url && (
        <a
          href={answer.trace_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          Trace <ExternalLink className="size-3" />
        </a>
      )}
      {save && <SaveToMemory {...save} />}
    </div>
  );
}

function Warnings({ answer }: { answer: Answer }) {
  const items = answer.warnings.map((w) => {
    const m = /^([a-z_]+): ([\s\S]*)$/.exec(w);
    return m && WARNING_TITLE[m[1]] ? { title: WARNING_TITLE[m[1]], body: m[2] } : { title: "Note", body: w };
  });
  if (answer.truncated) {
    items.push({
      title: "Result truncated",
      body: `Showing the first ${answer.rows.length.toLocaleString("en-US")} rows; the full result has more than 10,000.`,
    });
  } else if (answer.rows.length >= 500) {
    items.push({ title: "First 500 rows", body: "The table shows the first 500 rows; the result may have more." });
  }
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 rounded-md border border-panel-border bg-panel px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          <span>
            <span className="font-semibold">{it.title}.</span> {it.body}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MemoriesUsed({ memories }: { memories: Memory[] }) {
  const n = memories.length;
  return (
    <Disclosure title={`Learned from ${n} verified ${n === 1 ? "query" : "queries"}`}>
      <ul className="divide-y">
        {memories.map((m) => (
          <li key={m.question} className="px-3 py-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <span>{m.question}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular">{Math.round(m.score * 100)}% match</span>
            </div>
            <pre className="mt-1.5 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">{m.sql}</pre>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

export function AnswerCard({
  answer,
  question,
  onAsk,
}: {
  answer: Answer;
  question: string;
  onAsk: (q: string) => void;
}) {
  if (answer.kind === "ambiguous") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-medium">
            <HelpCircle className="size-4 shrink-0 text-primary" />
            {answer.text}
          </p>
          <div className="flex flex-wrap gap-2">
            {answer.options.map((o) => (
              <Chip key={o} onClick={() => onAsk(o)}>
                {o}
              </Chip>
            ))}
          </div>
          <Meta answer={answer} />
        </CardContent>
      </Card>
    );
  }

  if (answer.kind === "unanswerable") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-medium">
            <Ban className="size-4 shrink-0 text-muted-foreground" />
            I can&apos;t answer that from this data.
          </p>
          <p className="text-muted-foreground">{answer.refusal_reason || answer.text}</p>
          {answer.closest_question && (
            <div className="flex flex-col gap-2">
              <p className="eyebrow text-muted-foreground">Closest question I can answer</p>
              <div>
                <Chip onClick={() => onAsk(answer.closest_question)}>{answer.closest_question}</Chip>
              </div>
            </div>
          )}
          <Meta answer={answer} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        {answer.verified ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground">
            <Check className="size-3.5" />
            {answer.attempts <= 1 ? "Verified on the first try" : `Verified after ${answer.attempts} attempts`}
          </span>
        ) : (
          <p className="flex items-center gap-2 rounded-md border border-panel-border bg-panel px-3 py-2 text-sm font-semibold">
            <ShieldAlert className="size-4 shrink-0 text-warning-foreground" />
            Not verified after {answer.attempts} attempts. Treat these numbers with care.
          </p>
        )}
        <p className="text-[0.95rem] leading-relaxed whitespace-pre-line">{answer.text}</p>
        <Warnings answer={answer} />
        {answer.columns.length > 0 && answer.chart.type !== "table" && <ResultChart answer={answer} />}
        {answer.columns.length > 0 && <ResultTable columns={answer.columns} rows={answer.rows} />}
        {answer.sql && <SqlBlock sql={answer.sql} />}
        {answer.memories_used.length > 0 && <MemoriesUsed memories={answer.memories_used} />}
        <Meta answer={answer} save={answer.verified && answer.sql ? { question, sql: answer.sql } : undefined} />
      </CardContent>
    </Card>
  );
}
