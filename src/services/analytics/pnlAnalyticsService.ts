// ============================================================
// Service — Analytics PnL
// ============================================================
// Phase 7 — Étape 2 : Analyse détaillée du Profit and Loss.
//
// Calcule toutes les statistiques PnL à partir des trades fermés
// stockés dans SQLite. Seuls les trades dont status = "closed"
// sont inclus — les positions ouvertes ont un P&L non réalisé
// qui ne doit pas fausser les statistiques historiques.
//
// Architecture :
//   AnalyticsPage (React)
//     └── getPnLStats()             ← ici
//           └── findTrades(closed)  ← tradesRepository
//                 └── SQLite (table `trades`)
//
// Règle : aucun appel SQLite direct dans ce fichier.
//         Tout passe par les repositories.
// ============================================================

import { findTradesForAnalytics, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  PnLStats,
  PnLPeriodEntry,
  PnLBreakdown,
  PnLResult,
} from "../../types/analytics";

const logger = createLogger("analytics.pnl");

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
    if (count > max) {
      max = count;
      best = currency;
    }
  }
  return best;
}

/**
 * Calcule le numéro de semaine ISO 8601 à partir d'une date ISO.
 * Algorithme standard : la semaine contenant le premier jeudi de l'année
 * est la semaine 1.
 *
 * Ex : "2024-01-15" → "2024-W03"
 */
function toISOWeek(dateStr: string): string {
  // Midi UTC évite les problèmes de fuseau lors de la conversion
  const d = new Date(
    Date.UTC(
      Number(dateStr.substring(0, 4)),
      Number(dateStr.substring(5, 7)) - 1,
      Number(dateStr.substring(8, 10)),
      12,
    ),
  );
  // Jeudi le plus proche (règle ISO)
  const dayNum = d.getUTCDay() || 7; // Lundi = 1, Dimanche = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Agrège un tableau de trades par période en calculant la somme des net_pnl
 * et le nombre de trades pour chaque groupe.
 *
 * @param trades  - Trades triés chronologiquement
 * @param keyFn   - Fonction retournant la clé de période (jour, semaine, mois)
 * @returns Entrées triées chronologiquement sur la clé de période
 */
function aggregateByPeriod(
  trades: Trade[],
  keyFn: (t: Trade) => string,
): PnLPeriodEntry[] {
  const map = new Map<string, { netPnl: number; tradeCount: number }>();

  for (const t of trades) {
    // Calcul du net_pnl : utilise le champ stocké en priorité,
    // puis le calcule depuis gross_pnl − frais si absent.
    const netPnl =
      t.netPnl ?? (t.grossPnl ?? 0) - t.commission - t.swap - t.fees;
    const key = keyFn(t);
    const existing = map.get(key);
    if (existing) {
      existing.netPnl += netPnl;
      existing.tradeCount += 1;
    } else {
      map.set(key, { netPnl, tradeCount: 1 });
    }
  }

  // Tri lexicographique = tri chronologique (les clés sont en format ISO)
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => ({ period, ...data }));
}

/**
 * Calcule toutes les statistiques PnL à partir d'un tableau de trades fermés.
 * Fonction pure — sans accès SQLite.
 *
 * Formules :
 *   net_pnl       = net_pnl stocké OU (gross_pnl − commission − swap − fees)
 *   totalNetPnl   = Σ net_pnl
 *   totalGrossPnl = Σ gross_pnl
 *   averagePnl    = totalNetPnl / totalTrades
 *   bestTrade     = max(net_pnl)
 *   worstTrade    = min(net_pnl)
 */
function computePnLStats(trades: Trade[]): PnLStats {
  const currency = dominantCurrency(trades);

  let totalNetPnl = 0;
  let totalGrossPnl = 0;
  let totalCommissions = 0;
  let totalSwap = 0;
  let totalFees = 0;
  let totalPositivePnl = 0;
  let totalNegativePnl = 0;
  let bestTrade = -Infinity;
  let worstTrade = Infinity;

  for (const t of trades) {
    // Priorité au champ net_pnl déjà calculé par la source de données (MT5/CSV).
    // Fallback : calcul depuis gross_pnl − frais pour les trades saisis manuellement.
    const netPnl =
      t.netPnl ?? (t.grossPnl ?? 0) - t.commission - t.swap - t.fees;

    totalNetPnl += netPnl;
    totalGrossPnl += t.grossPnl ?? 0;
    // commission et fees sont des coûts (stockés positifs, soustraits du brut)
    totalCommissions += t.commission;
    totalSwap += t.swap;
    totalFees += t.fees;

    if (netPnl > 0) totalPositivePnl += netPnl;
    if (netPnl < 0) totalNegativePnl += netPnl;
    if (netPnl > bestTrade) bestTrade = netPnl;
    if (netPnl < worstTrade) worstTrade = netPnl;
  }

  return {
    totalNetPnl,
    totalGrossPnl,
    totalCommissions,
    totalSwap,
    totalFees,
    averagePnl: totalNetPnl / trades.length,
    // Protection contre un résultat Infinity si le tableau n'est pas vide
    bestTrade: isFinite(bestTrade) ? bestTrade : 0,
    worstTrade: isFinite(worstTrade) ? worstTrade : 0,
    totalPositivePnl,
    totalNegativePnl,
    totalTrades: trades.length,
    currency,
  };
}

/**
 * Calcule la décomposition du PnL par jour, semaine et mois.
 * Les trades sont triés chronologiquement avant l'agrégation.
 */
function computeBreakdown(trades: Trade[]): PnLBreakdown {
  // Tri par date de clôture (ou de création en tiebreaker pour les trades sans closedAt)
  const sorted = [...trades].sort((a, b) => {
    const dateA = a.closedAt ?? a.createdAt;
    const dateB = b.closedAt ?? b.createdAt;
    return dateA.localeCompare(dateB);
  });

  // Jour : "2024-01-15"
  const byDay = aggregateByPeriod(sorted, (t) =>
    (t.closedAt ?? t.createdAt).substring(0, 10),
  );

  // Semaine ISO : "2024-W03"
  const byWeek = aggregateByPeriod(sorted, (t) =>
    toISOWeek((t.closedAt ?? t.createdAt).substring(0, 10)),
  );

  // Mois : "2024-01"
  const byMonth = aggregateByPeriod(sorted, (t) =>
    (t.closedAt ?? t.createdAt).substring(0, 7),
  );

  return { byDay, byWeek, byMonth };
}

// ============================================================
// API publique
// ============================================================

/**
 * Récupère et calcule les statistiques PnL détaillées.
 *
 * Seuls les trades avec `status = "closed"` sont inclus :
 *   - Les trades ouverts ont un P&L non réalisé (flottant) qui varie
 *     en temps réel et ne représente pas une performance historique fiable.
 *   - Les trades annulés n'ont pas eu lieu effectivement.
 *
 * Des filtres additionnels peuvent restreindre la période ou le symbole.
 *
 * @param filters - Filtres additionnels (dateFrom, dateTo, symbol…). Le filtre
 *                  `status` est ignoré : il est forcé à "closed".
 * @returns PnLResult avec `isEmpty: true` si aucun trade fermé ne correspond.
 */
export async function getPnLStats(
  filters: Omit<TradeFilters, "status"> = {},
): Promise<PnLResult> {
  logger.debug("Calcul des statistiques PnL", filters);

  const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — PnL vide");
    return { stats: null, breakdown: null, isEmpty: true };
  }

  const stats = computePnLStats(trades);
  const breakdown = computeBreakdown(trades);

  logger.debug("PnL calculé", {
    totalTrades: stats.totalTrades,
    totalNetPnl: stats.totalNetPnl,
    totalGrossPnl: stats.totalGrossPnl,
    periodesByMonth: breakdown.byMonth.length,
  });

  return { stats, breakdown, isEmpty: false };
}
