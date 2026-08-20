import { getSetting, setSetting } from "../settings/settingsService";
import { detectMT5Terminals } from "./mt5TerminalDetectionService";

export const MT5_TERMINAL_PATHS_SETTING_KEY = "mt5TerminalPaths";
const MT5_DISCONNECTED_SOURCES_SETTING_KEY = "mt5DisconnectedSources";
const DEFAULT_MT5_SOURCE_KEY = "__default__";

function normalizeTerminalPath(path: string): string {
  return path.trim().replace(/\\/g, "/").toLowerCase();
}

function deduplicateTerminalPaths(
  terminalPaths: Array<string | null>,
): Array<string | null> {
  const seen = new Set<string>();
  const deduplicated: Array<string | null> = [];

  for (const terminalPath of terminalPaths) {
    const key =
      terminalPath === null
        ? DEFAULT_MT5_SOURCE_KEY
        : normalizeTerminalPath(terminalPath);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(terminalPath);
  }

  return deduplicated;
}

function parseValues(raw: string | null): string[] {
  if (raw == null || raw.trim() === "") return [];

  const dedup = new Set<string>();
  for (const token of raw.split(/[\r\n;,]/g)) {
    const normalized = token.trim();
    if (normalized !== "") {
      dedup.add(normalized);
    }
  }

  return [...dedup];
}

function serializeValues(values: Iterable<string>): string {
  return [...values].sort((a, b) => a.localeCompare(b)).join("\n");
}

export function sourceKeyFromTerminalPath(terminalPath: string | null): string {
  return terminalPath === null
    ? DEFAULT_MT5_SOURCE_KEY
    : normalizeTerminalPath(terminalPath);
}

export function parseManualTerminalPaths(raw: string | null): string[] {
  return parseValues(raw);
}

export async function resolveMT5TerminalSources(): Promise<Array<string | null>> {
  try {
    const detected = await detectMT5Terminals();
    if (detected.success && detected.totalTerminals > 0) {
      return deduplicateTerminalPaths(detected.terminals.map((t) => t.path));
    }
  } catch {
    // Détection non critique — fallback silencieux
  }

  const rawManual = await getSetting(MT5_TERMINAL_PATHS_SETTING_KEY);
  const manual = parseManualTerminalPaths(rawManual);
  if (manual.length > 0) {
    return deduplicateTerminalPaths(manual);
  }

  return [null];
}

export async function getDisconnectedMT5SourceKeys(): Promise<Set<string>> {
  const raw = await getSetting(MT5_DISCONNECTED_SOURCES_SETTING_KEY);
  return new Set(
    parseValues(raw).map((value) =>
      value === DEFAULT_MT5_SOURCE_KEY
        ? DEFAULT_MT5_SOURCE_KEY
        : normalizeTerminalPath(value),
    ),
  );
}

export function isMT5SourceConnected(
  terminalPath: string | null,
  disconnectedKeys: ReadonlySet<string>,
): boolean {
  return !disconnectedKeys.has(sourceKeyFromTerminalPath(terminalPath));
}

export async function resolveConnectedMT5TerminalSources(): Promise<Array<string | null>> {
  const [sources, disconnected] = await Promise.all([
    resolveMT5TerminalSources(),
    getDisconnectedMT5SourceKeys(),
  ]);

  return sources.filter((terminalPath) =>
    isMT5SourceConnected(terminalPath, disconnected),
  );
}

export async function setMT5SourceConnected(
  terminalPath: string | null,
  connected: boolean,
): Promise<void> {
  const key = sourceKeyFromTerminalPath(terminalPath);
  const disconnected = await getDisconnectedMT5SourceKeys();

  if (connected) {
    disconnected.delete(key);
  } else {
    disconnected.add(key);
  }

  await setSetting(
    MT5_DISCONNECTED_SOURCES_SETTING_KEY,
    serializeValues(disconnected),
  );
}
