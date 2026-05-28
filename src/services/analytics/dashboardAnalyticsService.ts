// ============================================================
// Service — Analytics Dashboard
// ============================================================
// Calcule les statistiques principales du dashboard à partir
// des trades fermés stockés dans SQLite.
//
// Architecture :
//   DashboardPage (React)
//     └── getDashboardStats()  ← ici
//           └── findTrades({ status: "closed" })  ← tradesRepository
//                 └── SQLite (table `trades`)
//
// Règle : aucun appel SQLite direct dans ce fichier.
//         Tout passe par les repositories.
// ============================================================

import { findTradesForAnalytics, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type { DashboardStats, DashboardStatsResult } from "../../types/analytics";

const logger = createLogger("analytics.dashboard");

// ============================================================
// Helpers de calcul — fonctions pures, sans effet de bord
// ============================================================

/**
 * Détermine la devise majoritaire parmi un tableau de trades.
 * Retourne "USD" par défaut si la liste est vide.
 */
function dominantCurrency(trades: Trade[]): string {
  const freq: Record<string, number> = {};
  for (const t of trades) {
    freq[t.currency] = (freq[t.currency] ?? 0) + 1;
  }
  let best = "USD";
  let max = 0;
  for (const [currency, count] of Object.entries(freq)) {
    if (count > max) { max = count; best = currency; }
  }
  return best;
}

/**
 * Calcule le drawdown maximum absolu (en devise) à partir d'une série
 * de P&L nets triée par ordre chronologique de clôture.
 *
 * Algorithme :
 *   - On accumule les P&L dans `cumulative`.
 *   - On maintient `peak` = valeur cumulée maximale atteinte jusqu'ici.
 *   - drawdown instantané = peak − cumulative (toujours ≥ 0).
 *   - maxDrawdown = max des drawdowns instantanés observés.
 *
 * Retourne 0 si la courbe ne descend jamais sous son pic.
 */
function computeMaxDrawdown(chronologicalPnls: number[]): number {
  let peak = 0;
  let cumulative = 0;
  let maxDD = 0;

  for (const pnl of chronologicalPnls) {
    cumulative += pnl;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDD) maxDD = dd;
  }

  return maxDD;
}

/**
 * Calcule toutes les statistiques du dashboard à partir d'un tableau
 * de trades fermés. Fonction pure — sans accès SQLite.
 */
function computeStats(trades: Trade[]): DashboardStats {
  const currency = dominantCurrency(trades);

  // ── Séparation gagnants / perdants ───────────────────────
  const winning = trades.filter((t) => (t.netPnl ?? 0) > 0);
  const losing  = trades.filter((t) => (t.netPnl ?? 0) < 0);
  const be      = trades.filter((t) => (t.netPnl ?? 0) === 0);

  // ── P&L ──────────────────────────────────────────────────
  const totalNetPnl = trades.reduce((acc, t) => acc + (t.netPnl ?? 0), 0);
  const sumWins     = winning.reduce((acc, t) => acc + (t.netPnl ?? 0), 0);
  const sumLosses   = losing.reduce((acc, t)  => acc + (t.netPnl ?? 0), 0); // négatif

  // ── Moyennes ─────────────────────────────────────────────
  const averageWin  = winning.length > 0 ? sumWins / winning.length : 0;
  const averageLoss = losing.length  > 0 ? sumLosses / losing.length : 0;

  // ── Win rate ──────────────────────────────────────────────
  const winRate = trades.length > 0 ? (winning.length / trades.length) * 100 : 0;

  // ── Profit factor ─────────────────────────────────────────
  // Infinity si aucune perte, 0 si aucun gain.
  let profitFactor: number;
  if (sumLosses === 0) {
    profitFactor = sumWins > 0 ? Infinity : 0;
  } else {
    profitFactor = sumWins / Math.abs(sumLosses);
  }

  // ── Drawdown maximum ─────────────────────────────────────
  // Tri chronologique par closedAt, puis createdAt en tiebreaker.
  const sorted = [...trades].sort((a, b) => {
    const dateA = a.closedAt ?? a.createdAt;
    const dateB = b.closedAt ?? b.createdAt;
    return dateA.localeCompare(dateB);
  });
  const maxDrawdown = computeMaxDrawdown(sorted.map((t) => t.netPnl ?? 0));

  // ── Extrêmes ─────────────────────────────────────────────
  const pnls = trades.map((t) => t.netPnl ?? 0);
  const bestTrade  = Math.max(...pnls);
  const worstTrade = Math.min(...pnls);

  return {
    totalNetPnl,
    currency,
    totalTrades: trades.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    breakevenTrades: be.length,
    winRate,
    averageWin,
    averageLoss,
    profitFactor,
    maxDrawdown,
    bestTrade,
    worstTrade,
  };
}

// ============================================================
// API publique
// ============================================================

/**
 * Récupère et calcule les statistiques du dashboard.
 *
 * Filtre les trades par `status = "closed"` (les trades ouverts
 * ou annulés ne sont pas inclus dans les statistiques).
 * Des filtres supplémentaires optionnels peuvent être transmis
 * (dateFrom, dateTo, symbol, strategyId…).
 *
 * @param filters - Filtres additionnels (date, symbole, stratégie…)
 * @returns DashboardStatsResult avec `isEmpty: true` si aucun trade fermé.
 */
export async function getDashboardStats(
  filters: Omit<TradeFilters, "status"> = {}
): Promise<DashboardStatsResult> {
  logger.debug("Calcul des statistiques dashboard", filters);

  const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — dashboard vide");
    return { stats: null, isEmpty: true };
  }

  const stats = computeStats(trades);

  logger.debug("Statistiques calculées", {
    totalTrades: stats.totalTrades,
    totalNetPnl: stats.totalNetPnl,
    winRate: stats.winRate,
  });

  return { stats, isEmpty: false };
}
