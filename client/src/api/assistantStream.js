export async function readAssistantStream(response, onText, interruptedMessage) {
  if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    throw new Error(interruptedMessage);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let length = 0;
  let completed = false;
  let metadata;
  function consume(line) {
    if (!line.trim()) return;
    if (completed) throw new Error(interruptedMessage);
    const event = JSON.parse(line);
    if (event.type === "delta" && typeof event.text === "string") {
      length += event.text.length;
      onText(event.text);
    } else if (event.type === "done" && length > 0 && event.length === length) {
      completed = true;
      metadata = { sources: Array.isArray(event.sources) ? event.sources : [] };
    } else {
      throw new Error(interruptedMessage);
    }
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (done) break;
    }
    if (buffer.trim() || !completed) throw new Error(interruptedMessage);
    return metadata;
  } catch {
    throw new Error(interruptedMessage);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
