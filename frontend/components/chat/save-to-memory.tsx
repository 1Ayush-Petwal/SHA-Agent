"use client";

import { BookmarkPlus, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminToken } from "@/lib/admin";
import { ApiError, saveMemory } from "@/lib/api";

type State =
  | { status: "idle" | "saving" }
  | { status: "saved"; how: "inserted" | "merged" }
  | { status: "error"; message: string };

/** Admin only, and only offered on verified answers. */
export function SaveToMemory({ question, sql }: { question: string; sql: string }) {
  const [token] = useAdminToken();
  const [state, setState] = useState<State>({ status: "idle" });
  if (!token) return null;
  if (state.status === "saved") {
    return (
      <span className="ml-auto inline-flex items-center gap-1 text-success-foreground">
        <Check className="size-3.5" />
        {state.how === "merged" ? "Already in memory, use count raised" : "Saved to memory"}
      </span>
    );
  }
  return (
    <span className="ml-auto inline-flex items-center gap-2">
      {state.status === "error" && <span className="text-danger-foreground">{state.message}</span>}
      <Button
        size="xs"
        variant="outline"
        disabled={state.status === "saving"}
        onClick={async () => {
          setState({ status: "saving" });
          try {
            const res = await saveMemory(question, sql, token);
            setState({ status: "saved", how: res.status });
          } catch (e) {
            setState({ status: "error", message: e instanceof ApiError ? e.message : "Couldn't save." });
          }
        }}
      >
        <BookmarkPlus data-icon="inline-start" />
        Save to memory
      </Button>
    </span>
  );
}
