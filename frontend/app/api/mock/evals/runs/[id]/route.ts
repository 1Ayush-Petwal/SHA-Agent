import { connection } from "next/server";
import { getRun } from "@/lib/mock/evals-store";

export async function GET(_request: Request, ctx: RouteContext<"/api/mock/evals/runs/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const detail = getRun(Number(id));
  if (!detail) return Response.json({ detail: `No eval run with id ${id}.` }, { status: 404 });
  return Response.json(detail);
}
