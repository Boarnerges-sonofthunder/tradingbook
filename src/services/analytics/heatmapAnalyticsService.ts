// ============================================================
// Service — Analytics Heatmaps
// ============================================================
// Phase 7 — Étape 12 : Heatmaps de performance temporelle.
//
// Calcule les données de heatmap à partir des trades fermés :
//   byWeekday — performance par jour d'ouverture (lundi–dimanche)
//   byHour    — performance par heure d'ouverture (0–23h UTC)
//   byMonth   — performance par mois de clôture (jan–déc, toutes années confondues)
//   byDate    — performance par date de clôture (calendrier quotidien)
//
// SOURCES DE DATES :
//   byWeekday, byHour : openedAt  (décision d'entrée = timing de la prise de position)
//   byMonth,  byDate  : closedAt ?? createdAt (résultat attribué à la date de clôture)
//
// Architecture :
//   AnalyticsPage (React)
//     └── getHeatmapStats()          ← ici
//           └── findTrades(closed)   ← tradesRepository
//                 └── SQLite (table `trades`)
//
// Règle : aucun appel SQLite direct dans ce fichier.
//         Tout passe par les repositories.
// ============================================================

import { findTradesForAnalytics, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type { HeatmapCell, HeatmapResult } from "../../types/analytics";

const logger = createLogger("analytics.heatmap");

// ============================================================
// Labels d'affichage
// ============================================================

/** Noms abrégés des jours de la semaine, index 0 = Lundi (convention FR). */
const WEEKDAY_LABELS: string[] = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Noms abrégés des mois, index 0 = Janvier. */
const MONTH_LABELS: string[] = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

// ============================================================
// Types internes
// ============================================================

/** Accumulateur de statistiques pour un bucket temporel. */
interface BucketAccumulator {
  netPnl: number;
  trades: number;
  winningTrades: number;
  losingTrades: number;
}

// ============================================================
// Helpers — fonctions pures
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
    if (count > max) {
      max = count;
      best = currency;
    }
  }
  return best;
}

/**
 * Calcule le net_pnl d'un trade :
 *   - utilise `netPnl` stocké en priorité
 *   - calcule depuis grossPnl − commission − swap − fees si absent
 */
function getNetPnl(t: Trade): number {
  return t.netPnl ?? (t.grossPnl ?? 0) - t.commission - t.swap - t.fees;
}

/** Crée un accumulateur vide. */
function emptyAcc(): BucketAccumulator {
  return { netPnl: 0, trades: 0, winningTrades: 0, losingTrades: 0 };
}

/**
 * Accumule un trade dans un bucket.
 * Mute l'accumulateur passé en paramètre.
 */
function accumulate(acc: BucketAccumulator, netPnl: number): void {
  acc.netPnl += netPnl;
  acc.trades += 1;
  if (netPnl > 0) acc.winningTrades += 1;
  else if (netPnl < 0) acc.losingTrades += 1;
}

/**
 * Convertit un accumulateur en HeatmapCell typée.
 *
 * @param key      - Identifiant unique du slot (ex. "0" pour Lundi, "14" pour 14h)
 * @param label    - Label d'affichage (ex. "Lun", "14h", "Jan")
 * @param acc      - Accumulateur du slot
 * @param currency - Devise globale de la session analytics
 */
function toCell(
  key: string,
  label: string,
  acc: BucketAccumulator,
  currency: string,
): HeatmapCell {
  const { netPnl, trades, winningTrades, losingTrades } = acc;
  return {
    key,
    label,
    netPnl,
    trades,
    winningTrades,
    losingTrades,
    winRate: trades > 0 ? (winningTrades / trades) * 100 : 0,
    avgPnl: trades > 0 ? netPnl / trades : 0,
    currency,
  };
}

// ============================================================
// Calcul des heatmaps — cœur de la logique
// ============================================================

/**
 * Calcule les quatre heatmaps à partir d'un tableau de trades fermés.
 * Fonction pure — aucun accès SQLite.
 *
 * @param trades   - Tableau de trades fermés (status = "closed")
 * @param currency - Devise majoritaire (calculée en amont)
 */
function computeHeatmaps(
  trades: Trade[],
  currency: string,
): Omit<HeatmapResult, "isEmpty"> {

  // ── Accumulateurs ────────────────────────────────────────
  // Weekday : 7 buckets, index 0 = Lundi, 6 = Dimanche
  const weekdayBuckets: BucketAccumulator[] = Array.from({ length: 7 }, emptyAcc);

  // Hour : 24 buckets, index 0 = 0h, 23 = 23h UTC
  const hourBuckets: BucketAccumulator[] = Array.from({ length: 24 }, emptyAcc);

  // Month : 12 buckets, index 0 = Janvier, 11 = Décembre
  const monthBuckets: BucketAccumulator[] = Array.from({ length: 12 }, emptyAcc);

  // Date : map "YYYY-MM-DD" → accumulator (taille variable)
  const dateBuckets = new Map<string, BucketAccumulator>();

  // ── Iteration sur les trades ─────────────────────────────
  for (const trade of trades) {
    const netPnl = getNetPnl(trade);

    // ── Jour de la semaine (depuis openedAt) ──────────────
    // getUTCDay() : 0 = Dimanche, 1 = Lundi, …, 6 = Samedi
    // Convention FR : 0 = Lundi, …, 6 = Dimanche
    // Remapping : (jsDay + 6) % 7
    const openedDate = new Date(trade.openedAt);
    const weekdayIndex = (openedDate.getUTCDay() + 6) % 7;
    accumulate(weekdayBuckets[weekdayIndex], netPnl);

    // ── Heure UTC (depuis openedAt) ───────────────────────
    const hourIndex = openedDate.getUTCHours();
    accumulate(hourBuckets[hourIndex], netPnl);

    // ── Mois calendaire (depuis closedAt ou createdAt) ────
    // substring(5, 7) extrait "MM" de "YYYY-MM-DD..." → index 0-based
    const closedDateStr = trade.closedAt ?? trade.createdAt;
    const monthIndex = Number(closedDateStr.substring(5, 7)) - 1;
    accumulate(monthBuckets[monthIndex], netPnl);

    // ── Date de clôture (depuis closedAt ou createdAt) ────
    const dateKey = closedDateStr.substring(0, 10); // "YYYY-MM-DD"
    if (!dateBuckets.has(dateKey)) {
      dateBuckets.set(dateKey, emptyAcc());
    }
    accumulate(dateBuckets.get(dateKey)!, netPnl);
  }

  // ── Conversion en cellules HeatmapCell ───────────────────
  const byWeekday = weekdayBuckets.map((acc, i) =>
    toCell(String(i), WEEKDAY_LABELS[i], acc, currency),
  );

  const byHour = hourBuckets.map((acc, i) =>
    toCell(String(i), `${String(i).padStart(2, "0")}h`, acc, currency),
  );

  const byMonth = monthBuckets.map((acc, i) =>
    toCell(String(i + 1), MONTH_LABELS[i], acc, currency),
  );

  // Tri chronologique par clé "YYYY-MM-DD" (ordre lexicographique = chronologique)
  const byDate = Array.from(dateBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, acc]) => {
      // Label = "DD Mmm YYYY" pour un affichage lisible
      const day = dateKey.substring(8, 10);
      const monthIdx = Number(dateKey.substring(5, 7)) - 1;
      const year = dateKey.substring(0, 4);
      const label = `${day} ${MONTH_LABELS[monthIdx]} ${year}`;
      return toCell(dateKey, label, acc, currency);
    });

  return { currency, byWeekday, byHour, byMonth, byDate };
}

// ============================================================
// Point d'entrée public
// ============================================================

/**
 * Calcule toutes les heatmaps de performance à partir des trades fermés.
 *
 * Seuls les trades dont status = "closed" sont inclus.
 * Les positions ouvertes ont un P&L non réalisé qui ne doit pas
 * fausser les statistiques historiques.
 *
 * @param filters - Filtres optionnels (symbole, plage de dates, stratégie…)
 * @returns HeatmapResult avec byWeekday (7), byHour (24), byMonth (12), byDate (variable)
 */
export async function getHeatmapStats(
  filters?: TradeFilters,
): Promise<HeatmapResult> {
  logger.info("Calcul des heatmaps de performance...");

  try {
    const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

    // ── Cas vide : aucun trade fermé ─────────────────────
    if (trades.length === 0) {
      const currency = "USD";
      return {
        currency,
        byWeekday: WEEKDAY_LABELS.map((label, i) =>
          toCell(String(i), label, emptyAcc(), currency),
        ),
        byHour: Array.from({ length: 24 }, (_, i) =>
          toCell(String(i), `${String(i).padStart(2, "0")}h`, emptyAcc(), currency),
        ),
        byMonth: MONTH_LABELS.map((label, i) =>
          toCell(String(i + 1), label, emptyAcc(), currency),
        ),
        byDate: [],
        isEmpty: true,
      };
    }

    const currency = dominantCurrency(trades);
    const heatmaps = computeHeatmaps(trades, currency);

    logger.info(
      `Heatmaps calculées : ${trades.length} trades, ` +
      `${heatmaps.byDate.length} dates distinctes.`,
    );

    return { ...heatmaps, isEmpty: false };

  } catch (error) {
    logger.error("Erreur lors du calcul des heatmaps :", error);
    throw error;
  }
}
