import type { AIChatRequest, AIChatResponse } from "../../types/ai";
import { fetch } from "@tauri-apps/plugin-http";
import { createLogger } from "../logging";
import { exportAnalyticsForAI } from "./aiExportService";
import {
  createAIMessage,
  logAIInteraction,
  saveAIConversation,
} from "./aiConversationService";
import {
  buildConversationForModel,
  buildAISystemPrompt,
  sanitizeAIOutput,
} from "./aiPromptBuilder";
import { consumeAIStreamBuffer } from "./aiStreamParser";
import {
  DEFAULT_AI_PROVIDER_SETTINGS,
  getAIProviderSettings,
} from "./aiSettingsService";

const logger = createLogger("ai-chat");

function getErrorMessage(error: unknown): string {
  const isAbortLikeMessage = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("bodystreambuffer was aborted") ||
      normalized.includes("operation was aborted") ||
      normalized.includes("aborted")
    );
  };

  // Détecte une erreur réseau (Ollama non démarré, port fermé, etc.)
  const isNetworkError = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return (
      normalized === "failed to fetch" ||
      normalized.includes("networkerror") ||
      normalized.includes("network error") ||
      normalized.includes("econnrefused") ||
      normalized.includes("connection refused")
    );
  };

  if (error instanceof Error && error.message.trim()) {
    if (error.name === "AbortError" || isAbortLikeMessage(error.message)) {
      return "Flux IA interrompu (timeout/stream). Augmentez timeout IA (ex: 60000) ou désactivez streaming.";
    }
    if (isNetworkError(error.message)) {
      return "Ollama n'est pas démarré ou inaccessible. Lancez Ollama, vérifiez l'endpoint dans Paramètres IA, puis relancez.";
    }
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    if (
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      const message = (error as { message: string }).message.trim();
      if (isAbortLikeMessage(message)) {
        return "Flux IA interrompu (timeout/stream). Augmentez timeout IA (ex: 60000) ou désactivez streaming.";
      }
      if (isNetworkError(message)) {
        return "Ollama n'est pas démarré ou inaccessible. Lancez Ollama, vérifiez l'endpoint dans Paramètres IA, puis relancez.";
      }
      if (message) return message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return "Erreur inconnue pendant requête IA.";
}

function isRetryableAbortError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("interrompu") ||
    message.includes("aborted") ||
    message.includes("timeout")
  );
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string };
  }>;
  message?: { content?: string };
}

function getContentFromJson(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "choices" in payload &&
    Array.isArray((payload as { choices?: unknown }).choices)
  ) {
    const first = (payload as OpenAIStreamChunk).choices?.[0];
    const content = first?.message?.content ?? first?.delta?.content;
    if (typeof content === "string") return content;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "response" in payload &&
    typeof (payload as { response?: unknown }).response === "string"
  ) {
    return (payload as { response: string }).response;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof (payload as OpenAIStreamChunk).message?.content === "string"
  ) {
    return (payload as OpenAIStreamChunk).message?.content ?? "";
  }

  return "";
}

async function readSSEStream(
  response: Response,
  onToken?: (token: string) => void,
): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";
  let doneSignal = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const consumed = consumeAIStreamBuffer(buffer);
    buffer = consumed.remainder;

    for (const token of consumed.tokens) {
      finalText += token;
      onToken?.(token);
    }

    if (consumed.done) {
      doneSignal = true;
      break;
    }
  }

  if (!doneSignal && buffer.trim()) {
    // Dernier fragment: tentative best effort.
    const consumed = consumeAIStreamBuffer(`${buffer}\n`);
    for (const token of consumed.tokens) {
      finalText += token;
      onToken?.(token);
    }
  }

  return finalText;
}

async function callAIModel(
  endpoint: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  timeoutMs: number,
  onToken?: (token: string) => void,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const wantsStreaming = typeof onToken === "function";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: wantsStreaming
          ? "text/event-stream, application/x-ndjson, application/json"
          : "application/json",
      },
      body: JSON.stringify({
        model,
        stream: wantsStreaming,
        temperature: 0.2,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`IA indisponible (${response.status})`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isStreamLike =
      wantsStreaming &&
      response.body !== null &&
      (contentType.includes("text/event-stream") ||
        contentType.includes("application/x-ndjson") ||
        contentType.includes("text/plain"));

    if (isStreamLike) {
      const streamed = await readSSEStream(response, onToken);
      if (streamed.trim()) return streamed;
    }

    const json = (await response.json()) as unknown;
    const content = getContentFromJson(json);

    if (wantsStreaming && content) {
      for (const token of content.split(/(\s+)/)) {
        if (token) onToken(token);
      }
    }

    return content;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function askAIAnalytics(
  request: AIChatRequest,
): Promise<AIChatResponse> {
  const conversation = request.conversation;
  const userMessage = createAIMessage("user", request.userMessage.trim());

  let conversationWithUser = {
    ...conversation,
    messages: [...conversation.messages, userMessage],
    updatedAt: new Date().toISOString(),
  };

  let assistantText = "";
  let latestPath = "ai_exports/latest-analytics.json";
  let logsPath = "";

  try {
    saveAIConversation(conversationWithUser);

    const { data: exportData, latestPath: exportedPath } =
      await exportAnalyticsForAI();
    latestPath = exportedPath;

    const systemPrompt = buildAISystemPrompt(exportData);
    const modelMessages = buildConversationForModel(
      systemPrompt,
      conversation.messages,
      request.userMessage,
    );

    const configured = await getAIProviderSettings().catch(
      () => DEFAULT_AI_PROVIDER_SETTINGS,
    );

    const endpoint = request.endpoint ?? configured.endpoint;
    const model = request.model ?? configured.model;
    const timeoutMs = request.timeoutMs ?? configured.timeoutMs;
    const onToken = configured.streamingEnabled ? request.onToken : undefined;

    try {
      assistantText = await callAIModel(
        endpoint,
        model,
        modelMessages,
        timeoutMs,
        onToken,
      );
    } catch (error) {
      const canRetry = request.timeoutMs === undefined && isRetryableAbortError(error);
      if (!canRetry) {
        throw error;
      }

      const fallbackTimeoutMs = Math.max(timeoutMs * 3, 60_000);
      logger.warn(
        "Retry IA sans streaming après interruption flux",
        { timeoutMs, fallbackTimeoutMs },
      );

      assistantText = await callAIModel(
        endpoint,
        model,
        modelMessages,
        fallbackTimeoutMs,
      );
    }

    if (!assistantText.trim()) {
      assistantText =
        "Je n'ai pas reçu de contenu IA exploitable. Vérifiez endpoint Ollama local.";
    }

    assistantText = sanitizeAIOutput(assistantText);

    const assistantMessage = createAIMessage("assistant", assistantText);
    const updatedConversation = {
      ...conversationWithUser,
      messages: [...conversationWithUser.messages, assistantMessage],
      updatedAt: new Date().toISOString(),
    };

    saveAIConversation(updatedConversation);

    logsPath = await logAIInteraction({
      conversationId: updatedConversation.id,
      userMessage: userMessage.content,
      assistantMessage: assistantMessage.content,
      exportPath: latestPath,
      success: true,
    }).catch(() => "");

    return {
      message: assistantMessage,
      exportPath: latestPath,
      logsPath,
    };
  } catch (error) {
    const message = getErrorMessage(error);

    logger.error("Echec requete IA", error);

    const assistantMessage = createAIMessage(
      "assistant",
      `Erreur IA: ${message}`,
      true,
    );

    const updatedConversation = {
      ...conversationWithUser,
      messages: [...conversationWithUser.messages, assistantMessage],
      updatedAt: new Date().toISOString(),
    };

    saveAIConversation(updatedConversation);

    logsPath = await logAIInteraction({
      conversationId: updatedConversation.id,
      userMessage: userMessage.content,
      assistantMessage: assistantMessage.content,
      exportPath: latestPath,
      success: false,
      error: message,
    }).catch(() => "");

    return {
      message: assistantMessage,
      exportPath: latestPath,
      logsPath,
    };
  }
}
