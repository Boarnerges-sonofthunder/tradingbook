// ============================================================
// Service - Analytics Calendrier de performance
// ============================================================
// Phase 7 - Etape 14 : calendrier mensuel de performance.
//
// Les trades fermes sont groupes par date de cloture (`closed_at`), puis
// resumes par jour et par mois. React affiche uniquement ces resultats.
//
// Architecture :
//   AnalyticsPage
//     - getPerformanceCalendarStats()
//         - findTrades({ status: "closed" })
//             - SQLite
// ============================================================

import { findTradesForAnalytics, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  PerformanceCalendarDay,
  PerformanceCalendarMonthSummary,
  PerformanceCalendarResult,
  PerformanceCalendarTradeItem,
} from "../../types/analytics";

const logger = createLogger("analytics.performanceCalendar");

interface DayAccumulator {
  date: string;
  month: string;
  netPnl: number;
  trades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  bestTrade: number;
  worstTrade: number;
  tradeItems: PerformanceCalendarTradeItem[];
}

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
  return (
    trade.netPnl ??
    (trade.grossPnl ?? 0) - trade.commission - trade.swap - trade.fees
  );
}

function durationSecondsOf(trade: Trade): number | null {
  if (!trade.closedAt) return null;

  const openedMs = new Date(trade.openedAt).getTime();
  const closedMs = new Date(trade.closedAt).getTime();
  if (!Number.isFinite(openedMs) || !Number.isFinite(closedMs)) return null;

  const seconds = Math.max(0, Math.round((closedMs - openedMs) / 1000));
  return seconds;
}

function toTradeItem(trade: Trade, netPnl: number): PerformanceCalendarTradeItem {
  return {
    id: trade.id,
    externalId: trade.externalId,
    platform: trade.platform,
    symbol: trade.symbol,
    side: trade.side,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt!,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    volume: trade.volume,
    commission: trade.commission,
    swap: trade.swap,
    fees: trade.fees,
    grossPnl: trade.grossPnl,
    netPnl,
    currency: trade.currency,
    riskRewardRatio: trade.riskRewardRatio,
    strategyId: trade.strategyId,
    durationSeconds: durationSecondsOf(trade),
  };
}

function emptyDay(date: string): DayAccumulator {
  return {
    date,
    month: date.substring(0, 7),
    netPnl: 0,
    trades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    bestTrade: Number.NEGATIVE_INFINITY,
    worstTrade: Number.POSITIVE_INFINITY,
    tradeItems: [],
  };
}

function accumulateDay(acc: DayAccumulator, trade: Trade, netPnl: number): void {
  acc.netPnl += netPnl;
  acc.trades += 1;

  if (netPnl > 0) acc.winningTrades += 1;
  else if (netPnl < 0) acc.losingTrades += 1;
  else acc.breakevenTrades += 1;

  acc.bestTrade = Math.max(acc.bestTrade, netPnl);
  acc.worstTrade = Math.min(acc.worstTrade, netPnl);
  acc.tradeItems.push(toTradeItem(trade, netPnl));
}

function toDayStats(
  acc: DayAccumulator,
  currency: string,
): PerformanceCalendarDay {
  return {
    date: acc.date,
    month: acc.month,
    currency,
    netPnl: acc.netPnl,
    trades: acc.trades,
    winningTrades: acc.winningTrades,
    losingTrades: acc.losingTrades,
    breakevenTrades: acc.breakevenTrades,
    winRate: acc.trades > 0 ? (acc.winningTrades / acc.trades) * 100 : 0,
    bestTrade: acc.bestTrade === Number.NEGATIVE_INFINITY ? 0 : acc.bestTrade,
    worstTrade: acc.worstTrade === Number.POSITIVE_INFINITY ? 0 : acc.worstTrade,
    tradeItems: [...acc.tradeItems].sort((a, b) =>
      a.closedAt.localeCompare(b.closedAt),
    ),
  };
}

function buildDays(
  trades: Trade[],
  currency: string,
): PerformanceCalendarDay[] {
  const byDate = new Map<string, DayAccumulator>();

  for (const trade of trades) {
    // Le calendrier de performance est strictement rattache a `closed_at`.
    // Un trade ferme sans date de cloture est ignore plutot que de l'inventer.
    if (!trade.closedAt) continue;

    const date = trade.closedAt.substring(0, 10);
    if (!byDate.has(date)) {
      byDate.set(date, emptyDay(date));
    }

    accumulateDay(byDate.get(date)!, trade, netPnlOf(trade));
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((acc) => toDayStats(acc, currency));
}

function buildMonthSummaries(
  days: PerformanceCalendarDay[],
  currency: string,
): PerformanceCalendarMonthSummary[] {
  const monthMap = new Map<string, PerformanceCalendarDay[]>();

  for (const day of days) {
    const existing = monthMap.get(day.month);
    if (existing) existing.push(day);
    else monthMap.set(day.month, [day]);
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthDays]) => {
      let netPnl = 0;
      let trades = 0;
      let winningTrades = 0;
      let losingTrades = 0;
      let breakevenTrades = 0;
      let winningDays = 0;
      let losingDays = 0;
      let neutralDays = 0;
      let bestDay: string | null = null;
      let worstDay: string | null = null;
      let bestDayPnl = Number.NEGATIVE_INFINITY;
      let worstDayPnl = Number.POSITIVE_INFINITY;
      let bestTrade = Number.NEGATIVE_INFINITY;
      let worstTrade = Number.POSITIVE_INFINITY;

      for (const day of monthDays) {
        netPnl += day.netPnl;
        trades += day.trades;
        winningTrades += day.winningTrades;
        losingTrades += day.losingTrades;
        breakevenTrades += day.breakevenTrades;

        if (day.netPnl > 0) winningDays += 1;
        else if (day.netPnl < 0) losingDays += 1;
        else neutralDays += 1;

        if (day.netPnl > bestDayPnl) {
          bestDayPnl = day.netPnl;
          bestDay = day.date;
        }

        if (day.netPnl < worstDayPnl) {
          worstDayPnl = day.netPnl;
          worstDay = day.date;
        }

        bestTrade = Math.max(bestTrade, day.bestTrade);
        worstTrade = Math.min(worstTrade, day.worstTrade);
      }

      return {
        month,
        currency,
        tradingDays: monthDays.length,
        netPnl,
        trades,
        winningTrades,
        losingTrades,
        breakevenTrades,
        winRate: trades > 0 ? (winningTrades / trades) * 100 : 0,
        winningDays,
        losingDays,
        neutralDays,
        bestDay,
        bestDayPnl: bestDayPnl === Number.NEGATIVE_INFINITY ? 0 : bestDayPnl,
        worstDay,
        worstDayPnl: worstDayPnl === Number.POSITIVE_INFINITY ? 0 : worstDayPnl,
        bestTrade: bestTrade === Number.NEGATIVE_INFINITY ? 0 : bestTrade,
        worstTrade: worstTrade === Number.POSITIVE_INFINITY ? 0 : worstTrade,
      };
    });
}

/**
 * Calcule les statistiques du calendrier de performance.
 *
 * Seuls les trades fermes sont inclus. Les trades ouverts sont exclus car leur
 * PnL n'est pas realise.
 */
export async function getPerformanceCalendarStats(
  filters?: TradeFilters,
): Promise<PerformanceCalendarResult> {
  logger.debug("Calcul du calendrier de performance", { filters });

  const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

  if (trades.length === 0) {
    return { currency: "USD", days: [], months: [], isEmpty: true };
  }

  const currency = dominantCurrency(trades);
  const days = buildDays(trades, currency);
  const months = buildMonthSummaries(days, currency);

  return {
    currency,
    days,
    months,
    isEmpty: days.length === 0,
  };
}
