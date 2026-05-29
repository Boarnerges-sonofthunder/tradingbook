import { describe, expect, it } from "vitest";
import { __aiChatServiceTestUtils } from "./aiChatService";

describe("aiChatService request headers", () => {
  it("clears browser origin headers for local Ollama endpoints", () => {
    const headers = __aiChatServiceTestUtils.buildAIRequestHeaders(
      "http://127.0.0.1:11434/v1/chat/completions",
      true,
    );

    expect(headers.get("Origin")).toBe("");
    expect(headers.get("Referer")).toBe("");
    expect(headers.get("Accept")).toContain("text/event-stream");
  });

  it("does not inject empty origin headers for remote endpoints", () => {
    const headers = __aiChatServiceTestUtils.buildAIRequestHeaders(
      "https://api.openai.com/v1/chat/completions",
      false,
    );

    expect(headers.has("Origin")).toBe(false);
    expect(headers.has("Referer")).toBe(false);
    expect(headers.get("Accept")).toBe("application/json");
  });
});
