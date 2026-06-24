import type {
  AIAnalyticsExport,
  AIChatRequest,
  AIChatResponse,
  AIMemoryScope,
} from "../../types/ai";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { createLogger } from "../logging";
import { exportAnalyticsForAI } from "./aiExportService";
import {
  createAIMessage,
  logAIInteraction,
  saveAIConversation,
} from "./aiConversationService";
import {
  buildScopedAIMemoryState,
  loadAIMemoryState,
  updateAIMemoryFromInteraction,
} from "./aiMemoryService";
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
      normalized.includes("connection refused") ||
      normalized.includes("error sending request for url") ||
      normalized.includes("tcp connect error") ||
      normalized.includes("dns error")
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

interface LocalAIHttpResponse {
  status: number;
  content_type?: string | null;
  body: string;
}

function deriveScopedMemoryContext(input: {
  userMessage: string;
  exportData: AIAnalyticsExport;
  fallbackScope?: AIMemoryScope | null;
}): AIMemoryScope | null {
  const lowerMessage = input.userMessage.toLowerCase();

  const matchedSymbol = input.exportData.symbols.find((item) =>
    lowerMessage.includes(item.symbol.toLowerCase()),
  );
  if (matchedSymbol) {
    return {
      key: `symbol:${matchedSymbol.symbol.toUpperCase()}`,
      label: `Symbole ${matchedSymbol.symbol.toUpperCase()}`,
    };
  }

  const matchedStrategy = input.exportData.strategies.find((item) =>
    lowerMessage.includes(item.strategyName.toLowerCase()),
  );
  if (matchedStrategy) {
    return {
      key: `strategy:${matchedStrategy.strategyName.toLowerCase()}`,
      label: `Stratégie ${matchedStrategy.strategyName}`,
    };
  }

  return input.fallbackScope ?? null;
}

function summarizeAIEndpoint(endpoint: string): string {
  try {
    const parsed = new URL(endpoint);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return endpoint;
  }
}

function isLocalAIEndpoint(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

function isLocalTransportFailure(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("error sending request for url") ||
    message.includes("connection refused") ||
    message.includes("tcp connect error") ||
    message.includes("failed to fetch") ||
    message.includes("network error")
  );
}

function isLocalTimeoutFailure(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("operation timed out") ||
    message.includes("request timed out") ||
    message.includes("timeout") ||
    message.includes("deadline has elapsed")
  );
}

function buildLocalAICandidateEndpoints(endpoint: string): string[] {
  const candidates = new Set<string>();
  candidates.add(endpoint);

  try {
    const parsed = new URL(endpoint);
    const pathname = parsed.pathname;
    const host = parsed.host;
    const protocol = parsed.protocol;

    const add = (path: string, hostname: string): void => {
      candidates.add(`${protocol}//${hostname}:${parsed.port || "11434"}${path}`);
    };

    if (pathname === "/v1/chat/completions") {
      add("/api/chat", parsed.hostname);
    } else if (pathname === "/api/chat") {
      add("/v1/chat/completions", parsed.hostname);
    }

    if (host.startsWith("127.0.0.1")) {
      if (pathname === "/v1/chat/completions") {
        add("/v1/chat/completions", "localhost");
        add("/api/chat", "localhost");
      } else if (pathname === "/api/chat") {
        add("/api/chat", "localhost");
        add("/v1/chat/completions", "localhost");
      }
    }

    if (host.startsWith("localhost")) {
      if (pathname === "/v1/chat/completions") {
        add("/v1/chat/completions", "127.0.0.1");
        add("/api/chat", "127.0.0.1");
      } else if (pathname === "/api/chat") {
        add("/api/chat", "127.0.0.1");
        add("/v1/chat/completions", "127.0.0.1");
      }
    }
  } catch {
    // Endpoint invalide : on garde la valeur brute initiale.
  }

  return [...candidates];
}

function buildAIRequestHeaders(
  endpoint: string,
  wantsStreaming: boolean,
): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: wantsStreaming
      ? "text/event-stream, application/x-ndjson, application/json"
      : "application/json",
  });

  if (isLocalAIEndpoint(endpoint)) {
    // Tauri WebView origin `http://tauri.localhost` can make local Ollama
    // reject native requests with 403. Force empty browser-origin headers.
    headers.set("Origin", "");
    headers.set("Referer", "");
  }

  return headers;
}

function buildAIHttpErrorMessage(
  status: number,
  endpoint: string,
  responseText: string,
): string {
  const body = responseText.trim();
  const bodyLower = body.toLowerCase();
  const endpointSummary = summarizeAIEndpoint(endpoint);
  const localEndpoint = isLocalAIEndpoint(endpoint);

  if (status === 401) {
    return localEndpoint
      ? "Endpoint IA local a refusé l'authentification (401). Vérifiez proxy/modèle local."
      : "Authentification IA refusée (401). Vérifiez la clé API et les en-têtes du fournisseur.";
  }

  if (status === 403) {
    if (
      bodyLower.includes("url not allowed") ||
      bodyLower.includes("not allowed") ||
      bodyLower.includes("scope") ||
      bodyLower.includes("forbidden url") ||
      bodyLower.includes("denied")
    ) {
      return `Endpoint IA bloqué par permissions de l'application: ${endpointSummary}`;
    }

    return localEndpoint
      ? `Endpoint IA local a refusé la requête (403): ${endpointSummary}`
      : `Endpoint IA a refusé la requête (403): ${endpointSummary}`;
  }

  if (status === 404) {
    return localEndpoint
      ? `Endpoint IA local introuvable (404): ${endpointSummary}. Vérifiez URL Ollama.`
      : `Endpoint IA introuvable (404): ${endpointSummary}`;
  }

  if (status === 429) {
    return "Limite du fournisseur IA atteinte (429). Réessayez plus tard.";
  }

  if (status >= 500) {
    return `Serveur IA indisponible (${status}): ${endpointSummary}`;
  }

  if (body) {
    return `IA indisponible (${status}): ${body.slice(0, 240)}`;
  }

  return `IA indisponible (${status})`;
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
  if (isLocalAIEndpoint(endpoint)) {
    const localCandidates = buildLocalAICandidateEndpoints(endpoint);
    let lastTransportError: unknown = null;
    let seenTimeout = false;

    for (const localEndpoint of localCandidates) {
      let localResponse: LocalAIHttpResponse;
      try {
        localResponse = await invoke<LocalAIHttpResponse>(
          "fetch_local_ai_completion",
          {
            endpoint: localEndpoint,
            model,
            messages,
            timeoutMs,
          },
        );
      } catch (error) {
        if (isLocalTimeoutFailure(error)) {
          lastTransportError = error;
          seenTimeout = true;
          logger.warn("Timeout IA locale, arret des endpoints de secours", {
            endpoint: summarizeAIEndpoint(localEndpoint),
            model,
            timeoutMs,
            error: getErrorMessage(error),
          });
          break;
        }

        if (isLocalTransportFailure(error)) {
          lastTransportError = error;
          logger.warn("Transport IA locale indisponible, tentative endpoint suivant", {
            endpoint: summarizeAIEndpoint(localEndpoint),
            model,
            error: getErrorMessage(error),
          });
          continue;
        }
        throw error;
      }

      if (localResponse.status < 200 || localResponse.status >= 300) {
        logger.warn("Requete IA locale refusee", {
          endpoint: summarizeAIEndpoint(localEndpoint),
          model,
          status: localResponse.status,
          body: localResponse.body.slice(0, 240),
        });
        throw new Error(
          buildAIHttpErrorMessage(
            localResponse.status,
            localEndpoint,
            localResponse.body,
          ),
        );
      }

      let content = "";
      const contentType = localResponse.content_type ?? "";

      if (contentType.includes("application/json")) {
        try {
          content = getContentFromJson(JSON.parse(localResponse.body));
        } catch {
          content = localResponse.body;
        }
      } else {
        content = localResponse.body;
      }

      if (onToken && content) {
        for (const token of content.split(/(\s+)/)) {
          if (token) onToken(token);
        }
      }

      return content;
    }

    if (lastTransportError) {
      if (seenTimeout) {
        throw new Error(
          "Ollama local répond trop lentement (timeout). Augmentez le timeout IA (ex: 120000) ou utilisez un modèle plus léger (ex: qwen2.5:7b).",
        );
      }
      throw new Error(
        "Ollama local inaccessible. Verifiez que serveur tourne sur 127.0.0.1:11434 (ou localhost:11434), puis retentez.",
      );
    }

    throw new Error("Aucun endpoint IA local valide.");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const wantsStreaming = typeof onToken === "function";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildAIRequestHeaders(endpoint, wantsStreaming),
      body: JSON.stringify({
        model,
        stream: wantsStreaming,
        temperature: 0.2,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      logger.warn("Requete IA refusee", {
        endpoint: summarizeAIEndpoint(endpoint),
        model,
        status: response.status,
        body: responseText.slice(0, 240),
      });
      throw new Error(
        buildAIHttpErrorMessage(response.status, endpoint, responseText),
      );
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

export const __aiChatServiceTestUtils = {
  buildAIRequestHeaders,
  isLocalAIEndpoint,
  buildLocalAICandidateEndpoints,
};

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
      await exportAnalyticsForAI(
        request.analyticsFilters,
        request.memoryScope?.label ?? null,
      );
    latestPath = exportedPath;

    const derivedScope = deriveScopedMemoryContext({
      userMessage: request.userMessage,
      exportData,
      fallbackScope: request.memoryScope,
    });
    const memory = await loadAIMemoryState().catch(() => null);
    const scopedMemory = memory
      ? buildScopedAIMemoryState(memory, derivedScope)
      : null;
    const systemPrompt = buildAISystemPrompt(exportData, scopedMemory, derivedScope);
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
    await updateAIMemoryFromInteraction({
      userMessage: userMessage.content,
      assistantMessage: assistantText,
      scope: derivedScope,
    }).catch(() => undefined);

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
      conversation: updatedConversation,
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
      conversation: updatedConversation,
      exportPath: latestPath,
      logsPath,
    };
  }
}
