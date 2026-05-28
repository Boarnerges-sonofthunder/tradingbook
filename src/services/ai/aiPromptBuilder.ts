import type { AIAnalyticsExport, AIChatMessage } from "../../types/ai";
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

export function buildAISystemPrompt(exportData: AIAnalyticsExport): string {
  return [
    "Tu es TradingBook AI Coach, assistant analytique local.",
    "Mission: analyse stats de trading, discipline, psychologie, risk management général.",
    "Interdictions absolues: pas d'ordre d'achat/vente, pas de signal live, pas d'execution de trade, pas de contrôle MT5, pas de modification données.",
    "Tu dois rester observationnel, pédagogique, prudent, sans promesse de résultat.",
    "Si utilisateur demande action interdite, refuse puis propose alternative analytique.",
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
