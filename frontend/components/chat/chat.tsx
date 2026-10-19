"use client";

import { ArrowUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ExampleQuestions } from "@/components/chat/example-questions";
import { TurnView } from "@/components/chat/turn-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminToken } from "@/lib/admin";
import { ApiError, ask } from "@/lib/api";
import { turnsReducer } from "@/lib/turns";

const MAX_QUESTION = 500;

export function Chat() {
  const [turns, dispatch] = useReducer(turnsReducer, []);
  const [draft, setDraft] = useState("");
  const [token] = useAdminToken();
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const pendingAbort = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const params = useSearchParams();
  const linked = useRef(false);

  const run = useCallback(
    async (question: string) => {
      const q = question.trim().slice(0, MAX_QUESTION);
      if (!q) return;
      controller.current?.abort();
      const c = new AbortController();
      controller.current = c;
      const id = nextId.current++;
      dispatch({ type: "start", id, question: q });
      requestAnimationFrame(() =>
        document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
      try {
        for await (const event of ask(q, { signal: c.signal, token })) dispatch({ type: "event", id, event });
      } catch (e) {
        if (c.signal.aborted) dispatch({ type: "cancel", id });
        else
          dispatch({
            type: "fail",
            id,
            message: e instanceof ApiError ? e.message : "Couldn't reach the server. Check your connection and try again.",
          });
      }
    },
    [token],
  );

  // /ask?q=... asks on arrival, so a question can be linked to.
  useEffect(() => {
    const q = params.get("q");
    if (q && !linked.current) {
      linked.current = true;
      void run(q);
    }
  }, [params, run]);

  // Leaving the page (or Next hiding it during navigation) aborts the stream, which cancels the run on the server.
  // Deferred a tick so React's dev StrictMode unmount-and-remount doesn't kill a run that was just started.
  useEffect(() => {
    clearTimeout(pendingAbort.current);
    return () => {
      pendingAbort.current = setTimeout(() => controller.current?.abort(), 0);
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      {turns.length === 0 ? (
        <section className="py-4">
          <p className="eyebrow">Ask the warehouse</p>
          <h1 className="mt-2">What do you want to know?</h1>
          <p className="mt-2 max-w-[62ch] text-muted-foreground">
            Ask about orders, customers, sellers, payments, reviews and delivery in the Olist marketplace, September
            2016 to October 2018. Every answer shows its SQL, and a result that fails a check is repaired before you see
            it.
          </p>
          <ExampleQuestions onPick={run} />
        </section>
      ) : (
        <ol className="flex flex-col gap-10 pb-6">
          {turns.map((t) => (
            <li key={t.id} id={`turn-${t.id}`} className="scroll-mt-28 sm:scroll-mt-20">
              <TurnView turn={t} onAsk={run} />
            </li>
          ))}
        </ol>
      )}
      <form
        className="sticky bottom-0 -mx-4 mt-auto -mb-12 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          void run(draft);
          setDraft("");
        }}
      >
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_QUESTION}
            placeholder="Ask a question about the marketplace"
            aria-label="Your question"
            className="h-10 bg-card"
          />
          <Button type="submit" size="lg" className="h-10 px-4" disabled={!draft.trim()}>
            <ArrowUp data-icon="inline-start" />
            <span className="max-sm:sr-only">Ask</span>
          </Button>
        </div>
        {draft.length > MAX_QUESTION - 100 && (
          <p className="mt-1 text-right text-xs text-muted-foreground tabular">
            {draft.length}/{MAX_QUESTION}
          </p>
        )}
      </form>
    </div>
  );
}
