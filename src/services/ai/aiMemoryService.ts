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

function simplifyMemoryText(text: string): string {
  return normalizeMemoryText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

function classifyMemoryFactSource(
  text: string,
): AIMemoryFact["source"] | null {
  const simplified = simplifyMemoryText(text);

  if (
    /^(mon objectif|mes objectifs|my goal|my goals|je veux|i want)\b/.test(
      simplified,
    )
  ) {
    return "user_goal";
  }

  if (/^(je prefere|i prefer|toujours|always|jamais|never)\b/.test(simplified)) {
    return "user_preference";
  }

  if (/^(ma regle|mes regles|my rule|my rules)\b/.test(simplified)) {
    return "user_rule";
  }

  return null;
}

function extractExplicitMemoryContent(text: string): string | null {
  const normalized = normalizeMemoryText(text);
  const simplified = simplifyMemoryText(text);
  const prefixMatch = simplified.match(
    /^(rappelle[- ]toi|souviens[- ]toi|remember|note|retiens|memorise|garde(?:\s+(?:ca|cela|ceci))?\s+en memoire|ajoute(?:\s+(?:ca|cela|ceci))?\s+a\s+ta\s+memoire|enregistre(?:\s+(?:ca|cela|ceci))?\s+en memoire)(?:\s+que)?\b[:,-]?\s*/,
  );

  if (!prefixMatch) return null;

  const content = normalizeMemoryText(normalized.slice(prefixMatch[0].length));
  return content || null;
}

export function extractPersistentMemoryFact(message: string): {
  content: string;
  source: AIMemoryFact["source"];
} | null {
  const normalized = normalizeMemoryText(message);
  if (!normalized) return null;

  const explicitContent = extractExplicitMemoryContent(normalized);
  const factContent = explicitContent ?? normalized;
  const source = classifyMemoryFactSource(factContent);

  if (!explicitContent && !source) return null;

  return {
    content: truncateText(factContent, 220),
    source: source ?? "user_context",
  };
}

export function buildInteractionMemorySummary(
  userMessage: string,
  assistantMessage: string,
): string | null {
  const user = normalizeMemoryText(userMessage);
  const assistant = normalizeMemoryText(assistantMessage);
  if (!user || !assistant) return null;

  const summary = `Sujet: ${truncateText(user, 120)} | Reponse: ${truncateText(assistant, 180)}`;
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
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
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
