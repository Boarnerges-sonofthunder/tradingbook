// ============================================================
// Service - Analytics Performance Chart
// ============================================================
// Phase 8 - Etape 4 : graphique de performance generale.
//
// Prepare les donnees temporelles pour afficher :
//   - le PnL net par periode
//   - le PnL cumulatif
//   - le nombre de trades
//   - le win rate
//
// Regle :
//   - SQLite reste la source de verite via findTrades()
//   - seuls les trades fermes sont inclus
//   - aucun calcul n'est refait dans le composant graphique
// ============================================================

import { findTradesForAnalytics, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  PerformanceChartBreakdown,
  PerformanceChartPoint,
  PerformanceChartResult,
  PerformanceChartStats,
} from "../../types/analytics";

const logger = createLogger("analytics.performance-chart");

function dominantCurrency(trades: Trade[]): string {
  const freq: Record<string, number> = {};

  for (const trade of trades) {
    freq[trade.currency] = (freq[trade.currency] ?? 0) + 1;
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

function netPnlOf(trade: Trade): number {
  return trade.netPnl ?? (trade.grossPnl ?? 0) - trade.commission - trade.swap - trade.fees;
}

function toISOWeek(dateStr: string): string {
  const date = new Date(
    Date.UTC(
      Number(dateStr.substring(0, 4)),
      Number(dateStr.substring(5, 7)) - 1,
      Number(dateStr.substring(8, 10)),
      12,
    ),
  );

  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function sortTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => {
    const byClose = (a.closedAt ?? "").localeCompare(b.closedAt ?? "");
    if (byClose !== 0) return byClose;

    const byOpen = a.openedAt.localeCompare(b.openedAt);
    if (byOpen !== 0) return byOpen;

    return a.id - b.id;
  });
}

function buildPeriodPoints(
  trades: Trade[],
  keyFn: (trade: Trade) => string,
): PerformanceChartPoint[] {
  const buckets = new Map<
    string,
    Omit<PerformanceChartPoint, "cumulativePnl" | "winRate">
  >();

  for (const trade of trades) {
    const period = keyFn(trade);
    const netPnl = netPnlOf(trade);
    const bucket = buckets.get(period);

    if (bucket) {
      bucket.netPnl += netPnl;
      bucket.tradeCount += 1;
      if (netPnl > 0) bucket.winningTrades += 1;
      else if (netPnl < 0) bucket.losingTrades += 1;
      else bucket.breakevenTrades += 1;
      continue;
    }

    buckets.set(period, {
      period,
      netPnl,
      tradeCount: 1,
      winningTrades: netPnl > 0 ? 1 : 0,
      losingTrades: netPnl < 0 ? 1 : 0,
      breakevenTrades: netPnl === 0 ? 1 : 0,
    });
  }

  let cumulativePnl = 0;

  return Array.from(buckets.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((bucket) => {
      cumulativePnl += bucket.netPnl;
      return {
        ...bucket,
        cumulativePnl,
        winRate:
          bucket.tradeCount > 0
            ? (bucket.winningTrades / bucket.tradeCount) * 100
            : 0,
      };
    });
}

function buildBreakdown(trades: Trade[]): PerformanceChartBreakdown {
  return {
    byDay: buildPeriodPoints(trades, (trade) =>
      (trade.closedAt ?? trade.createdAt).substring(0, 10),
    ),
    byWeek: buildPeriodPoints(trades, (trade) =>
      toISOWeek((trade.closedAt ?? trade.createdAt).substring(0, 10)),
    ),
    byMonth: buildPeriodPoints(trades, (trade) =>
      (trade.closedAt ?? trade.createdAt).substring(0, 7),
    ),
  };
}

function computeStats(
  breakdown: PerformanceChartBreakdown,
  currency: string,
): PerformanceChartStats {
  const source =
    breakdown.byMonth.length > 0
      ? breakdown.byMonth
      : breakdown.byWeek.length > 0
        ? breakdown.byWeek
        : breakdown.byDay;

  const totalTrades = breakdown.byDay.reduce(
    (sum, point) => sum + point.tradeCount,
    0,
  );
  const netPnlTotal =
    source.length > 0 ? source[source.length - 1].cumulativePnl : 0;

  let bestPeriodNetPnl = source.length > 0 ? source[0].netPnl : 0;
  let worstPeriodNetPnl = source.length > 0 ? source[0].netPnl : 0;

  for (const point of source) {
    if (point.netPnl > bestPeriodNetPnl) bestPeriodNetPnl = point.netPnl;
    if (point.netPnl < worstPeriodNetPnl) worstPeriodNetPnl = point.netPnl;
  }

  return {
    totalTrades,
    currency,
    netPnlTotal,
    bestPeriodNetPnl,
    worstPeriodNetPnl,
  };
}

export async function getPerformanceChartStats(
  filters?: Omit<TradeFilters, "status">,
): Promise<PerformanceChartResult> {
  logger.debug("Calcul du graphique de performance", { filters });

  const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

  if (trades.length === 0) {
    logger.debug("Aucun trade ferme - graphique de performance vide");
    return {
      stats: null,
      breakdown: null,
      isEmpty: true,
    };
  }

  const sorted = sortTrades(trades);
  const currency = dominantCurrency(sorted);
  const breakdown = buildBreakdown(sorted);
  const stats = computeStats(breakdown, currency);

  logger.debug("Graphique de performance calcule", {
    totalTrades: stats.totalTrades,
    dayPoints: breakdown.byDay.length,
    weekPoints: breakdown.byWeek.length,
    monthPoints: breakdown.byMonth.length,
  });

  return {
    stats,
    breakdown,
    isEmpty: false,
  };
}
