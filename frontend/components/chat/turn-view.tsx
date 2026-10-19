import { Ban } from "lucide-react";
import { AnswerCard } from "@/components/chat/answer-card";
import { StepTimeline } from "@/components/chat/step-timeline";
import { ErrorNote } from "@/components/error-note";
import type { Turn } from "@/lib/turns";

export function TurnView({ turn, onAsk }: { turn: Turn; onAsk: (q: string) => void }) {
  return (
    <article className="flex flex-col gap-3" aria-busy={turn.status === "running"}>
      <p className="ml-auto max-w-[85%] rounded-[14px] rounded-br-sm bg-primary px-4 py-2.5 text-sm break-words text-primary-foreground">
        {turn.question}
      </p>
      <StepTimeline steps={turn.steps} running={turn.status === "running"} />
      {turn.answer && <AnswerCard answer={turn.answer} question={turn.question} onAsk={onAsk} />}
      {turn.status === "error" && turn.error && <ErrorNote message={turn.error} onRetry={() => onAsk(turn.question)} />}
      {turn.status === "cancelled" && (
        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <Ban className="size-4" />
          Stopped.
        </p>
      )}
    </article>
  );
}
