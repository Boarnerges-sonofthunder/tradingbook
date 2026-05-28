import { describe, expect, it } from "vitest";
import { consumeAIStreamBuffer } from "./aiStreamParser";

describe("consumeAIStreamBuffer", () => {
  it("parse tokens from SSE data blocks", () => {
    const input = [
      'data: {"choices":[{"delta":{"content":"Bon"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"jour"}}]}',
      "",
      "",
    ].join("\n");

    const result = consumeAIStreamBuffer(input);

    expect(result.tokens).toEqual(["Bon", "jour"]);
    expect(result.remainder).toBe("");
    expect(result.done).toBe(false);
  });

  it("keeps partial SSE block in remainder", () => {
    const input = 'data: {"choices":[{"delta":{"content":"Part"}}]}';

    const result = consumeAIStreamBuffer(input);

    expect(result.tokens).toEqual([]);
    expect(result.remainder).toContain('"Part"');
    expect(result.done).toBe(false);
  });

  it("parses ndjson lines", () => {
    const input = [
      '{"response":"alpha"}',
      '{"choices":[{"delta":{"content":"beta"}}]}',
      "",
    ].join("\n");

    const result = consumeAIStreamBuffer(input);

    expect(result.tokens).toEqual(["alpha", "beta"]);
    expect(result.done).toBe(false);
  });

  it("returns done on DONE sentinel", () => {
    const input = ["data: [DONE]", "", '{"response":"ignored"}', ""].join("\n");

    const result = consumeAIStreamBuffer(input);

    expect(result.done).toBe(true);
    expect(result.tokens).toEqual([]);
    expect(result.remainder).toBe("");
  });
});
