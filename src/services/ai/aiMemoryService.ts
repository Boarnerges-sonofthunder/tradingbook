import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type {
  AIMemoryFact,
  AIMemoryScope,
  AIMemoryState,
  AIMemorySummary,
} from "../../types/ai";
import { ensureAISandboxFolders, getAIMemoryFilePath } from "./aiSandboxService";

const MAX_MEMORY_FACTS = 20;
const MAX_MEMORY_SUMMARIES = 12;

function nowIso(): string {
  return new Date().toISOString();
}

function createMemoryId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMemoryText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function emptyMemoryState(): AIMemoryState {
  return {
    facts: [],
    summaries: [],
    updatedAt: nowIso(),
  };
}

function buildMemoryFact(
  content: string,
  source: AIMemoryFact["source"],
  scope?: AIMemoryScope | null,
): AIMemoryFact {
  const timestamp = nowIso();
  return {
    id: createMemoryId("fact"),
    content,
    source,
    scopeKey: scope?.key ?? null,
    scopeLabel: scope?.label ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildMemorySummary(
  content: string,
  scope?: AIMemoryScope | null,
): AIMemorySummary {
  return {
    id: createMemoryId("summary"),
    content,
    scopeKey: scope?.key ?? null,
    scopeLabel: scope?.label ?? null,
    createdAt: nowIso(),
  };
}

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function extractPersistentMemoryFact(message: string): {
  content: string;
  source: AIMemoryFact["source"];
} | null {
  const normalized = normalizeMemoryText(message);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  const patterns: Array<{
    test: (text: string) => boolean;
    source: AIMemoryFact["source"];
  }> = [
    {
      test: (text) =>
        /^(rappelle[- ]toi|souviens[- ]toi|remember|note|retiens)\b/.test(text),
      source: "user_context",
    },
    {
      test: (text) =>
        /^(mon objectif|mes objectifs|my goal|my goals|je veux|i want)\b/.test(text),
      source: "user_goal",
    },
    {
      test: (text) =>
        /^(je prefere|je préfère|i prefer|toujours|always|jamais|never)\b/.test(text),
      source: "user_preference",
    },
    {
      test: (text) =>
        /^(ma regle|ma règle|mes regles|mes règles|my rule|my rules)\b/.test(text),
      source: "user_rule",
    },
  ];

  const matched = patterns.find(({ test }) => test(lower));
  if (!matched) return null;

  return {
    content: truncateText(normalized, 220),
    source: matched.source,
  };
}

export function buildInteractionMemorySummary(
  userMessage: string,
  assistantMessage: string,
): string | null {
  const user = normalizeMemoryText(userMessage);
  const assistant = normalizeMemoryText(assistantMessage);
  if (!user || !assistant) return null;

  const summary = `Sujet: ${truncateText(user, 120)} | Réponse: ${truncateText(assistant, 180)}`;
  return truncateText(summary, 320);
}

export async function loadAIMemoryState(): Promise<AIMemoryState> {
  await ensureAISandboxFolders();
  const path = await getAIMemoryFilePath();

  if (!(await exists(path))) {
    return emptyMemoryState();
  }

  try {
    const raw = await readTextFile(path);
    const parsed = JSON.parse(raw) as Partial<AIMemoryState>;
    return {
      facts: Array.isArray(parsed.facts)
        ? parsed.facts.map((fact) => ({
            ...fact,
            scopeKey: fact.scopeKey ?? null,
            scopeLabel: fact.scopeLabel ?? null,
          }))
        : [],
      summaries: Array.isArray(parsed.summaries)
        ? parsed.summaries.map((summary) => ({
            ...summary,
            scopeKey: summary.scopeKey ?? null,
            scopeLabel: summary.scopeLabel ?? null,
          }))
        : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
    };
  } catch {
    return emptyMemoryState();
  }
}

export async function saveAIMemoryState(memory: AIMemoryState): Promise<void> {
  await ensureAISandboxFolders();
  const path = await getAIMemoryFilePath();
  await writeTextFile(
    path,
    JSON.stringify(
      {
        ...memory,
        updatedAt: nowIso(),
      },
      null,
      2,
    ),
    {
      create: true,
    },
  );
}

export async function updateAIMemoryFromInteraction(entry: {
  userMessage: string;
  assistantMessage: string;
  scope?: AIMemoryScope | null;
}): Promise<AIMemoryState> {
  const current = await loadAIMemoryState();
  const nextFacts = [...current.facts];
  const memoryFact = extractPersistentMemoryFact(entry.userMessage);

  if (memoryFact) {
    const existing = nextFacts.find(
      (fact) =>
        fact.content.toLowerCase() === memoryFact.content.toLowerCase() &&
        (fact.scopeKey ?? null) === (entry.scope?.key ?? null),
    );

    if (existing) {
      existing.updatedAt = nowIso();
      existing.source = memoryFact.source;
      existing.scopeKey = entry.scope?.key ?? null;
      existing.scopeLabel = entry.scope?.label ?? null;
    } else {
      nextFacts.unshift(
        buildMemoryFact(memoryFact.content, memoryFact.source, entry.scope),
      );
    }
  }

  const summaryText = buildInteractionMemorySummary(
    entry.userMessage,
    entry.assistantMessage,
  );
  const nextSummaries = [...current.summaries];

  if (summaryText) {
    nextSummaries.unshift(buildMemorySummary(summaryText, entry.scope));
  }

  const nextState: AIMemoryState = {
    facts: nextFacts.slice(0, MAX_MEMORY_FACTS),
    summaries: nextSummaries.slice(0, MAX_MEMORY_SUMMARIES),
    updatedAt: nowIso(),
  };

  await saveAIMemoryState(nextState);
  return nextState;
}

export async function clearAIMemoryState(): Promise<AIMemoryState> {
  const empty = emptyMemoryState();
  await saveAIMemoryState(empty);
  return empty;
}

export function buildScopedAIMemoryState(
  memory: AIMemoryState,
  scope?: AIMemoryScope | null,
): AIMemoryState {
  if (!scope) return memory;

  const isVisible = (scopeKey?: string | null) =>
    scopeKey == null || scopeKey === scope.key;

  return {
    facts: memory.facts.filter((fact) => isVisible(fact.scopeKey)),
    summaries: memory.summaries.filter((summary) => isVisible(summary.scopeKey)),
    updatedAt: memory.updatedAt,
  };
}

export const __aiMemoryServiceTestUtils = {
  extractPersistentMemoryFact,
  buildInteractionMemorySummary,
  buildScopedAIMemoryState,
};
