// ============================================================
// Service — Analytics Win Rate
// ============================================================
// Phase 7 — Étape 3 : Analyse du win rate.
//
// Calcule le pourcentage de trades gagnants, perdants et breakeven
// à partir des trades fermés stockés dans SQLite.
//
// Règles de classification (invariables) :
//   gagnant   = net_pnl > 0
//   perdant   = net_pnl < 0
//   breakeven = net_pnl === 0
//
// Seuls les trades avec `status = "closed"` sont inclus :
//   - Les trades ouverts ont un résultat non réalisé → biais dans les stats.
//   - Les trades annulés n'ont jamais eu lieu.
//
// Architecture :
//   AnalyticsPage (React)
//     └── getWinRateStats()           ← ici
//           ├── findTrades(closed)    ← tradesRepository
//           └── findStrategies()      ← strategiesRepository
//                 └── SQLite
//
// Règle : aucun appel SQLite direct dans ce fichier.
// ============================================================

import { findTradesForAnalytics, findStrategies, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  WinRateStats,
  WinRateBySymbol,
  WinRateByStrategy,
  WinRatePeriodEntry,
  WinRateResult,
} from "../../types/analytics";

const logger = createLogger("analytics.winrate");

// ============================================================
// Types internes (non exportés)
// ============================================================

/** Accumulateur générique pour compter gagnants/perdants/breakeven. */
interface WinRateBucket {
  winning: number;
  losing: number;
  breakeven: number;
  total: number;
}

// ============================================================
// Helpers de calcul — fonctions pures, sans effet de bord
// ============================================================

/**
 * Crée un accumulateur vide.
 */
function emptyBucket(): WinRateBucket {
  return { winning: 0, losing: 0, breakeven: 0, total: 0 };
}

/**
 * Incrémente un accumulateur selon le net_pnl du trade.
 * Utilise `netPnl` stocké en priorité ; fallback sur gross_pnl - frais.
 */
function fillBucket(bucket: WinRateBucket, t: Trade): void {
  const netPnl =
    t.netPnl ?? (t.grossPnl ?? 0) - t.commission - t.swap - t.fees;
  bucket.total++;
  if (netPnl > 0) bucket.winning++;
  else if (netPnl < 0) bucket.losing++;
  else bucket.breakeven++;
}

/**
 * Calcule les trois taux depuis un accumulateur rempli.
 */
function ratesFromBucket(b: WinRateBucket) {
  const n = b.total;
  return {
    winRate: n > 0 ? (b.winning / n) * 100 : 0,
    lossRate: n > 0 ? (b.losing / n) * 100 : 0,
    breakevenRate: n > 0 ? (b.breakeven / n) * 100 : 0,
  };
}

/**
 * Calcule les statistiques globales de win rate.
 *
 * Formules :
 *   win_rate       = winningTrades / totalTrades × 100
 *   loss_rate      = losingTrades / totalTrades × 100
 *   breakeven_rate = breakevenTrades / totalTrades × 100
 */
function computeWinRateStats(trades: Trade[]): WinRateStats {
  const bucket = emptyBucket();
  for (const t of trades) fillBucket(bucket, t);

  return {
    totalTrades: bucket.total,
    winningTrades: bucket.winning,
    losingTrades: bucket.losing,
    breakevenTrades: bucket.breakeven,
    ...ratesFromBucket(bucket),
  };
}

/**
 * Calcule le win rate par symbole.
 * Résultat trié par nombre de trades décroissant (symboles les plus tradés en premier).
 */
function computeBySymbol(trades: Trade[]): WinRateBySymbol[] {
  const map = new Map<string, WinRateBucket>();

  for (const t of trades) {
    if (!map.has(t.symbol)) map.set(t.symbol, emptyBucket());
    fillBucket(map.get(t.symbol)!, t);
  }

  return Array.from(map.entries())
    .map(([symbol, b]) => ({
      symbol,
      totalTrades: b.total,
      winningTrades: b.winning,
      losingTrades: b.losing,
      breakevenTrades: b.breakeven,
      winRate: ratesFromBucket(b).winRate,
    }))
    .sort((a, b) => b.totalTrades - a.totalTrades);
}

/**
 * Calcule le win rate par stratégie.
 * Les trades sans stratégie sont regroupés sous "Sans stratégie".
 * Résultat trié par nombre de trades décroissant.
 */
function computeByStrategy(
  trades: Trade[],
  strategyMap: Map<number, string>,
): WinRateByStrategy[] {
  // Clé : strategyId en string ou "null" pour les trades sans stratégie
  const map = new Map<
    string,
    WinRateBucket & { strategyId: number | null; strategyName: string }
  >();

  for (const t of trades) {
    const key = t.strategyId !== null ? String(t.strategyId) : "null";
    if (!map.has(key)) {
      const strategyName =
        t.strategyId !== null
          ? (strategyMap.get(t.strategyId) ?? `Stratégie #${t.strategyId}`)
          : "Sans stratégie";
      map.set(key, {
        ...emptyBucket(),
        strategyId: t.strategyId,
        strategyName,
      });
    }
    fillBucket(map.get(key)!, t);
  }

  return Array.from(map.values())
    .map((entry) => ({
      strategyId: entry.strategyId,
      strategyName: entry.strategyName,
      totalTrades: entry.total,
      winningTrades: entry.winning,
      losingTrades: entry.losing,
      breakevenTrades: entry.breakeven,
      winRate: ratesFromBucket(entry).winRate,
    }))
    .sort((a, b) => b.totalTrades - a.totalTrades);
}

/**
 * Calcule le win rate par mois de clôture.
 * Résultat trié chronologiquement (le plus ancien en premier).
 */
function computeByMonth(trades: Trade[]): WinRatePeriodEntry[] {
  // Tri chronologique avant agrégation pour cohérence
  const sorted = [...trades].sort((a, b) => {
    const dateA = a.closedAt ?? a.createdAt;
    const dateB = b.closedAt ?? b.createdAt;
    return dateA.localeCompare(dateB);
  });

  const map = new Map<string, WinRateBucket>();

  for (const t of sorted) {
    // Clé mensuelle : "2024-01"
    const month = (t.closedAt ?? t.createdAt).substring(0, 7);
    if (!map.has(month)) map.set(month, emptyBucket());
    fillBucket(map.get(month)!, t);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, b]) => ({
      period,
      totalTrades: b.total,
      winningTrades: b.winning,
      losingTrades: b.losing,
      breakevenTrades: b.breakeven,
      winRate: ratesFromBucket(b).winRate,
    }));
}

// ============================================================
// API publique
// ============================================================

/**
 * Calcule les statistiques de win rate sur les trades fermés.
 *
 * Retourne les statistiques globales ainsi que les décompositions
 * par symbole, par stratégie et par mois.
 *
 * @param filters - Filtres additionnels (dateFrom, dateTo, symbol…). Le filtre
 *                  `status` est ignoré — il est forcé à "closed".
 * @returns WinRateResult avec `isEmpty: true` si aucun trade fermé ne correspond.
 */
export async function getWinRateStats(
  filters: Omit<TradeFilters, "status"> = {},
): Promise<WinRateResult> {
  logger.debug("Calcul des statistiques win rate", filters);

  // Chargement en parallèle : trades fermés + liste des stratégies (pour les noms)
  const [trades, strategies] = await Promise.all([
    findTradesForAnalytics({ ...filters, status: "closed" }),
    findStrategies(),
  ]);

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — win rate vide");
    return {
      stats: null,
      bySymbol: [],
      byStrategy: [],
      byMonth: [],
      isEmpty: true,
    };
  }

  // Table de correspondance strategyId → name pour éviter N requêtes SQL
  const strategyMap = new Map<number, string>(
    strategies.map((s) => [s.id, s.name]),
  );

  const stats = computeWinRateStats(trades);
  const bySymbol = computeBySymbol(trades);
  const byStrategy = computeByStrategy(trades, strategyMap);
  const byMonth = computeByMonth(trades);

  logger.debug("Win rate calculé", {
    totalTrades: stats.totalTrades,
    winRate: stats.winRate,
    symbols: bySymbol.length,
    strategies: byStrategy.length,
    months: byMonth.length,
  });

  return { stats, bySymbol, byStrategy, byMonth, isEmpty: false };
}
