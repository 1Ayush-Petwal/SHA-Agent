import { scenarioFor } from "@/lib/mock/ask-scenarios";

const encoder = new TextEncoder();

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 500) {
    return Response.json({ detail: "The question must be 1 to 500 characters." }, { status: 422 });
  }
  const script = scenarioFor(question);
  if (script.kind === "status") return Response.json(script.body, { status: script.status });

  const { signal } = request;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of script.events) {
        // Model calls take seconds; a short pause per step keeps the timeline readable without dragging.
        await pause(event.type === "step" ? 300 + Math.random() * 500 : 400, signal);
        if (signal.aborted) break;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\r\n\r\n`));
      }
      try {
        controller.close();
      } catch {
        // Already closed by the client going away.
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
  });
}
