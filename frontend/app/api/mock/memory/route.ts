import { requireAdmin } from "@/lib/mock/http";

const g = globalThis as typeof globalThis & { __fixpointMockMemory?: Set<string> };

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { question?: unknown; sql?: unknown };
  if (typeof body.question !== "string" || typeof body.sql !== "string" || !body.question.trim() || !body.sql.trim()) {
    return Response.json({ detail: "question and sql are required." }, { status: 422 });
  }
  const saved = (g.__fixpointMockMemory ??= new Set());
  const key = body.question.trim().toLowerCase();
  const status = saved.has(key) ? "merged" : "inserted";
  saved.add(key);
  return Response.json({ status });
}
