// ============================================================
// Service — Analytics par Émotion
// ============================================================
// Phase 7 — Étape 11 : Analyse de performance par émotion.
//
// Permet d'identifier quelles émotions sont associées aux
// meilleures ou pires performances de trading.
//
// FONCTIONNEMENT :
//   1. Charge en parallèle :
//      - les trades fermés (status = "closed")
//      - le catalogue des émotions
//      - toutes les liaisons trade ↔ émotion (trade_emotions)
//   2. Construit un index Map<tradeId, Set<emotionId>> pour
//      savoir quelles émotions sont associées à chaque trade.
//   3. Groupe les trades par émotion :
//      - Un trade avec N émotions contribue à N groupes.
//      - Un trade sans émotion va dans le groupe "Sans émotion" (ID 0).
//   4. Calcule pour chaque groupe : PnL, win rate, avgWin/Loss, PF.
//   5. Tri : émotions réelles par PnL décroissant,
//            "Sans émotion" toujours en dernière position.
//   6. Construit EmotionOverviewStats pour les cartes de résumé.
//
// GROUPE "SANS ÉMOTION" :
//   - ID virtuel : UNASSIGNED_EMOTION_ID = 0
//   - Nom affiché : UNASSIGNED_EMOTION_NAME = "Sans émotion"
//   - isUnassigned = true pour ce groupe uniquement
//   - Exclu des classements (bestEmotion, bestWinRate, mostUsed)
//   - Affiché en dernier dans le tableau
//
// NOTE SUR LA DUPLICATION DES TRADES :
//   Un trade avec plusieurs émotions est comptabilisé dans chaque
//   groupe correspondant. Les totaux par émotion ne sont donc pas
//   additifs entre eux — c'est intentionnel et documenté dans l'UI.
//
// Architecture :
//   AnalyticsPage (React)
//     └── getEmotionStats()                ← ici
//           ├── findTrades(closed)          ← tradesRepository
//           ├── findEmotions()              ← emotionsRepository
//           └── findAllTradeEmotionMappings() ← emotionsRepository
//                 └── SQLite
//
// Règle : aucun appel SQLite direct dans ce fichier.
// ============================================================

import {
  findTradesForAnalytics,
  findEmotions,
  findAllTradeEmotionMappings,
  type TradeFilters,
} from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  EmotionStats,
  EmotionOverviewStats,
  EmotionResult,
} from "../../types/analytics";

const logger = createLogger("analytics.emotion");

// ============================================================
// Constantes
// ============================================================

/**
 * ID virtuel pour regrouper les trades sans émotion associée.
 * 0 est impossible comme ID SQLite réel (auto-increment part de 1).
 */
const UNASSIGNED_EMOTION_ID = 0;

/** Nom affiché pour le groupe des trades sans émotion. */
const UNASSIGNED_EMOTION_NAME = "Sans émotion";

/**
 * Nombre minimum de trades requis pour être éligible
 * au classement "Meilleur Win Rate" dans l'overview.
 * Évite qu'une émotion avec 1 seul trade (100% WR) domine.
 */
const MIN_TRADES_FOR_WINRATE = 5;

// ============================================================
// Types internes (non exportés)
// ============================================================

/**
 * Accumulateur de données brutes pour une émotion donnée.
 * Alimenté trade par trade avant conversion en EmotionStats.
 */
interface EmotionBucket {
  emotionId: number;
  emotionName: string;
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
  currencies: Map<string, number>; // fréquence par devise
}

// ============================================================
// Helpers de calcul — fonctions pures, sans effet de bord
// ============================================================

/** Crée un accumulateur vide pour une émotion donnée. */
function emptyBucket(
  emotionId: number,
  emotionName: string,
  isUnassigned: boolean,
): EmotionBucket {
  return {
    emotionId,
    emotionName,
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
function feedBucket(bucket: EmotionBucket, t: Trade): void {
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
}

// ============================================================
// Conversion bucket → EmotionStats
// ============================================================

function bucketToStats(b: EmotionBucket): EmotionStats {
  const currency = dominantCurrency(b.currencies);
  const { totalTrades, winningTrades, losingTrades, breakevenTrades } = b;

  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const avgPnl = totalTrades > 0 ? b.sumPnl / totalTrades : 0;
  const avgWin = winningTrades > 0 ? b.sumWins / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? b.sumLosses / losingTrades : 0; // ≤ 0

  const totalGains = b.sumWins;
  const totalLosses = Math.abs(b.sumLosses);

  // Profit factor : null si aucune perte ("∞"), 0 si aucun gain
  let profitFactor: number | null;
  if (totalLosses === 0) {
    profitFactor = null;
  } else {
    profitFactor = totalGains > 0 ? totalGains / totalLosses : 0;
  }

  return {
    emotionId: b.emotionId,
    emotionName: b.emotionName,
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
  };
}

// ============================================================
// Construction des méta-stats (EmotionOverviewStats)
// ============================================================

/**
 * Calcule les méta-statistiques sur l'ensemble des émotions.
 * Le groupe "Sans émotion" est exclu des classements mais son
 * nombre de trades est comptabilisé dans unassignedTrades.
 */
function buildOverview(
  rows: EmotionStats[],
  currency: string,
): EmotionOverviewStats {
  let bestEmotion: string | null = null;
  let bestEmotionPnl = -Infinity;
  let worstEmotion: string | null = null;
  let worstEmotionPnl = Infinity;
  let bestWinRateEmotion: string | null = null;
  let bestWinRate = -Infinity;
  let mostUsedEmotion: string | null = null;
  let mostUsedCount = 0;
  let unassignedTrades = 0;
  let realEmotionsCount = 0;

  for (const s of rows) {
    if (s.isUnassigned) {
      // Comptabiliser les trades non affectés sans les classer
      unassignedTrades = s.totalTrades;
      continue;
    }

    realEmotionsCount += 1;

    // Meilleur PnL
    if (s.netPnlTotal > bestEmotionPnl) {
      bestEmotionPnl = s.netPnlTotal;
      bestEmotion = s.emotionName;
    }

    // Pire PnL
    if (s.netPnlTotal < worstEmotionPnl) {
      worstEmotionPnl = s.netPnlTotal;
      worstEmotion = s.emotionName;
    }

    // Plus utilisée
    if (s.totalTrades > mostUsedCount) {
      mostUsedCount = s.totalTrades;
      mostUsedEmotion = s.emotionName;
    }

    // Meilleur win rate (seuil minimum anti-biais)
    if (
      s.totalTrades >= MIN_TRADES_FOR_WINRATE &&
      s.winRate > bestWinRate
    ) {
      bestWinRate = s.winRate;
      bestWinRateEmotion = s.emotionName;
    }
  }

  return {
    totalEmotions: realEmotionsCount,
    unassignedTrades,
    currency,
    bestEmotion,
    bestEmotionPnl: bestEmotion !== null ? bestEmotionPnl : 0,
    worstEmotion,
    worstEmotionPnl: worstEmotion !== null ? worstEmotionPnl : 0,
    bestWinRateEmotion,
    bestWinRate: bestWinRateEmotion !== null ? bestWinRate : 0,
    mostUsedEmotion,
    mostUsedCount,
  };
}

// ============================================================
// Fonction principale exportée
// ============================================================

/**
 * Calcule les statistiques de performance pour chaque émotion.
 *
 * Seuls les trades `status = "closed"` sont inclus.
 *
 * Un trade peut être associé à plusieurs émotions → il contribue
 * à plusieurs groupes simultanément.
 *
 * Les trades sans émotion associée (`trade_emotions` vide pour ce
 * tradeId) sont regroupés dans "Sans émotion" (toujours en dernier).
 *
 * Résultat trié : émotions réelles par PnL décroissant,
 *                 puis le groupe "Sans émotion" en dernier.
 *
 * @param filters - Filtres optionnels (dateRange…)
 */
export async function getEmotionStats(
  filters?: TradeFilters,
): Promise<EmotionResult> {
  logger.debug("Calcul des statistiques par émotion", { filters });

  // Chargement en parallèle : trades fermés + catalogue + liaisons
  const [trades, emotions, mappings] = await Promise.all([
    findTradesForAnalytics({ ...filters, status: "closed" }),
    findEmotions(),
    findAllTradeEmotionMappings(),
  ]);

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — résultat vide");
    return { overview: null, byEmotion: [], isEmpty: true };
  }

  // ── Index : tradeId → Set<emotionId> ─────────────────────
  // Construit en O(m) depuis les liaisons (m = nb de liens)
  const tradeEmotionIndex = new Map<number, Set<number>>();
  for (const { tradeId, emotionId } of mappings) {
    if (!tradeEmotionIndex.has(tradeId)) {
      tradeEmotionIndex.set(tradeId, new Set());
    }
    tradeEmotionIndex.get(tradeId)!.add(emotionId);
  }

  // Dictionnaire id → nom pour la résolution des noms d'émotions
  const emotionNames = new Map(emotions.map((e) => [e.id, e.name]));

  // ── Groupement en un seul passage O(n × k) ───────────────
  // n = nb trades fermés, k = nb d'émotions par trade (généralement 1–3)
  // Clé : emotionId (number) — 0 pour les trades non affectés.
  const bucketMap = new Map<number, EmotionBucket>();

  for (const t of trades) {
    const emotionIds = tradeEmotionIndex.get(t.id);

    if (!emotionIds || emotionIds.size === 0) {
      // Aucune émotion → groupe "Sans émotion"
      if (!bucketMap.has(UNASSIGNED_EMOTION_ID)) {
        bucketMap.set(
          UNASSIGNED_EMOTION_ID,
          emptyBucket(UNASSIGNED_EMOTION_ID, UNASSIGNED_EMOTION_NAME, true),
        );
      }
      feedBucket(bucketMap.get(UNASSIGNED_EMOTION_ID)!, t);
    } else {
      // Le trade contribue à chaque émotion associée
      for (const emotionId of emotionIds) {
        if (!bucketMap.has(emotionId)) {
          const name = emotionNames.get(emotionId) ?? `Émotion #${emotionId}`;
          bucketMap.set(emotionId, emptyBucket(emotionId, name, false));
        }
        feedBucket(bucketMap.get(emotionId)!, t);
      }
    }
  }

  // ── Conversion en stats ───────────────────────────────────
  const allStats = Array.from(bucketMap.values()).map(bucketToStats);

  // ── Séparation réelles / "Sans émotion" ──────────────────
  const realStats = allStats.filter((s) => !s.isUnassigned);
  const unassigned = allStats.find((s) => s.isUnassigned);

  // ── Tri des émotions réelles par PnL décroissant ─────────
  realStats.sort((a, b) => b.netPnlTotal - a.netPnlTotal);

  // "Sans émotion" toujours en dernière position
  const byEmotion: EmotionStats[] = unassigned
    ? [...realStats, unassigned]
    : realStats;

  // ── Devise globale ────────────────────────────────────────
  // On reprend la devise de la 1ère émotion réelle (ou "Sans émotion")
  const globalCurrency = byEmotion[0]?.currency ?? "USD";

  // ── Overview ─────────────────────────────────────────────
  const overview = buildOverview(byEmotion, globalCurrency);

  logger.debug(`Statistiques calculées pour ${byEmotion.length} groupe(s) d'émotions`);

  return { overview, byEmotion, isEmpty: false };
}
