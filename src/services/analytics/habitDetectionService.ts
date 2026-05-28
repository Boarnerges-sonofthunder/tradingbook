// ============================================================
// Service — Détection des habitudes de trading
// ============================================================
// Phase 15 : génère des observations factuelles à partir des
// trades fermés uniquement (pas de signaux, pas de conseil).
//
// Données utilisées : symboles, sessions UTC, stratégies,
// émotions, erreurs, SL/TP, RR, PnL et date/heure.
// ============================================================

import {
  findTradesForAnalytics,
  findStrategies,
  findEmotions,
  findMistakes,
  findAllTradeEmotionMappings,
  findAllTradeMistakeMappings,
  type TradeFilters,
} from "../../repositories";
import type {
  Trade,
  HabitDetectionResult,
  HabitObservation,
  HabitObservationCategory,
  HabitImportance,
  HabitObservationEvidence,
} from "../../types";
import { createLogger } from "../logging";

const logger = createLogger("analytics.habits");

const MIN_GROUP_SIZE = 5;

interface GroupStat {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  netPnl: number;
}

function netPnlOf(trade: Trade): number {
  return trade.netPnl ?? (trade.grossPnl ?? 0) - trade.commission - trade.swap - trade.fees;
}

function detectSessionLabel(openedAtIso: string): string {
  const date = new Date(openedAtIso);
  const hour = date.getUTCHours();

  if (hour >= 12 && hour < 16) return "Overlap London/NY";
  if (hour >= 7 && hour < 16) return "London";
  if (hour >= 12 && hour < 21) return "New York";
  if (hour >= 0 && hour < 9) return "Asia";
  return "Hors session";
}

function winRate(wins: number, total: number): number {
  if (total <= 0) return 0;
  return (wins / total) * 100;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function round1(value: number): string {
  return `${value.toFixed(1)}%`;
}

function toMoney(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function toImportance(score: number): HabitImportance {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function buildObservation(params: {
  id: string;
  title: string;
  summary: string;
  category: HabitObservationCategory;
  score: number;
  sampleSize: number;
  evidence: HabitObservationEvidence[];
}): HabitObservation {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(params.score)));
  return {
    id: params.id,
    title: params.title,
    summary: params.summary,
    category: params.category,
    importance: toImportance(normalizedScore),
    importanceScore: normalizedScore,
    sampleSize: params.sampleSize,
    evidence: params.evidence,
  };
}

function buildGroupStatMap(labels: string[]): Map<string, GroupStat> {
  const map = new Map<string, GroupStat>();
  for (const label of labels) {
    map.set(label, { label, trades: 0, wins: 0, losses: 0, netPnl: 0 });
  }
  return map;
}

export async function getHabitDetectionStats(
  filters?: TradeFilters,
): Promise<HabitDetectionResult> {
  logger.debug("Détection des habitudes de trading", { filters });

  const [trades, strategies, emotions, mistakes, emotionMappings, mistakeMappings] =
    await Promise.all([
      findTradesForAnalytics({ ...filters, status: "closed" }),
      findStrategies(),
      findEmotions(),
      findMistakes(),
      findAllTradeEmotionMappings(),
      findAllTradeMistakeMappings(),
    ]);

  if (trades.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      totalClosedTrades: 0,
      observations: [],
      limitations: [
        "Aucune observation disponible sans trade fermé.",
      ],
      isEmpty: true,
    };
  }

  const observations: HabitObservation[] = [];

  const strategyNameById = new Map<number, string>(
    strategies.map((s) => [s.id, s.name]),
  );
  const emotionNameById = new Map<number, string>(
    emotions.map((e) => [e.id, e.name]),
  );
  const mistakeNameById = new Map<number, string>(
    mistakes.map((m) => [m.id, m.name]),
  );

  const emotionIdsByTrade = new Map<number, Set<number>>();
  for (const mapping of emotionMappings) {
    const set = emotionIdsByTrade.get(mapping.tradeId) ?? new Set<number>();
    set.add(mapping.emotionId);
    emotionIdsByTrade.set(mapping.tradeId, set);
  }

  const mistakeIdsByTrade = new Map<number, Set<number>>();
  for (const mapping of mistakeMappings) {
    const set = mistakeIdsByTrade.get(mapping.tradeId) ?? new Set<number>();
    set.add(mapping.mistakeId);
    mistakeIdsByTrade.set(mapping.tradeId, set);
  }

  // Observation 1 — concentration par symbole
  {
    const symbolCount = new Map<string, number>();
    for (const trade of trades) {
      symbolCount.set(trade.symbol, (symbolCount.get(trade.symbol) ?? 0) + 1);
    }
    const top = [...symbolCount.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const share = pct(top[1], trades.length);
      const score = Math.min(95, share * 1.6);
      observations.push(
        buildObservation({
          id: "symbol-concentration",
          title: "Concentration sur un symbole",
          summary: `${top[0]} représente ${round1(share)} des trades fermés analysés.`,
          category: "instrument",
          score,
          sampleSize: trades.length,
          evidence: [
            { label: "Symbole dominant", value: top[0] },
            { label: "Part des trades", value: round1(share) },
            { label: "Trades sur ce symbole", value: String(top[1]) },
          ],
        }),
      );
    }
  }

  // Observation 2 — sessions (heure UTC)
  {
    const sessionStats = buildGroupStatMap([
      "Asia",
      "London",
      "Overlap London/NY",
      "New York",
      "Hors session",
    ]);

    for (const trade of trades) {
      const label = detectSessionLabel(trade.openedAt);
      const stat = sessionStats.get(label);
      if (!stat) continue;
      const pnl = netPnlOf(trade);
      stat.trades += 1;
      stat.netPnl += pnl;
      if (pnl > 0) stat.wins += 1;
      if (pnl < 0) stat.losses += 1;
    }

    const populated = [...sessionStats.values()].filter((s) => s.trades >= MIN_GROUP_SIZE);
    if (populated.length >= 2) {
      const best = [...populated].sort((a, b) => b.netPnl - a.netPnl)[0];
      const worst = [...populated].sort((a, b) => a.netPnl - b.netPnl)[0];
      const pnlGap = Math.abs(best.netPnl - worst.netPnl);
      const wrGap = Math.abs(winRate(best.wins, best.trades) - winRate(worst.wins, worst.trades));
      const score = Math.min(95, 30 + pnlGap / Math.max(1, trades.length) + wrGap * 1.2);
      observations.push(
        buildObservation({
          id: "session-gap",
          title: "Écart de résultats selon la session UTC",
          summary: `${best.label} et ${worst.label} montrent des profils de résultats différents sur l'échantillon actuel.`,
          category: "session",
          score,
          sampleSize: best.trades + worst.trades,
          evidence: [
            { label: "Meilleure session (PnL)", value: `${best.label} (${toMoney(best.netPnl)})` },
            { label: "Session la plus faible (PnL)", value: `${worst.label} (${toMoney(worst.netPnl)})` },
            { label: "Écart de win rate", value: round1(wrGap) },
          ],
        }),
      );
    }
  }

  // Observation 3 — stratégies
  {
    const strategyStats = new Map<string, GroupStat>();
    for (const trade of trades) {
      const name = trade.strategyId !== null
        ? strategyNameById.get(trade.strategyId) ?? `Stratégie #${trade.strategyId}`
        : "Sans stratégie";
      const stat = strategyStats.get(name) ?? {
        label: name,
        trades: 0,
        wins: 0,
        losses: 0,
        netPnl: 0,
      };
      const pnl = netPnlOf(trade);
      stat.trades += 1;
      stat.netPnl += pnl;
      if (pnl > 0) stat.wins += 1;
      if (pnl < 0) stat.losses += 1;
      strategyStats.set(name, stat);
    }

    const topStrategy = [...strategyStats.values()].sort((a, b) => b.trades - a.trades)[0];
    if (topStrategy && topStrategy.trades >= MIN_GROUP_SIZE) {
      const share = pct(topStrategy.trades, trades.length);
      const baseScore = share * 1.4;
      const pnlPenalty = topStrategy.netPnl < 0 ? 25 : 0;
      observations.push(
        buildObservation({
          id: "strategy-dominance",
          title: "Poids d'une stratégie dominante",
          summary: `${topStrategy.label} concentre ${round1(share)} des trades fermés sur la période analysée.`,
          category: "strategy",
          score: Math.min(95, baseScore + pnlPenalty),
          sampleSize: topStrategy.trades,
          evidence: [
            { label: "Stratégie la plus utilisée", value: topStrategy.label },
            { label: "Part des trades", value: round1(share) },
            { label: "PnL cumulé", value: toMoney(topStrategy.netPnl) },
          ],
        }),
      );
    }
  }

  // Observation 4 — émotions associées aux trades fermés
  {
    const emotionStats = new Map<string, GroupStat>();

    for (const trade of trades) {
      const emotionIds = emotionIdsByTrade.get(trade.id);
      if (!emotionIds || emotionIds.size === 0) continue;

      for (const emotionId of emotionIds) {
        const name = emotionNameById.get(emotionId) ?? `Émotion #${emotionId}`;
        const stat = emotionStats.get(name) ?? {
          label: name,
          trades: 0,
          wins: 0,
          losses: 0,
          netPnl: 0,
        };
        const pnl = netPnlOf(trade);
        stat.trades += 1;
        stat.netPnl += pnl;
        if (pnl > 0) stat.wins += 1;
        if (pnl < 0) stat.losses += 1;
        emotionStats.set(name, stat);
      }
    }

    const ranked = [...emotionStats.values()]
      .filter((s) => s.trades >= MIN_GROUP_SIZE)
      .sort((a, b) => a.netPnl - b.netPnl);

    if (ranked.length > 0) {
      const worst = ranked[0];
      const wr = winRate(worst.wins, worst.trades);
      observations.push(
        buildObservation({
          id: "emotion-impact",
          title: "Émotion fréquemment associée aux résultats faibles",
          summary: `${worst.label} apparaît sur ${worst.trades} trades avec un PnL cumulé de ${toMoney(worst.netPnl)}.`,
          category: "emotion",
          score: Math.min(95, 35 + Math.abs(Math.min(0, worst.netPnl)) / Math.max(1, worst.trades) + (100 - wr) * 0.4),
          sampleSize: worst.trades,
          evidence: [
            { label: "Émotion", value: worst.label },
            { label: "Trades associés", value: String(worst.trades) },
            { label: "Win rate associé", value: round1(wr) },
          ],
        }),
      );
    }
  }

  // Observation 5 — erreurs cataloguées
  {
    const mistakeStats = new Map<string, GroupStat>();

    for (const trade of trades) {
      const mistakeIds = mistakeIdsByTrade.get(trade.id);
      if (!mistakeIds || mistakeIds.size === 0) continue;

      for (const mistakeId of mistakeIds) {
        const name = mistakeNameById.get(mistakeId) ?? `Erreur #${mistakeId}`;
        const stat = mistakeStats.get(name) ?? {
          label: name,
          trades: 0,
          wins: 0,
          losses: 0,
          netPnl: 0,
        };
        const pnl = netPnlOf(trade);
        stat.trades += 1;
        stat.netPnl += pnl;
        if (pnl > 0) stat.wins += 1;
        if (pnl < 0) stat.losses += 1;
        mistakeStats.set(name, stat);
      }
    }

    const topMistake = [...mistakeStats.values()].sort((a, b) => b.trades - a.trades)[0];
    if (topMistake && topMistake.trades >= MIN_GROUP_SIZE) {
      const lossRate = winRate(topMistake.losses, topMistake.trades);
      observations.push(
        buildObservation({
          id: "mistake-frequency",
          title: "Erreur récurrente observée",
          summary: `${topMistake.label} est l'erreur la plus annotée (${topMistake.trades} occurrences).`,
          category: "mistake",
          score: Math.min(95, 30 + pct(topMistake.trades, trades.length) + lossRate * 0.6),
          sampleSize: topMistake.trades,
          evidence: [
            { label: "Erreur la plus fréquente", value: topMistake.label },
            { label: "Occurrences", value: String(topMistake.trades) },
            { label: "Taux de trades perdants", value: round1(lossRate) },
          ],
        }),
      );
    }
  }

  // Observation 6 — discipline SL/TP
  {
    let withoutStopLoss = 0;
    let withoutTakeProfit = 0;
    for (const trade of trades) {
      if (trade.stopLoss === null) withoutStopLoss += 1;
      if (trade.takeProfit === null) withoutTakeProfit += 1;
    }

    const slPct = pct(withoutStopLoss, trades.length);
    const tpPct = pct(withoutTakeProfit, trades.length);
    observations.push(
      buildObservation({
        id: "risk-plan-coverage",
        title: "Couverture du plan de risque (SL/TP)",
        summary: `${round1(slPct)} des trades fermés n'avaient pas de SL, ${round1(tpPct)} n'avaient pas de TP.`,
        category: "risk_plan",
        score: Math.min(95, 20 + slPct * 0.9 + tpPct * 0.7),
        sampleSize: trades.length,
        evidence: [
          { label: "Sans Stop Loss", value: `${withoutStopLoss} (${round1(slPct)})` },
          { label: "Sans Take Profit", value: `${withoutTakeProfit} (${round1(tpPct)})` },
        ],
      }),
    );
  }

  // Observation 7 — profil R/R sur trades exploitables
  {
    let rrCount = 0;
    let rrSum = 0;

    for (const trade of trades) {
      let rr = trade.riskRewardRatio;
      if (rr === null && trade.stopLoss !== null && trade.takeProfit !== null) {
        const risk = Math.abs(trade.entryPrice - trade.stopLoss);
        const reward = Math.abs(trade.takeProfit - trade.entryPrice);
        if (risk > 0 && reward > 0) rr = reward / risk;
      }
      if (rr !== null && rr > 0 && isFinite(rr)) {
        rrCount += 1;
        rrSum += rr;
      }
    }

    if (rrCount > 0) {
      const avgRr = rrSum / rrCount;
      observations.push(
        buildObservation({
          id: "rr-profile",
          title: "Profil Risk/Reward observé",
          summary: `Le R/R moyen calculable est de ${avgRr.toFixed(2)} sur ${rrCount} trades fermés.`,
          category: "risk_reward",
          score: Math.min(90, 20 + pct(rrCount, trades.length) * 0.8 + Math.abs(1 - avgRr) * 22),
          sampleSize: rrCount,
          evidence: [
            { label: "R/R moyen", value: avgRr.toFixed(2) },
            { label: "Trades avec R/R calculable", value: `${rrCount} (${round1(pct(rrCount, trades.length))})` },
          ],
        }),
      );
    }
  }

  // Observation 8 — tendance horaire UTC
  {
    const byHour = new Map<number, GroupStat>();
    for (let h = 0; h < 24; h += 1) {
      byHour.set(h, { label: `${h.toString().padStart(2, "0")}:00 UTC`, trades: 0, wins: 0, losses: 0, netPnl: 0 });
    }

    for (const trade of trades) {
      const hour = new Date(trade.openedAt).getUTCHours();
      const stat = byHour.get(hour);
      if (!stat) continue;
      const pnl = netPnlOf(trade);
      stat.trades += 1;
      stat.netPnl += pnl;
      if (pnl > 0) stat.wins += 1;
      if (pnl < 0) stat.losses += 1;
    }

    const candidates = [...byHour.entries()]
      .map(([, value]) => value)
      .filter((value) => value.trades >= 4)
      .sort((a, b) => a.netPnl - b.netPnl);

    if (candidates.length > 0) {
      const weakestHour = candidates[0];
      observations.push(
        buildObservation({
          id: "hourly-pattern",
          title: "Plage horaire UTC à résultats faibles",
          summary: `${weakestHour.label} présente le PnL cumulé le plus faible parmi les heures suffisamment actives.`,
          category: "timing",
          score: Math.min(90, 25 + Math.abs(Math.min(0, weakestHour.netPnl)) / Math.max(1, weakestHour.trades)),
          sampleSize: weakestHour.trades,
          evidence: [
            { label: "Heure UTC", value: weakestHour.label },
            { label: "PnL cumulé", value: toMoney(weakestHour.netPnl) },
            { label: "Win rate", value: round1(winRate(weakestHour.wins, weakestHour.trades)) },
          ],
        }),
      );
    }
  }

  // Observation 9 — complétude des métadonnées (stratégie, émotion, erreur)
  {
    let withoutStrategy = 0;
    let withoutEmotion = 0;
    let withoutMistake = 0;

    for (const trade of trades) {
      if (trade.strategyId === null) withoutStrategy += 1;
      if (!emotionIdsByTrade.get(trade.id) || emotionIdsByTrade.get(trade.id)!.size === 0) {
        withoutEmotion += 1;
      }
      if (!mistakeIdsByTrade.get(trade.id) || mistakeIdsByTrade.get(trade.id)!.size === 0) {
        withoutMistake += 1;
      }
    }

    observations.push(
      buildObservation({
        id: "metadata-completeness",
        title: "Complétude des annotations de journal",
        summary: `Le journal contient des zones non annotées sur stratégie, émotions ou erreurs pour une partie des trades fermés.`,
        category: "data_quality",
        score: Math.min(85, 15 + pct(withoutStrategy + withoutEmotion + withoutMistake, trades.length * 3) * 0.9),
        sampleSize: trades.length,
        evidence: [
          { label: "Sans stratégie", value: `${withoutStrategy} (${round1(pct(withoutStrategy, trades.length))})` },
          { label: "Sans émotion", value: `${withoutEmotion} (${round1(pct(withoutEmotion, trades.length))})` },
          { label: "Sans erreur annotée", value: `${withoutMistake} (${round1(pct(withoutMistake, trades.length))})` },
        ],
      }),
    );
  }

  observations.sort((a, b) => {
    if (a.importanceScore !== b.importanceScore) {
      return b.importanceScore - a.importanceScore;
    }
    if (a.sampleSize !== b.sampleSize) {
      return b.sampleSize - a.sampleSize;
    }
    return a.title.localeCompare(b.title, "fr");
  });

  const limitations = [
    "Observations descriptives uniquement : elles ne constituent pas un conseil financier.",
    "Les résultats dépendent de la qualité des annotations (stratégies, émotions, erreurs).",
    "Les comparaisons par groupe utilisent des seuils minimaux d'échantillon pour limiter le bruit.",
    "Les sessions et heures sont évaluées en UTC à partir de openedAt.",
    "Les observations ne génèrent aucun signal d'entrée/sortie buy/sell.",
  ];

  logger.info("Habitudes détectées", {
    totalClosedTrades: trades.length,
    observations: observations.length,
  });

  return {
    generatedAt: new Date().toISOString(),
    totalClosedTrades: trades.length,
    observations,
    limitations,
    isEmpty: false,
  };
}
