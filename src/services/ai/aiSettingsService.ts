import { getSetting, setSetting } from "../settings/settingsService";

export interface AIProviderSettings {
  endpoint: string;
  model: string;
  timeoutMs: number;
  streamingEnabled: boolean;
}

export const DEFAULT_AI_PROVIDER_SETTINGS: AIProviderSettings = {
  endpoint: "http://127.0.0.1:11434/v1/chat/completions",
  model: "qwen2.5:7b",
  timeoutMs: 60_000,
  streamingEnabled: true,
};

const KEY_ENDPOINT = "ai.chat.endpoint";
const KEY_MODEL = "ai.chat.model";
const KEY_TIMEOUT_MS = "ai.chat.timeoutMs";
const KEY_STREAMING_ENABLED = "ai.chat.streamingEnabled";

function normalizeTimeoutMs(value: string | null): number {
  if (!value) return DEFAULT_AI_PROVIDER_SETTINGS.timeoutMs;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_AI_PROVIDER_SETTINGS.timeoutMs;
  return Math.min(120_000, Math.max(2_000, Math.round(parsed)));
}

function normalizeBoolean(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

export async function getAIProviderSettings(): Promise<AIProviderSettings> {
  const [endpointRaw, modelRaw, timeoutRaw, streamingRaw] = await Promise.all([
    getSetting(KEY_ENDPOINT),
    getSetting(KEY_MODEL),
    getSetting(KEY_TIMEOUT_MS),
    getSetting(KEY_STREAMING_ENABLED),
  ]);

  return {
    endpoint: endpointRaw?.trim() || DEFAULT_AI_PROVIDER_SETTINGS.endpoint,
    model: modelRaw?.trim() || DEFAULT_AI_PROVIDER_SETTINGS.model,
    timeoutMs: normalizeTimeoutMs(timeoutRaw),
    streamingEnabled: normalizeBoolean(
      streamingRaw,
      DEFAULT_AI_PROVIDER_SETTINGS.streamingEnabled,
    ),
  };
}

export async function saveAIProviderSettings(
  settings: Partial<AIProviderSettings>,
): Promise<void> {
  const writes: Array<Promise<void>> = [];

  if (settings.endpoint !== undefined) {
    writes.push(setSetting(KEY_ENDPOINT, settings.endpoint.trim()));
  }

  if (settings.model !== undefined) {
    writes.push(setSetting(KEY_MODEL, settings.model.trim()));
  }

  if (settings.timeoutMs !== undefined) {
    const timeoutMs = Math.min(120_000, Math.max(2_000, Math.round(settings.timeoutMs)));
    writes.push(setSetting(KEY_TIMEOUT_MS, String(timeoutMs)));
  }

  if (settings.streamingEnabled !== undefined) {
    writes.push(setSetting(KEY_STREAMING_ENABLED, String(settings.streamingEnabled)));
  }

  await Promise.all(writes);
}

export async function resetAIProviderSettings(): Promise<void> {
  await saveAIProviderSettings(DEFAULT_AI_PROVIDER_SETTINGS);
}
