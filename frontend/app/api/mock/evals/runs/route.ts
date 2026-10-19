import { connection } from "next/server";
import { listRuns, startRun } from "@/lib/mock/evals-store";
import { requireAdmin } from "@/lib/mock/http";
import type { Split } from "@/lib/types";

const SPLITS: readonly string[] = ["train", "test", "all"];

export async function GET() {
  await connection(); // the store changes between requests, so never prerender this
  return Response.json(listRuns());
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { split?: unknown; memory?: unknown };
  if (typeof body.split !== "string" || !SPLITS.includes(body.split) || typeof body.memory !== "boolean") {
    return Response.json({ detail: "split must be train, test or all, and memory a boolean." }, { status: 422 });
  }
  const started = startRun(body.split as Split, body.memory);
  if (!started) return Response.json({ detail: "An eval run is already in progress." }, { status: 409 });
  return Response.json(started, { status: 202 });
}
