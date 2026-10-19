import { sseData } from "./sse.ts";
import type { AskEvent, EvalRun, RunDetail, Split } from "./types.ts";

/** The Fixpoint API. Unset means the in-repo mock under app/api/mock, so the UI runs without a backend. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/mock";
export const IS_MOCK = API_URL === "/api/mock";
export const ADMIN_HEADER = "X-Admin-Token";

export class ApiError extends Error {
  status: number;
  retryAfterS: number | null;

  constructor(message: string, status: number, retryAfterS: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterS = retryAfterS;
  }
}

function headers(token: string | null | undefined, json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (token) h[ADMIN_HEADER] = token;
  return h;
}

export function formatWait(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.ceil(seconds / 3600)} h`;
}

/** Turns a failed response into one readable sentence, whatever the body is. */
async function failure(res: Response): Promise<ApiError> {
  let detail = "";
  let retry: number | null = null;
  try {
    const body = (await res.json()) as { detail?: unknown; retry_after_s?: unknown } | null;
    if (typeof body?.detail === "string") detail = body.detail;
    if (typeof body?.retry_after_s === "number") retry = body.retry_after_s;
  } catch {
    // Not JSON: a proxy's HTML error page, or an empty body.
  }
  const header = Number(res.headers.get("Retry-After"));
  if (retry === null && header > 0) retry = header;
  if (res.status === 429) {
    const wait = retry ? `in ${formatWait(retry)}` : "a bit later";
    return new ApiError(`You've reached the question limit. Try again ${wait}.`, 429, retry);
  }
  if (res.status === 401 || res.status === 403) return new ApiError("The admin token was rejected.", res.status);
  if (res.status >= 500) {
    return new ApiError("The server is unavailable. It may be waking up; try again in a minute.", res.status);
  }
  return new ApiError(detail || `Request failed (${res.status}).`, res.status);
}

async function* textChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  // A TextDecoder rather than TextDecoderStream: TS's DOM lib types the latter's writable side too narrowly for pipeThrough.
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        const rest = decoder.decode();
        if (rest) yield rest;
        return;
      }
      yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Asks a question and yields the agent's step events, then one answer (or one error) event.
 * Aborting `signal` closes the connection, which cancels the run on the server.
 */
export async function* ask(
  question: string,
  opts: { signal?: AbortSignal; token?: string | null; fetchImpl?: typeof fetch } = {},
): AsyncGenerator<AskEvent> {
  const res = await (opts.fetchImpl ?? fetch)(`${API_URL}/ask`, {
    method: "POST",
    headers: { ...headers(opts.token, true), Accept: "text/event-stream" },
    body: JSON.stringify({ question }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw await failure(res);
  for await (const data of sseData(textChunks(res.body))) {
    const event = JSON.parse(data) as AskEvent;
    yield event;
    if (event.type !== "step") return;
  }
  throw new ApiError("The connection closed before an answer arrived.", 0);
}

async function json<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: headers(token, init.body !== undefined),
    cache: "no-store",
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

export const listRuns = () => json<EvalRun[]>("/evals/runs");

export const getRun = (id: string | number) => json<RunDetail>(`/evals/runs/${encodeURIComponent(id)}`);

export const startRun = (split: Split, memory: boolean, token: string) =>
  json<{ id: number }>("/evals/runs", { method: "POST", body: JSON.stringify({ split, memory }) }, token);

export const saveMemory = (question: string, sql: string, token: string) =>
  json<{ status: "inserted" | "merged" }>("/memory", { method: "POST", body: JSON.stringify({ question, sql }) }, token);
