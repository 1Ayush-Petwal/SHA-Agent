import type { Metadata } from "next";
import { Suspense } from "react";
import { RunDetailView } from "@/components/evals/run-detail";

export const metadata: Metadata = { title: "Eval run" };

export default function RunPage({ params }: PageProps<"/evals/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading run</p>}>
      <RunDetailView params={params} />
    </Suspense>
  );
}
