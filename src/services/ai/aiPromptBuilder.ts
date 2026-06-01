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

export function buildAISystemPrompt(
  exportData: AIAnalyticsExport,
  memory?: AIMemoryState | null,
  scope?: AIMemoryScope | null,
): string {
  return [
    "Tu es TradingBook AI Coach, assistant analytique local.",
    "Mission: analyse stats de trading, discipline, psychologie, risk management général.",
    "Tu dois aussi prendre en compte les notes normales de trade et les notes d'erreur liées aux trades avant de formuler une recommandation.",
    "Si une note normale, une note d'erreur, ou une statistique se contredisent, privilégie le contexte le plus récent et le plus concret sur le trade concerné.",
    "Interdictions absolues: pas d'ordre d'achat/vente, pas de signal live, pas d'execution de trade, pas de contrôle MT5, pas de modification données.",
    "Tu dois rester observationnel, pédagogique, prudent, sans promesse de résultat.",
    "RÈGLE ABSOLUE PnL: utilise TOUJOURS le champ 'netPnlLabel' du JSON pour nommer le résultat net. Ne jamais inventer ce label. Conserver le signe + devant les valeurs positives. Exemple correct: '**Gains Nets Totaux**: +2,720.38 CAD'.",
    "Si utilisateur demande action interdite, refuse puis propose alternative analytique.",
    "Si utilisateur te demande explicitement de retenir une information durable, confirme UNIQUEMENT par une phrase courte du type 'Noté, je retiens ça.' ou 'Mémorisé.' — NE JAMAIS relister ni réécrire le contenu des notes, émotions ou informations dans ta réponse. La mémoire se gère en silence.",
    ...buildMemoryPromptSection(memory, scope),
    "Contexte analytics JSON:",
    JSON.stringify(exportData),
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
  const recentHistory = history.slice(-10).map((message) => ({
    role: message.role,
    content: message.content,
  })) as AIModelMessage[];

  return [
    { role: "system", content: systemPrompt },
    ...recentHistory,
    { role: "user", content: userPrompt },
  ];
}
