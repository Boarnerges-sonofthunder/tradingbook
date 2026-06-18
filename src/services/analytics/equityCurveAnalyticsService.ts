// ============================================================
// Service - Analytics Courbe d'equite
// ============================================================
// Phase 7 - Etape 13 : Courbe d'equite.
//
// Construit l'evolution cumulative du compte a partir des trades fermes :
//   - SQLite reste la source de verite via tradesRepository
//   - les trades ouverts sont ignores
//   - chaque point ajoute le net_pnl du trade ferme courant
//
// Architecture :
//   AnalyticsPage (React)
//     - getEquityCurveStats()       ici
//         - findTrades(closed)      tradesRepository
//             - SQLite
//
// Regle : aucun appel SQLite direct dans React.
// ============================================================

import {
  findTradesForAnalytics,
  findTradingAccountById,
  type TradeFilters,
} from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  EquityCurvePoint,
  EquityCurveStats,
  EquityDatePoint,
  EquityCurveResult,
} from "../../types/analytics";

const logger = createLogger("analytics.equityCurve");

// ============================================================
// Helpers de calcul - fonctions pures
// ============================================================

/**
 * Determine la devise majoritaire parmi les trades.
 * Retourne "USD" par defaut si la liste est vide.
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
 * Retourne le net_pnl d'un trade.
 * Priorite : valeur stockee `netPnl`, puis fallback gross_pnl - frais.
 */
function netPnlOf(t: Trade): number {
  return t.netPnl ?? (t.grossPnl ?? 0) - t.commission - t.swap - t.fees;
}

/**
 * Trie les trades par date de cloture.
 * Les egalites sont stabilisees par openedAt puis id pour obtenir une courbe
 * deterministe quand plusieurs trades ferment a la meme seconde.
 */
function sortByClosedAt(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => {
    const byClose = (a.closedAt ?? "").localeCompare(b.closedAt ?? "");
    if (byClose !== 0) return byClose;

    const byOpen = a.openedAt.localeCompare(b.openedAt);
    if (byOpen !== 0) return byOpen;

    return a.id - b.id;
  });
}

/**
 * Construit un point par trade ferme.
 *
 * Formule :
 *   equity[i] = equity[i - 1] + net_pnl[i]
 *   peak[i] = max(startEquity, equity[0..i])
 *   drawdown[i] = equity[i] - peak[i]
 */
function buildTradeCurve(
  trades: Trade[],
  startEquity: number,
): EquityCurvePoint[] {
  let equity = startEquity;
  let peak = startEquity;

  return trades.map((trade, idx) => {
    const netPnl = netPnlOf(trade);
    equity += netPnl;
    peak = Math.max(peak, equity);

    const drawdown = equity - peak;
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
    const closedAt = trade.closedAt ?? "";

    return {
      tradeId: trade.id,
      index: idx + 1,
      date: closedAt.substring(0, 10),
      closedAt,
      symbol: trade.symbol,
      netPnl,
      equity,
      peak,
      drawdown,
      drawdownPct,
    };
  });
}

/**
 * Agrege la courbe par date de cloture.
 * L'equity d'une date correspond au niveau final apres le dernier trade du jour.
 */
function buildDateCurve(points: EquityCurvePoint[]): EquityDatePoint[] {
  const byDate = new Map<string, EquityDatePoint>();

  for (const point of points) {
    const existing = byDate.get(point.date);
    if (existing) {
      existing.netPnl += point.netPnl;
      existing.tradeCount += 1;
      existing.equity = point.equity;
    } else {
      byDate.set(point.date, {
        date: point.date,
        netPnl: point.netPnl,
        equity: point.equity,
        tradeCount: 1,
      });
    }
  }

  return Array.from(byDate.values());
}

/**
 * Calcule les statistiques de synthese depuis la courbe par trade.
 */
function computeStats(
  points: EquityCurvePoint[],
  currency: string,
  startEquity: number,
): EquityCurveStats {
  const last = points[points.length - 1];

  let highestPeak = startEquity;
  let highestPeakDate: string | null = null;
  let lowestTrough = startEquity;
  let lowestTroughDate: string | null = null;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  for (const point of points) {
    if (point.equity > highestPeak) {
      highestPeak = point.equity;
      highestPeakDate = point.date;
    }

    if (point.equity < lowestTrough) {
      lowestTrough = point.equity;
      lowestTroughDate = point.date;
    }

    if (point.drawdown < maxDrawdown) {
      maxDrawdown = point.drawdown;
      maxDrawdownPct = point.drawdownPct;
    }
  }

  return {
    totalTrades: points.length,
    currency,
    startEquity,
    finalEquity: last.equity,
    totalVariation: last.equity - startEquity,
    highestPeak,
    highestPeakDate,
    lowestTrough,
    lowestTroughDate,
    maxDrawdown,
    maxDrawdownPct,
    currentDrawdown: last.drawdown,
    currentDrawdownPct: last.drawdownPct,
  };
}

// ============================================================
// Fonction principale exportee
// ============================================================

/**
 * Calcule la courbe d'equite cumulative depuis les trades fermes.
 *
 * Les positions ouvertes sont exclues car leur PnL est non realise et ferait
 * varier artificiellement l'historique du compte.
 */
export async function getEquityCurveStats(
  filters?: TradeFilters,
): Promise<EquityCurveResult> {
  logger.debug("Calcul de la courbe d'equite", { filters });

  const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

  if (trades.length === 0) {
    logger.debug("Aucun trade ferme - courbe d'equite vide");
    return { stats: null, byTrade: [], byDate: [], isEmpty: true };
  }

  const sorted = sortByClosedAt(trades);
  const currency = dominantCurrency(sorted);
  const tradingAccountId =
    typeof filters?.tradingAccountId === "number" ? filters.tradingAccountId : null;
  const account = tradingAccountId
    ? await findTradingAccountById(tradingAccountId)
    : null;
  const startEquity = account?.initialCapital ?? 0;
  const byTrade = buildTradeCurve(sorted, startEquity);
  const byDate = buildDateCurve(byTrade);
  const stats = computeStats(byTrade, currency, startEquity);

  logger.debug("Courbe d'equite calculee", {
    total: stats.totalTrades,
    startEquity: stats.startEquity,
    finalEquity: stats.finalEquity,
    maxDrawdown: stats.maxDrawdown,
  });

  return { stats, byTrade, byDate, isEmpty: false };
}
