// ============================================================
// Service — Analytics Risk/Reward
// ============================================================
// Phase 7 — Étape 4 : Analyse du ratio Risque/Rendement.
//
// Calcule la qualité de la gestion du risque à partir des trades
// fermés stockés dans SQLite.
//
// Ordre de priorité pour le R/R d'un trade :
//   1. Champ `riskRewardRatio` déjà stocké (non null, > 0, fini)
//   2. Calcul depuis entryPrice / stopLoss / takeProfit :
//        risk   = |entryPrice − stopLoss|
//        reward = |takeProfit − entryPrice|
//        R/R    = reward / risk
//
// Un trade est "exploitable" si son R/R peut être déterminé.
// Les trades sans SL ou sans TP ne contribuent qu'aux statistiques
// de couverture (pctWithSL, pctWithTP).
//
// Architecture :
//   AnalyticsPage (React)
//     └── getRiskRewardStats()           ← ici
//           ├── findTrades(closed)        ← tradesRepository
//           └── findStrategies()          ← strategiesRepository
//                 └── SQLite
//
// Règle : aucun appel SQLite direct dans ce fichier.
// ============================================================

import { findTradesForAnalytics, findStrategies, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  RiskRewardStats,
  RiskRewardBySymbol,
  RiskRewardByStrategy,
  RiskRewardResult,
} from "../../types/analytics";

const logger = createLogger("analytics.riskreward");

// ============================================================
// Helpers de calcul — fonctions pures, sans effet de bord
// ============================================================

/**
 * Extrait le ratio Risk/Reward d'un trade.
 *
 * Ordre de priorité :
 *   1. `riskRewardRatio` déjà stocké (si valide : > 0 et fini)
 *   2. Calcul depuis entryPrice / stopLoss / takeProfit
 *
 * Les valeurs négatives ou nulles (ex : SL au-dessus du TP sur un buy)
 * sont rejetées — elles signalent une saisie incohérente.
 *
 * @returns Le ratio (toujours > 0) ou null si incalculable.
 */
function extractRR(t: Trade): number | null {
  // 1. Valeur pré-calculée et stockée
  if (
    t.riskRewardRatio !== null &&
    t.riskRewardRatio > 0 &&
    isFinite(t.riskRewardRatio)
  ) {
    return t.riskRewardRatio;
  }

  // 2. Calcul depuis les prix : les trois champs doivent être présents
  if (t.stopLoss !== null && t.takeProfit !== null && t.entryPrice > 0) {
    const risk = Math.abs(t.entryPrice - t.stopLoss);
    const reward = Math.abs(t.takeProfit - t.entryPrice);
    // Les deux distances doivent être strictement positives
    if (risk > 0 && reward > 0) {
      return reward / risk;
    }
  }

  return null;
}

/**
 * Calcule les statistiques globales R/R depuis un tableau de trades fermés.
 */
function computeGlobalStats(trades: Trade[]): RiskRewardStats {
  let tradesWithSL = 0;
  let tradesWithTP = 0;
  let exploitableTrades = 0;
  let sumRR = 0;
  let bestRR: number | null = null;
  let worstRR: number | null = null;

  for (const t of trades) {
    if (t.stopLoss !== null) tradesWithSL++;
    if (t.takeProfit !== null) tradesWithTP++;

    const rr = extractRR(t);
    if (rr !== null) {
      exploitableTrades++;
      sumRR += rr;
      if (bestRR === null || rr > bestRR) bestRR = rr;
      if (worstRR === null || rr < worstRR) worstRR = rr;
    }
  }

  const total = trades.length;
  const pctWithSL = total > 0 ? (tradesWithSL / total) * 100 : 0;
  const pctWithTP = total > 0 ? (tradesWithTP / total) * 100 : 0;
  const avgRR = exploitableTrades > 0 ? sumRR / exploitableTrades : null;

  return {
    totalTrades: total,
    exploitableTrades,
    tradesWithSL,
    tradesWithTP,
    tradesWithoutSL: total - tradesWithSL,
    tradesWithoutTP: total - tradesWithTP,
    pctWithSL,
    pctWithTP,
    avgRR,
    bestRR,
    worstRR,
  };
}

/**
 * Calcule le R/R moyen par symbole.
 * Les résultats sont triés par R/R moyen décroissant (null à la fin).
 */
function computeBySymbol(trades: Trade[]): RiskRewardBySymbol[] {
  const map = new Map<
    string,
    { totalTrades: number; exploitableTrades: number; sumRR: number }
  >();

  for (const t of trades) {
    const entry = map.get(t.symbol) ?? {
      totalTrades: 0,
      exploitableTrades: 0,
      sumRR: 0,
    };
    entry.totalTrades++;
    const rr = extractRR(t);
    if (rr !== null) {
      entry.exploitableTrades++;
      entry.sumRR += rr;
    }
    map.set(t.symbol, entry);
  }

  return Array.from(map.entries())
    .map(([symbol, d]) => ({
      symbol,
      totalTrades: d.totalTrades,
      exploitableTrades: d.exploitableTrades,
      avgRR:
        d.exploitableTrades > 0 ? d.sumRR / d.exploitableTrades : null,
    }))
    .sort((a, b) => {
      // Trier par R/R moyen décroissant, les null à la fin
      if (a.avgRR === null && b.avgRR === null) return 0;
      if (a.avgRR === null) return 1;
      if (b.avgRR === null) return -1;
      return b.avgRR - a.avgRR;
    });
}

/**
 * Calcule le R/R moyen par stratégie.
 * Les stratégies non renseignées sont regroupées sous "Sans stratégie".
 * Les résultats sont triés par R/R moyen décroissant (null à la fin).
 *
 * @param trades      - Trades fermés
 * @param strategyMap - Map strategyId → nom de la stratégie
 */
function computeByStrategy(
  trades: Trade[],
  strategyMap: Map<number, string>,
): RiskRewardByStrategy[] {
  const map = new Map<
    number | null,
    { totalTrades: number; exploitableTrades: number; sumRR: number }
  >();

  for (const t of trades) {
    const key = t.strategyId;
    const entry = map.get(key) ?? {
      totalTrades: 0,
      exploitableTrades: 0,
      sumRR: 0,
    };
    entry.totalTrades++;
    const rr = extractRR(t);
    if (rr !== null) {
      entry.exploitableTrades++;
      entry.sumRR += rr;
    }
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([strategyId, d]) => ({
      strategyId,
      strategyName:
        strategyId !== null
          ? (strategyMap.get(strategyId) ?? `Stratégie #${strategyId}`)
          : "Sans stratégie",
      totalTrades: d.totalTrades,
      exploitableTrades: d.exploitableTrades,
      avgRR:
        d.exploitableTrades > 0 ? d.sumRR / d.exploitableTrades : null,
    }))
    .sort((a, b) => {
      if (a.avgRR === null && b.avgRR === null) return 0;
      if (a.avgRR === null) return 1;
      if (b.avgRR === null) return -1;
      return b.avgRR - a.avgRR;
    });
}

// ============================================================
// Fonction principale exportée
// ============================================================

/**
 * Calcule les statistiques Risk/Reward depuis les trades fermés.
 *
 * Seuls les trades avec `status = "closed"` sont inclus :
 *   - Les trades ouverts ont un résultat non réalisé → biais dans les stats.
 *   - Les trades annulés n'ont jamais atteint leur résultat.
 *
 * @param filters - Filtres optionnels (dateRange, symbol, strategyId…)
 * @returns Résultat complet avec stats globales + breakdown par symbole/stratégie.
 */
export async function getRiskRewardStats(
  filters?: TradeFilters,
): Promise<RiskRewardResult> {
  logger.debug("Calcul des statistiques Risk/Reward", { filters });

  const [trades, strategies] = await Promise.all([
    findTradesForAnalytics({ ...filters, status: "closed" }),
    findStrategies(),
  ]);

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — résultat vide");
    return { stats: null, bySymbol: [], byStrategy: [], isEmpty: true };
  }

  // Table de lookup strategyId → nom
  const strategyMap = new Map<number, string>(
    strategies.map((s) => [s.id, s.name]),
  );

  const stats = computeGlobalStats(trades);
  const bySymbol = computeBySymbol(trades);
  const byStrategy = computeByStrategy(trades, strategyMap);

  logger.debug("Statistiques R/R calculées", {
    total: stats.totalTrades,
    exploitable: stats.exploitableTrades,
    avgRR: stats.avgRR,
  });

  return { stats, bySymbol, byStrategy, isEmpty: false };
}
