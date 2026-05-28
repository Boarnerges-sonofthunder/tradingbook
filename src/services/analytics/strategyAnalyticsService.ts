// ============================================================
// Service — Analytics par Stratégie
// ============================================================
// Phase 7 — Étape 9 : Analyse de performance par stratégie/playbook.
//
// Permet d'identifier quelles stratégies sont rentables, lesquelles
// ont le meilleur win rate ou le meilleur profit factor.
//
// FONCTIONNEMENT :
//   1. Charge en parallèle les trades fermés + toutes les stratégies.
//   2. Groupe les trades par `strategyId` en un seul passage.
//   3. Les trades avec `strategyId = null` vont dans un groupe virtuel
//      "Sans stratégie" (UNASSIGNED_STRATEGY_ID = 0).
//   4. Calcule pour chaque groupe les mêmes statistiques que le service
//      symbolAnalyticsService (PnL, win rate, avgWin/Loss, PF, R/R).
//   5. Tri : stratégies réelles par PnL décroissant, "Sans stratégie" en
//      dernière position (quel que soit son PnL).
//   6. Construit StrategyOverviewStats : meilleure/pire stratégie,
//      plus utilisée, meilleur win rate (seuil ≥ MIN_TRADES = 5).
//
// GROUPE "SANS STRATÉGIE" :
//   - ID virtuel : UNASSIGNED_STRATEGY_ID = 0
//   - Nom affiché : UNASSIGNED_STRATEGY_NAME = "Sans stratégie"
//   - isUnassigned = true pour ce groupe uniquement
//   - Exclu des calculs d'overview (bestStrategy, bestWinRate, mostUsed)
//   - Affiché en dernier dans le tableau
//
// EXTRACTION DU R/R (même logique que symbolAnalyticsService) :
//   Priorité 1 : champ `riskRewardRatio` stocké (> 0 et fini)
//   Priorité 2 : calcul depuis entryPrice / stopLoss / takeProfit
//
// Architecture :
//   AnalyticsPage (React)
//     └── getStrategyStats()              ← ici
//           ├── findTrades(closed)          ← tradesRepository
//           └── findStrategies()            ← strategiesRepository
//                 └── SQLite
//
// Règle : aucun appel SQLite direct dans ce fichier.
// ============================================================

import {
  findTradesForAnalytics,
  findStrategies,
  type TradeFilters,
} from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  StrategyStats,
  StrategyOverviewStats,
  StrategyResult,
} from "../../types/analytics";

const logger = createLogger("analytics.strategy");

// ============================================================
// Constantes
// ============================================================

/**
 * ID virtuel utilisé pour regrouper les trades sans stratégie affectée.
 * 0 est impossible comme ID SQLite réel (auto-increment part de 1).
 */
const UNASSIGNED_STRATEGY_ID = 0;

/** Nom affiché pour le groupe des trades sans stratégie. */
const UNASSIGNED_STRATEGY_NAME = "Sans stratégie";

/**
 * Nombre minimum de trades requis pour qu'une stratégie soit éligible
 * au classement "Meilleur Win Rate" dans l'overview.
 * Évite qu'une stratégie avec 1 seul trade (100% WR) domine.
 */
const MIN_TRADES_FOR_WINRATE = 5;

// ============================================================
// Types internes (non exportés)
// ============================================================

/**
 * Accumulateur de données brutes pour une stratégie donnée.
 * Structure identique à SymbolBucket, mais avec un `strategyId`.
 */
interface StrategyBucket {
  strategyId: number;
  strategyName: string;
  isUnassigned: boolean;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  sumPnl: number;       // Σ net_pnl (tous trades)
  sumWins: number;      // Σ net_pnl > 0 (gains bruts)
  sumLosses: number;    // Σ net_pnl < 0 (pertes, toujours ≤ 0)
  bestTrade: number;    // max net_pnl observé
  worstTrade: number;   // min net_pnl observé
  sumRR: number;        // Σ R/R exploitables
  tradesWithRR: number; // nb trades avec R/R calculable
  currencies: Map<string, number>; // fréquence par devise
}

// ============================================================
// Helpers de calcul — fonctions pures, sans effet de bord
// ============================================================

/** Crée un accumulateur vide pour une stratégie donnée. */
function emptyBucket(
  strategyId: number,
  strategyName: string,
  isUnassigned: boolean,
): StrategyBucket {
  return {
    strategyId,
    strategyName,
    isUnassigned,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    sumPnl: 0,
    sumWins: 0,
    sumLosses: 0,
    bestTrade: 0,
    worstTrade: 0,
    sumRR: 0,
    tradesWithRR: 0,
    currencies: new Map(),
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
 * Extrait le ratio Risk/Reward d'un trade.
 * Priorité 1 : `riskRewardRatio` stocké (> 0 et fini).
 * Priorité 2 : calcul depuis entryPrice / stopLoss / takeProfit.
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

/** Devise majoritaire depuis une map fréquence → retourne "USD" si vide. */
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
 * Les extrêmes (bestTrade, worstTrade) sont initialisés au 1er trade.
 */
function feedBucket(bucket: StrategyBucket, t: Trade): void {
  const pnl = netPnlOf(t);

  bucket.totalTrades += 1;
  bucket.sumPnl += pnl;

  bucket.currencies.set(
    t.currency,
    (bucket.currencies.get(t.currency) ?? 0) + 1,
  );

  if (pnl > 0) {
    bucket.winningTrades += 1;
    bucket.sumWins += pnl;
  } else if (pnl < 0) {
    bucket.losingTrades += 1;
    bucket.sumLosses += pnl; // reste négatif
  } else {
    bucket.breakevenTrades += 1;
  }

  if (bucket.totalTrades === 1) {
    bucket.bestTrade = pnl;
    bucket.worstTrade = pnl;
  } else {
    if (pnl > bucket.bestTrade) bucket.bestTrade = pnl;
    if (pnl < bucket.worstTrade) bucket.worstTrade = pnl;
  }

  const rr = extractRR(t);
  if (rr !== null) {
    bucket.tradesWithRR += 1;
    bucket.sumRR += rr;
  }
}

// ============================================================
// Conversion bucket → StrategyStats
// ============================================================

function bucketToStats(b: StrategyBucket): StrategyStats {
  const currency = dominantCurrency(b.currencies);
  const { totalTrades, winningTrades, losingTrades, breakevenTrades } = b;

  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const avgPnl = totalTrades > 0 ? b.sumPnl / totalTrades : 0;
  const avgWin = winningTrades > 0 ? b.sumWins / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? b.sumLosses / losingTrades : 0; // ≤ 0

  const totalGains = b.sumWins;
  const totalLosses = Math.abs(b.sumLosses);
  let profitFactor: number | null;
  if (totalLosses === 0) {
    profitFactor = null; // aucune perte → "∞"
  } else {
    profitFactor = totalGains > 0 ? totalGains / totalLosses : 0;
  }

  const avgRR = b.tradesWithRR > 0 ? b.sumRR / b.tradesWithRR : null;

  return {
    strategyId: b.strategyId,
    strategyName: b.strategyName,
    isUnassigned: b.isUnassigned,
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
// Construction des méta-stats (StrategyOverviewStats)
// ============================================================

/**
 * Calcule les méta-statistiques sur l'ensemble des stratégies.
 * Le groupe "Sans stratégie" est exclu des classements (bestStrategy,
 * bestWinRate, mostUsed) mais son nombre de trades est compté.
 */
function buildOverview(
  rows: StrategyStats[],
  currency: string,
): StrategyOverviewStats {
  let bestStrategy: string | null = null;
  let bestStrategyPnl = -Infinity;
  let worstStrategy: string | null = null;
  let worstStrategyPnl = Infinity;
  let bestWinRateStrategy: string | null = null;
  let bestWinRate = -Infinity;
  let mostUsedStrategy: string | null = null;
  let mostUsedCount = 0;
  let unassignedTrades = 0;
  let realStrategiesCount = 0;

  for (const s of rows) {
    if (s.isUnassigned) {
      // Comptabiliser les trades non affectés, mais ne pas classer
      unassignedTrades = s.totalTrades;
      continue;
    }

    realStrategiesCount += 1;

    // Meilleur PnL (stratégies réelles uniquement)
    if (s.netPnlTotal > bestStrategyPnl) {
      bestStrategyPnl = s.netPnlTotal;
      bestStrategy = s.strategyName;
    }

    // Pire PnL
    if (s.netPnlTotal < worstStrategyPnl) {
      worstStrategyPnl = s.netPnlTotal;
      worstStrategy = s.strategyName;
    }

    // Plus utilisée
    if (s.totalTrades > mostUsedCount) {
      mostUsedCount = s.totalTrades;
      mostUsedStrategy = s.strategyName;
    }

    // Meilleur win rate (seuil minimum anti-biais)
    if (
      s.totalTrades >= MIN_TRADES_FOR_WINRATE &&
      s.winRate > bestWinRate
    ) {
      bestWinRate = s.winRate;
      bestWinRateStrategy = s.strategyName;
    }
  }

  return {
    totalStrategies: realStrategiesCount,
    unassignedTrades,
    currency,
    bestStrategy,
    bestStrategyPnl: bestStrategy !== null ? bestStrategyPnl : 0,
    worstStrategy,
    worstStrategyPnl: worstStrategy !== null ? worstStrategyPnl : 0,
    bestWinRateStrategy,
    bestWinRate: bestWinRateStrategy !== null ? bestWinRate : 0,
    mostUsedStrategy,
    mostUsedCount,
  };
}

// ============================================================
// Fonction principale exportée
// ============================================================

/**
 * Calcule les statistiques de performance pour chaque stratégie.
 *
 * Seuls les trades `status = "closed"` sont inclus.
 *
 * Les trades sans stratégie affectée (`strategyId = null`) sont
 * regroupés dans un groupe virtuel "Sans stratégie" (toujours en
 * dernière position dans le tableau résultant).
 *
 * Résultat trié : stratégies réelles par PnL décroissant,
 *                 puis le groupe "Sans stratégie" en dernier.
 *
 * @param filters - Filtres optionnels (dateRange…)
 */
export async function getStrategyStats(
  filters?: TradeFilters,
): Promise<StrategyResult> {
  logger.debug("Calcul des statistiques par stratégie", { filters });

  // Chargement en parallèle : trades fermés + catalogue stratégies
  const [trades, strategies] = await Promise.all([
    findTradesForAnalytics({ ...filters, status: "closed" }),
    findStrategies(),
  ]);

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — résultat vide");
    return { overview: null, byStrategy: [], isEmpty: true };
  }

  // Dictionnaire id → nom pour la résolution des noms de stratégie
  const strategyNames = new Map(strategies.map((s) => [s.id, s.name]));

  // ── Groupement en un seul passage O(n) ───────────────────
  // Clé : strategyId (number) — 0 pour les trades non affectés.
  const map = new Map<number, StrategyBucket>();

  for (const t of trades) {
    // Résoudre l'ID de groupe : null → UNASSIGNED_STRATEGY_ID
    const groupId = t.strategyId ?? UNASSIGNED_STRATEGY_ID;

    if (!map.has(groupId)) {
      if (groupId === UNASSIGNED_STRATEGY_ID) {
        // Groupe virtuel : pas de stratégie
        map.set(
          groupId,
          emptyBucket(groupId, UNASSIGNED_STRATEGY_NAME, true),
        );
      } else {
        // Stratégie réelle : nom depuis le catalogue, fallback sécurisé
        const name =
          strategyNames.get(groupId) ?? `Stratégie #${groupId}`;
        map.set(groupId, emptyBucket(groupId, name, false));
      }
    }

    feedBucket(map.get(groupId)!, t);
  }

  // ── Conversion accumulateurs → StrategyStats ─────────────
  const real: StrategyStats[] = [];
  let unassigned: StrategyStats | null = null;

  for (const bucket of map.values()) {
    const stats = bucketToStats(bucket);
    if (stats.isUnassigned) {
      unassigned = stats;
    } else {
      real.push(stats);
    }
  }

  // ── Tri ───────────────────────────────────────────────────
  // Stratégies réelles : PnL net décroissant (meilleures en tête).
  real.sort((a, b) => b.netPnlTotal - a.netPnlTotal);

  // Le groupe "Sans stratégie" est toujours placé en dernier.
  const byStrategy: StrategyStats[] = unassigned !== null
    ? [...real, unassigned]
    : real;

  // ── Devise globale ────────────────────────────────────────
  const globalCurrencies = new Map<string, number>();
  for (const t of trades) {
    globalCurrencies.set(
      t.currency,
      (globalCurrencies.get(t.currency) ?? 0) + 1,
    );
  }
  let globalCurrency = "USD";
  let maxCount = 0;
  for (const [currency, count] of globalCurrencies.entries()) {
    if (count > maxCount) {
      maxCount = count;
      globalCurrency = currency;
    }
  }

  const overview = buildOverview(byStrategy, globalCurrency);

  logger.debug("Statistiques par stratégie calculées", {
    strategies: real.length,
    unassigned: unassigned?.totalTrades ?? 0,
    best: overview.bestStrategy,
  });

  return { overview, byStrategy, isEmpty: false };
}
