/**
 * Yields the data payload of each server-sent event in a stream of text chunks.
 * Events end at a blank line; lines end in \n, \r\n or \r (sse-starlette sends \r\n); multi-line data joins
 * with \n; comments and other fields are ignored; an unterminated last event is dropped, as the SSE spec says.
 */
export async function* sseData(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let buffer = "";
  for await (const chunk of chunks) {
    buffer += chunk;
    // Hold back a trailing \r: it may be the first half of a \r\n split across chunks.
    const held = buffer.endsWith("\r") ? "\r" : "";
    const blocks = buffer
      .slice(0, buffer.length - held.length)
      .replace(/\r\n?/g, "\n")
      .split("\n\n");
    buffer = (blocks.pop() ?? "") + held;
    for (const block of blocks) {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(line.startsWith("data: ") ? 6 : 5));
      if (data.length) yield data.join("\n");
    }
  }
}
