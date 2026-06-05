import type {
  AIAnalyticsExport,
  AIChatMessage,
  AIMemoryScope,
  AIMemoryState,
} from "../../types/ai";
import { AI_SANDBOX_LIMITATIONS } from "./aiSandboxService";

export interface AIModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const MAX_PROMPT_HABITS = 8;
const MAX_PROMPT_EMOTIONS = 6;
const MAX_PROMPT_ERRORS = 8;
const MAX_PROMPT_TRADE_NOTES = 6;
const MAX_PROMPT_TRADE_MISTAKES = 6;
const MAX_PROMPT_STRATEGIES = 6;
const MAX_PROMPT_SESSIONS = 6;
const MAX_PROMPT_SYMBOLS = 8;
const MAX_PROMPT_RECENT_TRADES = 16;
const MAX_NOTE_CONTENT_LENGTH = 220;
const MAX_MISTAKE_NOTES_LENGTH = 160;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_MESSAGE_LENGTH = 500;
const MAX_HISTORY_TOTAL_CHARS = 4000;

const FORBIDDEN_PATTERNS = [
  "achete",
  "achète",
  "vends",
  "vendre maintenant",
  "buy now",
  "sell now",
  "signal live",
  "execute trade",
  "ordre market",
];

function buildMemoryPromptSection(
  memory: AIMemoryState | null | undefined,
  scope?: AIMemoryScope | null,
): string[] {
  if (!memory) return [];

  const facts = memory.facts
    .slice(0, 12)
    .map((fact) => `- ${fact.content}`);
  const summaries = memory.summaries
    .slice(0, 6)
    .map((summary) => `- ${summary.content}`);

  if (facts.length === 0 && summaries.length === 0) {
    return [];
  }

  return [
    scope ? `Contexte mémoire actif: ${scope.label}` : "Contexte mémoire actif: global",
    "Mémoire locale utilisateur:",
    facts.length > 0 ? facts.join("\n") : "- aucune préférence durable mémorisée",
    "Résumés persistants récents:",
    summaries.length > 0 ? summaries.join("\n") : "- aucun résumé persistant",
    "Utilise cette mémoire comme contexte secondaire local, sans inventer ni surinterpréter.",
  ];
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildPromptScopedExport(exportData: AIAnalyticsExport): Record<string, unknown> {
  return {
    generatedAt: exportData.generatedAt,
    context: exportData.context,
    timeContext: exportData.timeContext,
    analytics: exportData.analytics,
    pnl: exportData.pnl,
    drawdown: exportData.drawdown,
    riskManagement: exportData.riskManagement,
    habits: exportData.habits.slice(0, MAX_PROMPT_HABITS),
    emotions: exportData.emotions.slice(0, MAX_PROMPT_EMOTIONS),
    errors: exportData.errors.slice(0, MAX_PROMPT_ERRORS),
    tradeNotes: exportData.tradeNotes.slice(0, MAX_PROMPT_TRADE_NOTES).map((note) => ({
      tradeId: note.tradeId,
      tradeSymbol: note.tradeSymbol,
      content: truncateText(note.content, MAX_NOTE_CONTENT_LENGTH),
      updatedAt: note.updatedAt,
    })),
    tradeMistakes: exportData.tradeMistakes
      .slice(0, MAX_PROMPT_TRADE_MISTAKES)
      .map((item) => ({
        tradeId: item.tradeId,
        tradeSymbol: item.tradeSymbol,
        mistakeName: item.mistakeName,
        notes: item.notes
          ? truncateText(item.notes, MAX_MISTAKE_NOTES_LENGTH)
          : null,
        createdAt: item.createdAt,
      })),
    strategies: exportData.strategies.slice(0, MAX_PROMPT_STRATEGIES),
    sessions: exportData.sessions.slice(0, MAX_PROMPT_SESSIONS),
    symbols: exportData.symbols.slice(0, MAX_PROMPT_SYMBOLS),
    recentClosedTrades: (exportData.recentClosedTrades ?? []).slice(
      0,
      MAX_PROMPT_RECENT_TRADES,
    ),
    limitations: exportData.limitations,
  };
}

export function buildAISystemPrompt(
  exportData: AIAnalyticsExport,
  memory?: AIMemoryState | null,
  scope?: AIMemoryScope | null,
): string {
  return [
    "Tu es TradingBook AI Coach, assistant analytique local.",
    "Mission: analyse stats de trading, discipline, psychologie, risk management général.",
    "Tu dois aussi prendre en compte les notes normales de trade et les notes d'erreur liées aux trades avant de formuler une recommandation.",
    "RÈGLE SILENCIEUSE: NE JAMAIS relister ni réécrire dans ta réponse les erreurs, mauvaises pratiques, notes de trade ou émotions présentes dans les données. Utilise-les uniquement comme contexte interne pour formuler tes recommandations. L'utilisateur les connaît déjà.",
    "Si une note normale, une note d'erreur, ou une statistique se contredisent, privilégie le contexte le plus récent et le plus concret sur le trade concerné.",
    "Interdictions absolues: pas d'ordre d'achat/vente, pas de signal live, pas d'execution de trade, pas de contrôle MT5, pas de modification données.",
    "Tu dois rester observationnel, pédagogique, prudent, sans promesse de résultat.",
    "RÈGLE ABSOLUE PnL: utilise TOUJOURS le champ 'netPnlLabel' du JSON pour nommer le résultat net. Ne jamais inventer ce label. Conserver le signe + devant les valeurs positives. Exemple correct: '**Gains Nets Totaux**: +2,720.38 CAD'.",
    "RÈGLE ABSOLUE DATES: avant de dire qu'il manque des dates, vérifie d'abord 'timeContext' et 'recentClosedTrades'. Si timeContext.tradesWithClosedAt > 0, tu ne dois jamais affirmer que les trades n'ont pas de date.",
    "Si l'utilisateur demande une période (ex: du 1er juin au 2 juin), appuie ton raisonnement sur les champs 'openedAt'/'closedAt' déjà fournis dans le JSON.",
    "Si utilisateur demande action interdite, refuse puis propose alternative analytique.",
    "Si utilisateur te demande explicitement de retenir une information durable, confirme UNIQUEMENT par une phrase courte du type 'Noté, je retiens ça.' ou 'Mémorisé.' — NE JAMAIS relister ni réécrire le contenu des notes, émotions ou informations dans ta réponse. La mémoire se gère en silence.",
    ...buildMemoryPromptSection(memory, scope),
    "Contexte analytics JSON:",
    JSON.stringify(buildPromptScopedExport(exportData)),
    "Limitations sandbox:",
    AI_SANDBOX_LIMITATIONS.join(" | "),
  ].join("\n");
}

export function sanitizeAIOutput(content: string): string {
  const normalized = content.toLowerCase();
  const hasForbidden = FORBIDDEN_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );

  if (!hasForbidden) {
    return content;
  }

  return [
    "Je ne peux pas fournir de signal d'achat/vente ni d'instruction d'exécution.",
    "Je peux analyser vos statistiques, expliquer le drawdown et proposer un plan de discipline/risk management général.",
  ].join(" ");
}

export function buildConversationForModel(
  systemPrompt: string,
  history: AIChatMessage[],
  userPrompt: string,
): AIModelMessage[] {
  const recentHistorySource = history.slice(-MAX_HISTORY_MESSAGES);
  const recentHistory: AIModelMessage[] = [];
  let historyChars = 0;

  for (let index = recentHistorySource.length - 1; index >= 0; index -= 1) {
    const message = recentHistorySource[index];
    const trimmedContent = truncateText(
      message.content,
      MAX_HISTORY_MESSAGE_LENGTH,
    );
    const nextSize = historyChars + trimmedContent.length;
    if (recentHistory.length > 0 && nextSize > MAX_HISTORY_TOTAL_CHARS) {
      continue;
    }

    recentHistory.unshift({
      role: message.role,
      content: trimmedContent,
    });
    historyChars = nextSize;
  }

  return [
    { role: "system", content: systemPrompt },
    ...recentHistory,
    { role: "user", content: userPrompt },
  ];
}
