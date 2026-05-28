// ============================================================
// Service — Analytics par Symbole
// ============================================================
// Phase 7 — Étape 8 : Analyse de performance par symbole.
//
// Permet d'identifier quels instruments sont les plus rentables,
// les plus tradés ou les mieux maîtrisés en termes de win rate.
//
// FONCTIONNEMENT :
//   1. Charge tous les trades fermés (status = "closed").
//   2. Groupe les trades par `symbol` en un seul passage.
//   3. Calcule, pour chaque symbole :
//        - PnL total, moyen, meilleur/pire trade
//        - Win rate (% de trades gagnants)
//        - Gain moyen / Perte moyenne (avgWin, avgLoss)
//        - Profit Factor (gains bruts / pertes brutes)
//        - Risk/Reward moyen (si SL/TP disponibles)
//   4. Construit un objet SymbolOverviewStats (méta-stats) :
//        - meilleur symbole par PnL
//        - pire symbole par PnL
//        - symbole le plus tradé
//        - meilleur win rate (filtre : ≥ 5 trades minimum)
//
// CONVENTIONS :
//   - avgLoss      : valeur ≤ 0 (signe naturel du PnL perdant)
//   - profitFactor : null si aucune perte ("∞" en UI)
//   - avgRR        : null si aucun R/R calculable (pas de SL/TP)
//   - bestTrade / worstTrade : valeur unique de trade, pas de moyenne
//
// EXTRACTION DU R/R :
//   Priorité 1 : champ `riskRewardRatio` stocké (> 0 et fini)
//   Priorité 2 : calcul depuis entryPrice / stopLoss / takeProfit
//     risk   = |entryPrice − stopLoss|
//     reward = |takeProfit − entryPrice|
//     R/R    = reward / risk
//
// WIN RATE OVERVIEW :
//   Seuil MIN_TRADES_FOR_WINRATE (= 5) pour éviter les biais
//   statistiques sur les symboles très peu tradés (1–2 trades à 100%).
//
// Architecture :
//   AnalyticsPage (React)
//     └── getSymbolStats()               ← ici
//           └── findTrades(closed)        ← tradesRepository
//                 └── SQLite
//
// Règle : aucun appel SQLite direct dans ce fichier.
// ============================================================

import { findTradesForAnalytics, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  SymbolStats,
  SymbolOverviewStats,
  SymbolResult,
} from "../../types/analytics";

const logger = createLogger("analytics.symbol");

// ============================================================
// Constante
// ============================================================

/**
 * Nombre minimum de trades requis pour qu'un symbole soit pris
 * en compte dans le classement "Meilleur Win Rate" de l'overview.
 * Évite qu'un symbole avec 1 seul trade gagnant domine le tableau.
 */
const MIN_TRADES_FOR_WINRATE = 5;

// ============================================================
// Types internes (non exportés)
// ============================================================

/**
 * Accumulateur de données brutes pour un symbole donné.
 * Permet de calculer toutes les statistiques en un seul passage.
 */
interface SymbolBucket {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  sumPnl: number;        // Σ net_pnl (tous trades)
  sumWins: number;       // Σ net_pnl > 0 (gains bruts)
  sumLosses: number;     // Σ net_pnl < 0 (pertes, toujours ≤ 0)
  bestTrade: number;     // max net_pnl observé
  worstTrade: number;    // min net_pnl observé
  sumRR: number;         // Σ R/R exploitables
  tradesWithRR: number;  // nb de trades avec R/R calculable
  currencies: Map<string, number>; // fréquence par devise
}

// ============================================================
// Helpers de calcul — fonctions pures, sans effet de bord
// ============================================================

/** Crée un accumulateur vide pour un symbole donné. */
function emptyBucket(symbol: string): SymbolBucket {
  return {
    symbol,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    sumPnl: 0,
    sumWins: 0,
    sumLosses: 0,
    bestTrade: 0,       // sera corrigé au premier trade
    worstTrade: 0,      // idem
    sumRR: 0,
    tradesWithRR: 0,
    currencies: new Map(),
  };
}

/**
 * Retourne le net_pnl d'un trade.
 * Priorité : champ stocké `netPnl` → calcul depuis gross_pnl − frais.
 * Cette fonction est partagée avec les autres services analytics.
 */
function netPnlOf(t: Trade): number {
  return t.netPnl ?? (t.grossPnl ?? 0) - t.commission - t.swap - t.fees;
}

/**
 * Extrait le ratio Risk/Reward d'un trade.
 *
 * Priorité 1 : champ `riskRewardRatio` stocké (si > 0 et fini).
 * Priorité 2 : calcul depuis entryPrice / stopLoss / takeProfit.
 *   risk   = |entryPrice − stopLoss|
 *   reward = |takeProfit − entryPrice|
 *   R/R    = reward / risk  (rejeté si ≤ 0 → saisie incohérente)
 *
 * @returns Le ratio (> 0) ou null si incalculable.
 */
function extractRR(t: Trade): number | null {
  if (
    t.riskRewardRatio !== null &&
    t.riskRewardRatio > 0 &&
    isFinite(t.riskRewardRatio)
  ) {
    return t.riskRewardRatio;
  }
  if (t.stopLoss !== null && t.takeProfit !== null && t.entryPrice > 0) {
    const risk = Math.abs(t.entryPrice - t.stopLoss);
    const reward = Math.abs(t.takeProfit - t.entryPrice);
    if (risk > 0 && reward > 0) return reward / risk;
  }
  return null;
}

/**
 * Détermine la devise majoritaire à partir d'une map fréquence→devise.
 * Retourne "USD" si la map est vide.
 */
function dominantCurrency(freq: Map<string, number>): string {
  let best = "USD";
  let max = 0;
  for (const [currency, count] of freq.entries()) {
    if (count > max) {
      max = count;
      best = currency;
    }
  }
  return best;
}

/**
 * Alimente un accumulateur avec le résultat d'un seul trade.
 * Mise à jour des extrêmes lors de chaque appel.
 */
function feedBucket(bucket: SymbolBucket, t: Trade): void {
  const pnl = netPnlOf(t);

  bucket.totalTrades += 1;
  bucket.sumPnl += pnl;

  // Fréquence devise
  bucket.currencies.set(
    t.currency,
    (bucket.currencies.get(t.currency) ?? 0) + 1,
  );

  // Catégorisation du trade
  if (pnl > 0) {
    bucket.winningTrades += 1;
    bucket.sumWins += pnl;
  } else if (pnl < 0) {
    bucket.losingTrades += 1;
    bucket.sumLosses += pnl; // reste négatif
  } else {
    bucket.breakevenTrades += 1;
  }

  // Extrêmes : initialisation sur le premier trade
  if (bucket.totalTrades === 1) {
    bucket.bestTrade = pnl;
    bucket.worstTrade = pnl;
  } else {
    if (pnl > bucket.bestTrade) bucket.bestTrade = pnl;
    if (pnl < bucket.worstTrade) bucket.worstTrade = pnl;
  }

  // Risk/Reward
  const rr = extractRR(t);
  if (rr !== null) {
    bucket.tradesWithRR += 1;
    bucket.sumRR += rr;
  }
}

// ============================================================
// Conversion bucket → SymbolStats
// ============================================================

/**
 * Convertit un accumulateur brut en SymbolStats calculées.
 * Toutes les divisions sont gardées par zéro en amont.
 */
function bucketToStats(b: SymbolBucket): SymbolStats {
  const currency = dominantCurrency(b.currencies);
  const { totalTrades, winningTrades, losingTrades, breakevenTrades } = b;

  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const avgPnl = totalTrades > 0 ? b.sumPnl / totalTrades : 0;
  const avgWin = winningTrades > 0 ? b.sumWins / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? b.sumLosses / losingTrades : 0; // ≤ 0

  // profitFactor :
  //   totalLosses = valeur absolue de sumLosses (toujours ≥ 0)
  //   null = "∞"  (aucune perte)
  //   0           (aucun gain mais pertes > 0)
  const totalGains = b.sumWins;
  const totalLosses = Math.abs(b.sumLosses);
  let profitFactor: number | null;
  if (totalLosses === 0) {
    profitFactor = null; // aucune perte → "∞"
  } else {
    profitFactor = totalGains > 0 ? totalGains / totalLosses : 0;
  }

  const avgRR =
    b.tradesWithRR > 0 ? b.sumRR / b.tradesWithRR : null;

  return {
    symbol: b.symbol,
    currency,
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    netPnlTotal: b.sumPnl,
    avgPnl,
    bestTrade: b.bestTrade,
    worstTrade: b.worstTrade,
    winRate,
    avgWin,
    avgLoss,
    totalGains,
    totalLosses,
    profitFactor,
    avgRR,
    tradesWithRR: b.tradesWithRR,
  };
}

// ============================================================
// Construction des méta-stats (SymbolOverviewStats)
// ============================================================

/**
 * Calcule les méta-statistiques sur l'ensemble des symboles.
 * Utilisé pour les 4 cartes de résumé en haut de section.
 *
 * Règle win rate : seuil MIN_TRADES_FOR_WINRATE pour éviter les biais
 * (ex : 1 trade sur USDJPY → 100% win rate ne doit pas "gagner").
 */
function buildOverview(
  rows: SymbolStats[],
  currency: string,
): SymbolOverviewStats {
  let bestSymbol: string | null = null;
  let bestSymbolPnl = -Infinity;
  let worstSymbol: string | null = null;
  let worstSymbolPnl = Infinity;
  let mostTradedSymbol: string | null = null;
  let mostTradedCount = 0;
  let bestWinRateSymbol: string | null = null;
  let bestWinRate = -Infinity;

  for (const s of rows) {
    // Meilleur PnL
    if (s.netPnlTotal > bestSymbolPnl) {
      bestSymbolPnl = s.netPnlTotal;
      bestSymbol = s.symbol;
    }
    // Pire PnL
    if (s.netPnlTotal < worstSymbolPnl) {
      worstSymbolPnl = s.netPnlTotal;
      worstSymbol = s.symbol;
    }
    // Plus tradé
    if (s.totalTrades > mostTradedCount) {
      mostTradedCount = s.totalTrades;
      mostTradedSymbol = s.symbol;
    }
    // Meilleur win rate (seuil minimum)
    if (
      s.totalTrades >= MIN_TRADES_FOR_WINRATE &&
      s.winRate > bestWinRate
    ) {
      bestWinRate = s.winRate;
      bestWinRateSymbol = s.symbol;
    }
  }

  return {
    totalSymbols: rows.length,
    currency,
    bestSymbol,
    bestSymbolPnl: bestSymbol !== null ? bestSymbolPnl : 0,
    worstSymbol,
    worstSymbolPnl: worstSymbol !== null ? worstSymbolPnl : 0,
    mostTradedSymbol,
    mostTradedCount,
    bestWinRateSymbol,
    bestWinRate: bestWinRateSymbol !== null ? bestWinRate : 0,
  };
}

// ============================================================
// Fonction principale exportée
// ============================================================

/**
 * Calcule les statistiques de performance pour chaque symbole tradé.
 *
 * Seuls les trades avec `status = "closed"` sont inclus :
 *   - Les trades ouverts ont un P&L non réalisé → biais dans les stats.
 *   - Les trades annulés n'ont jamais existé réellement.
 *
 * Résultat trié par PnL net décroissant (meilleurs symboles en premier).
 *
 * @param filters - Filtres optionnels (dateRange, symbol individuel…)
 * @returns Overview + détail par symbole.
 */
export async function getSymbolStats(
  filters?: TradeFilters,
): Promise<SymbolResult> {
  logger.debug("Calcul des statistiques par symbole", { filters });

  const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — résultat vide");
    return { overview: null, bySymbol: [], isEmpty: true };
  }

  // ── Groupement en un seul passage O(n) ───────────────────
  // Clé = symbol, valeur = accumulateur de statistiques brutes.
  // Un seul parcours du tableau de trades suffit.
  const map = new Map<string, SymbolBucket>();

  for (const t of trades) {
    if (!map.has(t.symbol)) {
      map.set(t.symbol, emptyBucket(t.symbol));
    }
    feedBucket(map.get(t.symbol)!, t);
  }

  // ── Conversion accumulateurs → SymbolStats ────────────────
  const bySymbol: SymbolStats[] = [];
  for (const bucket of map.values()) {
    bySymbol.push(bucketToStats(bucket));
  }

  // ── Tri par défaut : PnL décroissant ─────────────────────
  // Affiche les symboles les plus rentables en tête de tableau.
  bySymbol.sort((a, b) => b.netPnlTotal - a.netPnlTotal);

  // ── Devise globale pour l'overview ────────────────────────
  const allCurrencies: Map<string, number> = new Map();
  for (const t of trades) {
    allCurrencies.set(
      t.currency,
      (allCurrencies.get(t.currency) ?? 0) + 1,
    );
  }
  const globalCurrency = dominantCurrency(allCurrencies);

  const overview = buildOverview(bySymbol, globalCurrency);

  logger.debug("Statistiques par symbole calculées", {
    symbols: bySymbol.length,
    bestSymbol: overview.bestSymbol,
    worstSymbol: overview.worstSymbol,
  });

  return { overview, bySymbol, isEmpty: false };
}
