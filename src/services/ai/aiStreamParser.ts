interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string };
  }>;
  message?: { content?: string };
  response?: string;
  done?: boolean;
}

interface ParsedChunk {
  token: string;
  done: boolean;
}

function getTokenFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";

  if ("choices" in payload && Array.isArray((payload as OpenAIStreamChunk).choices)) {
    const first = (payload as OpenAIStreamChunk).choices?.[0];
    return first?.delta?.content ?? first?.message?.content ?? "";
  }

  if ("response" in payload && typeof (payload as OpenAIStreamChunk).response === "string") {
    return (payload as OpenAIStreamChunk).response ?? "";
  }

  if (
    "message" in payload &&
    typeof (payload as OpenAIStreamChunk).message?.content === "string"
  ) {
    return (payload as OpenAIStreamChunk).message?.content ?? "";
  }

  return "";
}

function parseDataPayload(data: string): ParsedChunk {
  const trimmed = data.trim();
  if (!trimmed) return { token: "", done: false };
  if (trimmed === "[DONE]") return { token: "", done: true };

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const done =
      typeof parsed === "object" &&
      parsed !== null &&
      "done" in parsed &&
      (parsed as { done?: unknown }).done === true;

    return { token: getTokenFromPayload(parsed), done };
  } catch {
    return { token: trimmed, done: false };
  }
}

function parseSSEBlock(block: string): ParsedChunk {
  const dataLines: string[] = [];
  const lines = block.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return { token: "", done: false };
  }

  return parseDataPayload(dataLines.join("\n"));
}

function processNdjsonLine(line: string): ParsedChunk {
  const trimmed = line.trim();
  if (!trimmed) return { token: "", done: false };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseDataPayload(trimmed);
  }
  return { token: "", done: false };
}

export function consumeAIStreamBuffer(rawBuffer: string): {
  remainder: string;
  tokens: string[];
  done: boolean;
} {
  let buffer = rawBuffer.replace(/\r\n/g, "\n");
  const tokens: string[] = [];
  let done = false;

  while (buffer.includes("\n\n")) {
    const idx = buffer.indexOf("\n\n");
    const block = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);

    const parsed = parseSSEBlock(block);
    if (parsed.token) tokens.push(parsed.token);
    if (parsed.done) {
      done = true;
      return { remainder: "", tokens, done };
    }
  }

  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    const parsed = processNdjsonLine(line);
    if (parsed.token) tokens.push(parsed.token);
    if (parsed.done) {
      done = true;
      return { remainder: "", tokens, done };
    }
  }

  return { remainder: buffer, tokens, done };
}
