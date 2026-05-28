import type { AIAnalyticsExport, AIInsightCard } from "../../types/ai";

function toPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function buildAIInsights(exportData: AIAnalyticsExport): AIInsightCard[] {
  const cards: AIInsightCard[] = [];

  cards.push({
    id: "summary",
    title: "Résumé performance",
    summary:
      exportData.analytics.totalNetPnl >= 0
        ? "Performance globale positive sur période analysée."
        : "Performance globale négative: focus discipline et contrôle du risque.",
    severity: exportData.analytics.totalNetPnl >= 0 ? "positive" : "warning",
    evidence: [
      `Win rate: ${toPct(exportData.analytics.winRate)}`,
      `Drawdown max: ${toPct(exportData.drawdown.maxDrawdownPct)}`,
      `Trades: ${exportData.analytics.totalTrades}`,
    ],
  });

  if (exportData.riskManagement.pctWithSL < 70) {
    cards.push({
      id: "risk-sl",
      title: "Risque: couverture Stop Loss",
      summary:
        "Trop de trades sans SL. Risque de dérive drawdown en phase volatile.",
      severity: "warning",
      evidence: [`Trades avec SL: ${toPct(exportData.riskManagement.pctWithSL)}`],
    });
  }

  if (exportData.habits.length > 0) {
    cards.push({
      id: "habits",
      title: "Habitudes récurrentes",
      summary: exportData.habits[0],
      severity: "neutral",
      evidence: [`Observations détectées: ${exportData.habits.length}`],
    });
  }

  if (exportData.sessions.length > 0) {
    const worstSession = [...exportData.sessions].sort(
      (a, b) => a.netPnl - b.netPnl,
    )[0];

    cards.push({
      id: "session",
      title: "Session à surveiller",
      summary: `${worstSession.sessionName} montre plus faible robustesse actuellement.`,
      severity: "warning",
      evidence: [
        `PnL: ${worstSession.netPnl.toFixed(2)} ${exportData.analytics.currency}`,
        `Win rate: ${toPct(worstSession.winRate)}`,
      ],
    });
  }

  return cards.slice(0, 4);
}
