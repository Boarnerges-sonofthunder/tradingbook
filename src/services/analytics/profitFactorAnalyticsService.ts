// ============================================================
// Service — Analytics Profit Factor
// ============================================================
// Phase 7 — Étape 6 : Analyse du Profit Factor.
//
// Mesure le rapport entre les gains bruts et les pertes brutes
// pour évaluer la rentabilité globale des trades fermés.
//
// FORMULE :
//   profitFactor = totalGains / |totalLosses|
//
// EXEMPLE :
//   gains = 1 000 USD, pertes = -500 USD → PF = 2.0
//   gains = 750 USD,   pertes = -750 USD → PF = 1.0  (breakeven)
//   gains = 500 USD,   pertes = -1 000 USD → PF = 0.5 (sous-performant)
//
// CAS SPÉCIAUX :
//   - gains > 0, pertes = 0 → null ("∞" affiché en UI)
//   - gains = 0, pertes > 0 → 0
//   - gains = 0, pertes = 0 → null (tous breakeven ou aucun trade)
//
// PAYOFF RATIO :
//   Complément du Profit Factor qui compare les moyennes :
//   payoffRatio = gainMoyen / |perteMoyenne|
//   Ex : PF = 2.0 avec WR = 50% → payoffRatio = 2.0 aussi
//       (chaque gain vaut 2x la perte moyenne)
//
// Architecture :
//   AnalyticsPage (React)
//     └── getProfitFactorStats()           ← ici
//           ├── findTrades(closed)          ← tradesRepository
//           └── findStrategies()            ← strategiesRepository
//                 └── SQLite
//
// Règle : aucun appel SQLite direct dans ce fichier.
// ============================================================

import { findTradesForAnalytics, findStrategies, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  ProfitFactorStats,
  ProfitFactorBySymbol,
  ProfitFactorByStrategy,
  ProfitFactorByMonth,
  ProfitFactorResult,
} from "../../types/analytics";

const logger = createLogger("analytics.profitfactor");

// ============================================================
// Types internes (non exportés)
// ============================================================

/** Accumulateur générique gains/pertes. */
interface PFBucket {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  totalGains: number;   // somme des net_pnl > 0
  totalLosses: number;  // valeur absolue de la somme des net_pnl < 0
}

// ============================================================
// Helpers de calcul — fonctions pures, sans effet de bord
// ============================================================

/** Crée un accumulateur vide. */
function emptyBucket(): PFBucket {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    totalGains: 0,
    totalLosses: 0,
  };
}

/**
 * Retourne le net_pnl d'un trade.
 * Priorité : champ stocké `netPnl` → calcul depuis gross_pnl − frais.
 */
function netPnlOf(t: Trade): number {
  return t.netPnl ?? (t.grossPnl ?? 0) - t.commission - t.swap - t.fees;
}

/**
 * Alimente un accumulateur avec le résultat d'un trade.
 */
function feedBucket(bucket: PFBucket, pnl: number): void {
  bucket.totalTrades += 1;
  if (pnl > 0) {
    bucket.winningTrades += 1;
    bucket.totalGains += pnl;
  } else if (pnl < 0) {
    bucket.losingTrades += 1;
    bucket.totalLosses += Math.abs(pnl); // toujours positif
  } else {
    bucket.breakevenTrades += 1;
  }
}

/**
 * Calcule le profit factor depuis un accumulateur.
 *
 * @returns null si totalLosses = 0 ("∞" affiché en UI),
 *          0 si totalGains = 0 et totalLosses > 0,
 *          sinon le ratio (> 0).
 */
function computePF(bucket: PFBucket): number | null {
  if (bucket.totalLosses === 0) {
    // Soit aucun perdant (→ "∞"), soit aucun trade du tout
    return null;
  }
  return bucket.totalGains / bucket.totalLosses;
}

/**
 * Détermine la devise majoritaire parmi les trades.
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
    if (count > max) {
      max = count;
      best = currency;
    }
  }
  return best;
}

/**
 * Extrait le mois d'une date ISO au format "YYYY-MM".
 * Retourne "0000-00" si la date est absente ou invalide.
 */
function toMonthKey(dateStr: string | null): string {
  if (!dateStr || dateStr.length < 7) return "0000-00";
  return dateStr.substring(0, 7); // "YYYY-MM"
}

// ============================================================
// Calculs agrégés
// ============================================================

/**
 * Calcule les statistiques globales depuis les buckets.
 */
function bucketToStats(
  bucket: PFBucket,
  currency: string,
): ProfitFactorStats {
  const avgGain =
    bucket.winningTrades > 0
      ? bucket.totalGains / bucket.winningTrades
      : 0;

  const avgLoss =
    bucket.losingTrades > 0
      ? bucket.totalLosses / bucket.losingTrades
      : 0;

  const payoffRatio =
    avgLoss > 0 ? avgGain / avgLoss : null;

  return {
    totalTrades: bucket.totalTrades,
    currency,
    winningTrades: bucket.winningTrades,
    losingTrades: bucket.losingTrades,
    breakevenTrades: bucket.breakevenTrades,
    totalGains: bucket.totalGains,
    totalLosses: bucket.totalLosses,
    profitFactor: computePF(bucket),
    avgGain,
    avgLoss,
    payoffRatio,
  };
}

/**
 * Construit le détail par symbole.
 * Trie par totalTrades décroissant (les plus actifs en premier).
 */
function buildBySymbol(trades: Trade[]): ProfitFactorBySymbol[] {
  const map = new Map<string, PFBucket>();

  for (const t of trades) {
    const key = t.symbol;
    if (!map.has(key)) map.set(key, emptyBucket());
    feedBucket(map.get(key)!, netPnlOf(t));
  }

  return [...map.entries()]
    .map(([symbol, b]) => ({
      symbol,
      totalTrades: b.totalTrades,
      winningTrades: b.winningTrades,
      losingTrades: b.losingTrades,
      totalGains: b.totalGains,
      totalLosses: b.totalLosses,
      profitFactor: computePF(b),
    }))
    .sort((a, b) => b.totalTrades - a.totalTrades);
}

/**
 * Construit le détail par stratégie.
 * Seuls les trades ayant un `strategyId` non-null sont inclus.
 * Trie par totalTrades décroissant.
 */
function buildByStrategy(
  trades: Trade[],
  strategyNames: Map<number, string>,
): ProfitFactorByStrategy[] {
  const map = new Map<number, PFBucket>();

  for (const t of trades) {
    if (t.strategyId === null) continue;
    if (!map.has(t.strategyId)) map.set(t.strategyId, emptyBucket());
    feedBucket(map.get(t.strategyId)!, netPnlOf(t));
  }

  return [...map.entries()]
    .map(([strategyId, b]) => ({
      strategyId,
      strategyName: strategyNames.get(strategyId) ?? `Stratégie #${strategyId}`,
      totalTrades: b.totalTrades,
      winningTrades: b.winningTrades,
      losingTrades: b.losingTrades,
      totalGains: b.totalGains,
      totalLosses: b.totalLosses,
      profitFactor: computePF(b),
    }))
    .sort((a, b) => b.totalTrades - a.totalTrades);
}

/**
 * Construit le détail par mois calendaire.
 * Trie du plus récent au plus ancien.
 */
function buildByMonth(trades: Trade[]): ProfitFactorByMonth[] {
  const map = new Map<string, PFBucket>();

  for (const t of trades) {
    const key = toMonthKey(t.closedAt);
    if (!map.has(key)) map.set(key, emptyBucket());
    feedBucket(map.get(key)!, netPnlOf(t));
  }

  return [...map.entries()]
    .map(([month, b]) => ({
      month,
      totalTrades: b.totalTrades,
      winningTrades: b.winningTrades,
      losingTrades: b.losingTrades,
      totalGains: b.totalGains,
      totalLosses: b.totalLosses,
      profitFactor: computePF(b),
    }))
    .sort((a, b) => b.month.localeCompare(a.month)); // plus récent en premier
}

// ============================================================
// Fonction principale exportée
// ============================================================

/**
 * Calcule les statistiques de Profit Factor depuis les trades fermés.
 *
 * Seuls les trades avec `status = "closed"` sont inclus :
 *   - Les trades ouverts ont un P&L non réalisé → biais dans les stats.
 *   - Les trades annulés n'ont jamais eu lieu.
 *
 * @param filters - Filtres optionnels (dateRange, symbol, strategyId…)
 * @returns Stats globales + breakdown par symbole, stratégie, mois.
 */
export async function getProfitFactorStats(
  filters?: TradeFilters,
): Promise<ProfitFactorResult> {
  logger.debug("Calcul des statistiques de profit factor", { filters });

  const [trades, strategies] = await Promise.all([
    findTradesForAnalytics({ ...filters, status: "closed" }),
    findStrategies(),
  ]);

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — résultat vide");
    return { stats: null, bySymbol: [], byStrategy: [], byMonth: [], isEmpty: true };
  }

  // Dictionnaire id → nom pour les stratégies
  const strategyNames = new Map(
    strategies.map((s) => [s.id, s.name]),
  );

  // ── Bucket global ─────────────────────────────────────────
  const globalBucket = emptyBucket();
  for (const t of trades) {
    feedBucket(globalBucket, netPnlOf(t));
  }

  const currency = dominantCurrency(trades);
  const stats = bucketToStats(globalBucket, currency);

  // ── Breakdowns ────────────────────────────────────────────
  const bySymbol = buildBySymbol(trades);
  const byStrategy = buildByStrategy(trades, strategyNames);
  const byMonth = buildByMonth(trades);

  logger.debug("Statistiques profit factor calculées", {
    total: stats.totalTrades,
    pf: stats.profitFactor,
    gains: stats.totalGains,
    losses: stats.totalLosses,
  });

  return { stats, bySymbol, byStrategy, byMonth, isEmpty: false };
}
