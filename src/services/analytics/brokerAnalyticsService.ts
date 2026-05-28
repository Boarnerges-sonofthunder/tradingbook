// ============================================================
// Service — Analytics par Broker
// ============================================================

import { findTradesForAnalytics, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  BrokerOverviewStats,
  BrokerResult,
  BrokerStats,
} from "../../types/analytics";

const logger = createLogger("analytics.broker");
const MIN_TRADES_FOR_WINRATE = 5;

interface BrokerBucket {
  brokerName: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  sumPnl: number;
  sumWins: number;
  sumLosses: number;
  currencies: Map<string, number>;
}

function normalizeBrokerName(raw: string | null): string {
  if (!raw || raw.trim() === "") return "Broker inconnu";
  return raw.trim();
}

function netPnlOf(trade: Trade): number {
  return trade.netPnl ?? (trade.grossPnl ?? 0) - trade.commission - trade.swap - trade.fees;
}

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

function emptyBucket(brokerName: string): BrokerBucket {
  return {
    brokerName,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    sumPnl: 0,
    sumWins: 0,
    sumLosses: 0,
    currencies: new Map(),
  };
}

function feedBucket(bucket: BrokerBucket, trade: Trade): void {
  const pnl = netPnlOf(trade);

  bucket.totalTrades += 1;
  bucket.sumPnl += pnl;
  bucket.currencies.set(
    trade.currency,
    (bucket.currencies.get(trade.currency) ?? 0) + 1,
  );

  if (pnl > 0) {
    bucket.winningTrades += 1;
    bucket.sumWins += pnl;
  } else if (pnl < 0) {
    bucket.losingTrades += 1;
    bucket.sumLosses += pnl;
  } else {
    bucket.breakevenTrades += 1;
  }
}

function bucketToStats(bucket: BrokerBucket): BrokerStats {
  const totalLosses = Math.abs(bucket.sumLosses);
  const avgPnl = bucket.totalTrades > 0 ? bucket.sumPnl / bucket.totalTrades : 0;
  const avgWin = bucket.winningTrades > 0 ? bucket.sumWins / bucket.winningTrades : 0;
  const avgLoss = bucket.losingTrades > 0 ? bucket.sumLosses / bucket.losingTrades : 0;
  const winRate = bucket.totalTrades > 0 ? (bucket.winningTrades / bucket.totalTrades) * 100 : 0;

  return {
    brokerName: bucket.brokerName,
    totalTrades: bucket.totalTrades,
    winningTrades: bucket.winningTrades,
    losingTrades: bucket.losingTrades,
    breakevenTrades: bucket.breakevenTrades,
    netPnlTotal: bucket.sumPnl,
    avgPnl,
    winRate,
    avgWin,
    avgLoss,
    totalGains: bucket.sumWins,
    totalLosses,
    profitFactor: totalLosses === 0 ? null : bucket.sumWins > 0 ? bucket.sumWins / totalLosses : 0,
    currency: dominantCurrency(bucket.currencies),
  };
}

function buildOverview(rows: BrokerStats[], currency: string): BrokerOverviewStats {
  let bestBroker: string | null = null;
  let bestBrokerPnl = -Infinity;
  let worstBroker: string | null = null;
  let worstBrokerPnl = Infinity;
  let mostTradedBroker: string | null = null;
  let mostTradedCount = 0;
  let bestWinRateBroker: string | null = null;
  let bestWinRate = -Infinity;

  for (const row of rows) {
    if (row.netPnlTotal > bestBrokerPnl) {
      bestBroker = row.brokerName;
      bestBrokerPnl = row.netPnlTotal;
    }
    if (row.netPnlTotal < worstBrokerPnl) {
      worstBroker = row.brokerName;
      worstBrokerPnl = row.netPnlTotal;
    }
    if (row.totalTrades > mostTradedCount) {
      mostTradedBroker = row.brokerName;
      mostTradedCount = row.totalTrades;
    }
    if (row.totalTrades >= MIN_TRADES_FOR_WINRATE && row.winRate > bestWinRate) {
      bestWinRateBroker = row.brokerName;
      bestWinRate = row.winRate;
    }
  }

  return {
    totalBrokers: rows.length,
    currency,
    bestBroker,
    bestBrokerPnl,
    worstBroker,
    worstBrokerPnl,
    mostTradedBroker,
    mostTradedCount,
    bestWinRateBroker,
    bestWinRate,
  };
}

export async function getBrokerStats(
  filters: Omit<TradeFilters, "status"> = {},
): Promise<BrokerResult> {
  logger.debug("Calcul analytics par broker", filters);
  const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

  if (trades.length === 0) {
    return {
      overview: null,
      byBroker: [],
      isEmpty: true,
    };
  }

  const buckets = new Map<string, BrokerBucket>();
  const currencyFreq = new Map<string, number>();

  for (const trade of trades) {
    const brokerName = normalizeBrokerName(trade.broker);
    const bucket = buckets.get(brokerName) ?? emptyBucket(brokerName);
    feedBucket(bucket, trade);
    buckets.set(brokerName, bucket);
    currencyFreq.set(trade.currency, (currencyFreq.get(trade.currency) ?? 0) + 1);
  }

  const byBroker = Array.from(buckets.values())
    .map(bucketToStats)
    .sort((a, b) => b.netPnlTotal - a.netPnlTotal || b.totalTrades - a.totalTrades);

  return {
    overview: buildOverview(byBroker, dominantCurrency(currencyFreq)),
    byBroker,
    isEmpty: false,
  };
}
