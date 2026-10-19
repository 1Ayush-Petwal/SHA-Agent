import type { Metadata } from "next";
import { RunsView } from "@/components/evals/runs-view";

export const metadata: Metadata = { title: "Evals" };

export default function EvalsPage() {
  return <RunsView />;
}
