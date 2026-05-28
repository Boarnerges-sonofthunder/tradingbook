// ============================================================
// Service — Analytics Average Win / Average Loss
// ============================================================
// Phase 7 — Étape 7 : Analyse du gain moyen et de la perte moyenne.
//
// Mesure la qualité individuelle des trades : combien un utilisateur
// gagne en moyenne sur ses trades gagnants et perd sur ses perdants.
//
// FORMULES :
//   avgWin       = Σ(net_pnl > 0) / nbGagnants
//   avgLoss      = Σ(net_pnl < 0) / nbPerdants  (valeur négative)
//   winLossRatio = avgWin / |avgLoss|
//
// CONVENTION BREAKEVEN :
//   Les trades avec net_pnl = 0 sont exclus des calculs de moyennes.
//   Ils ne représentent ni un gain ni une perte : les inclure diluerait
//   la moyenne sans apporter d'information qualitative.
//   Ils sont comptabilisés dans `breakevenTrades` à titre informatif.
//
// CAS SPÉCIAUX :
//   - Aucun gagnant  → avgWin = 0, winLossRatio = 0
//   - Aucun perdant  → avgLoss = 0, winLossRatio = null ("∞" en UI)
//   - Aucun trade    → isEmpty = true, stats = null
//
// Architecture :
//   AnalyticsPage (React)
//     └── getAvgWinLossStats()             ← ici
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
  AvgWinLossStats,
  AvgWinLossBySymbol,
  AvgWinLossByStrategy,
  AvgWinLossResult,
} from "../../types/analytics";

const logger = createLogger("analytics.avgwinloss");

// ============================================================
// Types internes (non exportés)
// ============================================================

/**
 * Accumulateur de données brutes pour le calcul des moyennes.
 * sumWins   : somme des net_pnl positifs (toujours ≥ 0)
 * sumLosses : somme des net_pnl négatifs (toujours ≤ 0)
 * bestTrade : maximum des net_pnl observés (meilleur gain unique)
 * worstTrade: minimum des net_pnl observés (pire perte unique)
 */
interface AWLBucket {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  sumWins: number;
  sumLosses: number;  // valeur toujours ≤ 0
  bestTrade: number;
  worstTrade: number;
}

// ============================================================
// Helpers de calcul — fonctions pures, sans effet de bord
// ============================================================

/** Crée un accumulateur vide. */
function emptyBucket(): AWLBucket {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    sumWins: 0,
    sumLosses: 0,
    bestTrade: 0,
    worstTrade: 0,
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
 * Les breakeven (pnl = 0) sont comptés mais exclus des sommes.
 */
function feedBucket(bucket: AWLBucket, pnl: number): void {
  bucket.totalTrades += 1;

  if (pnl > 0) {
    bucket.winningTrades += 1;
    bucket.sumWins += pnl;
    if (pnl > bucket.bestTrade) bucket.bestTrade = pnl;
  } else if (pnl < 0) {
    bucket.losingTrades += 1;
    bucket.sumLosses += pnl; // reste négatif
    if (pnl < bucket.worstTrade) bucket.worstTrade = pnl;
  } else {
    // pnl === 0 : breakeven — comptabilisé mais exclu des moyennes
    bucket.breakevenTrades += 1;
  }
}

/**
 * Calcule le gain moyen.
 * Retourne 0 si aucun trade gagnant (pas null, pour simplifier le rendu).
 */
function calcAvgWin(b: AWLBucket): number {
  return b.winningTrades > 0 ? b.sumWins / b.winningTrades : 0;
}

/**
 * Calcule la perte moyenne.
 * Retourne 0 si aucun trade perdant (valeur de référence neutre).
 * La valeur est ≤ 0 : c'est la moyenne des net_pnl négatifs.
 */
function calcAvgLoss(b: AWLBucket): number {
  return b.losingTrades > 0 ? b.sumLosses / b.losingTrades : 0;
}

/**
 * Calcule le ratio gain moyen / |perte moyenne|.
 *
 * @returns null si pas de trades perdants ("∞" en UI),
 *          0 si pas de trades gagnants,
 *          sinon le ratio (> 0).
 */
function calcWinLossRatio(b: AWLBucket): number | null {
  const avgLoss = calcAvgLoss(b);
  if (avgLoss === 0) return null;       // aucun perdant → "∞"
  const avgWin = calcAvgWin(b);
  return avgWin / Math.abs(avgLoss);    // toujours ≥ 0
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

// ============================================================
// Calculs agrégés
// ============================================================

/**
 * Construit le détail par symbole.
 * Trie par totalTrades décroissant (les plus actifs en premier).
 */
function buildBySymbol(trades: Trade[]): AvgWinLossBySymbol[] {
  const map = new Map<string, AWLBucket>();

  for (const t of trades) {
    if (!map.has(t.symbol)) map.set(t.symbol, emptyBucket());
    feedBucket(map.get(t.symbol)!, netPnlOf(t));
  }

  return [...map.entries()]
    .map(([symbol, b]) => ({
      symbol,
      totalTrades: b.totalTrades,
      winningTrades: b.winningTrades,
      losingTrades: b.losingTrades,
      avgWin: calcAvgWin(b),
      avgLoss: calcAvgLoss(b),
      winLossRatio: calcWinLossRatio(b),
      bestTrade: b.bestTrade,
      worstTrade: b.worstTrade,
    }))
    .sort((a, b) => b.totalTrades - a.totalTrades);
}

/**
 * Construit le détail par stratégie.
 * Seuls les trades avec un `strategyId` non-null sont inclus.
 * Trie par totalTrades décroissant.
 */
function buildByStrategy(
  trades: Trade[],
  strategyNames: Map<number, string>,
): AvgWinLossByStrategy[] {
  const map = new Map<number, AWLBucket>();

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
      avgWin: calcAvgWin(b),
      avgLoss: calcAvgLoss(b),
      winLossRatio: calcWinLossRatio(b),
      bestTrade: b.bestTrade,
      worstTrade: b.worstTrade,
    }))
    .sort((a, b) => b.totalTrades - a.totalTrades);
}

// ============================================================
// Fonction principale exportée
// ============================================================

/**
 * Calcule le gain moyen et la perte moyenne depuis les trades fermés.
 *
 * Seuls les trades avec `status = "closed"` sont inclus :
 *   - Les trades ouverts ont un P&L non réalisé → biais dans les stats.
 *   - Les trades annulés n'ont jamais eu lieu.
 *
 * @param filters - Filtres optionnels (dateRange, symbol, strategyId…)
 * @returns Statistiques globales + breakdown par symbole et stratégie.
 */
export async function getAvgWinLossStats(
  filters?: TradeFilters,
): Promise<AvgWinLossResult> {
  logger.debug("Calcul des statistiques average win/loss", { filters });

  const [trades, strategies] = await Promise.all([
    findTradesForAnalytics({ ...filters, status: "closed" }),
    findStrategies(),
  ]);

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — résultat vide");
    return { stats: null, bySymbol: [], byStrategy: [], isEmpty: true };
  }

  // Dictionnaire id → nom pour les stratégies
  const strategyNames = new Map(strategies.map((s) => [s.id, s.name]));

  // ── Bucket global ─────────────────────────────────────────
  const globalBucket = emptyBucket();
  for (const t of trades) {
    feedBucket(globalBucket, netPnlOf(t));
  }

  const currency = dominantCurrency(trades);

  const stats: AvgWinLossStats = {
    totalTrades: globalBucket.totalTrades,
    currency,
    winningTrades: globalBucket.winningTrades,
    losingTrades: globalBucket.losingTrades,
    breakevenTrades: globalBucket.breakevenTrades,
    avgWin: calcAvgWin(globalBucket),
    avgLoss: calcAvgLoss(globalBucket),
    winLossRatio: calcWinLossRatio(globalBucket),
    bestTrade: globalBucket.bestTrade,
    worstTrade: globalBucket.worstTrade,
  };

  // ── Breakdowns ────────────────────────────────────────────
  const bySymbol = buildBySymbol(trades);
  const byStrategy = buildByStrategy(trades, strategyNames);

  logger.debug("Statistiques avg win/loss calculées", {
    total: stats.totalTrades,
    avgWin: stats.avgWin,
    avgLoss: stats.avgLoss,
    ratio: stats.winLossRatio,
  });

  return { stats, bySymbol, byStrategy, isEmpty: false };
}
