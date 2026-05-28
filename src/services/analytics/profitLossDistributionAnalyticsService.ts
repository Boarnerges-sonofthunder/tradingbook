// ============================================================
// Service - Analytics Profit / Loss Distribution
// ============================================================
// Phase 8 - Etape 6 : distribution des gains et pertes.
//
// Objectif :
//   - lire uniquement les trades fermes depuis SQLite via repository
//   - regrouper les net_pnl en tranches lisibles
//   - renvoyer des donnees deja preparees pour l'histogramme
// ============================================================

import { findTradesForAnalytics, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  ProfitLossDistributionBucket,
  ProfitLossDistributionResult,
  ProfitLossDistributionStats,
} from "../../types/analytics";

const logger = createLogger("analytics.profit-loss-distribution");

function dominantCurrency(trades: Trade[]): string {
  const freq: Record<string, number> = {};

  for (const trade of trades) {
    freq[trade.currency] = (freq[trade.currency] ?? 0) + 1;
  }

  let best = "USD";
  let max = 0;

  for (const [currency, count] of Object.entries(freq)) {
    if (count > max) {
      best = currency;
      max = count;
    }
  }

  return best;
}

function netPnlOf(trade: Trade): number {
  return trade.netPnl ?? (trade.grossPnl ?? 0) - trade.commission - trade.swap - trade.fees;
}

// Arrondit le pas de tranche vers une valeur "humaine" : 1 / 2 / 5 / 10 * 10^n.
function createNiceBucketSize(maxAbsPnl: number): number {
  if (maxAbsPnl <= 0) return 1;

  const rawStep = Math.max(maxAbsPnl / 4, 0.01);
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function formatSignedValue(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildEmptyBuckets(bucketSize: number): ProfitLossDistributionBucket[] {
  const s1 = bucketSize;
  const s2 = bucketSize * 2;
  const s3 = bucketSize * 3;

  return [
    {
      bucketId: "loss_4",
      kind: "loss",
      shortLabel: `<= ${formatSignedValue(-s3)}`,
      label: `Inferieur ou egal a ${formatSignedValue(-s3)}`,
      tradeCount: 0,
      avgPnl: null,
      netPnlTotal: 0,
    },
    {
      bucketId: "loss_3",
      kind: "loss",
      shortLabel: `${formatSignedValue(-s3)} a ${formatSignedValue(-s2)}`,
      label: `Entre ${formatSignedValue(-s3)} et ${formatSignedValue(-s2)}`,
      tradeCount: 0,
      avgPnl: null,
      netPnlTotal: 0,
    },
    {
      bucketId: "loss_2",
      kind: "loss",
      shortLabel: `${formatSignedValue(-s2)} a ${formatSignedValue(-s1)}`,
      label: `Entre ${formatSignedValue(-s2)} et ${formatSignedValue(-s1)}`,
      tradeCount: 0,
      avgPnl: null,
      netPnlTotal: 0,
    },
    {
      bucketId: "loss_1",
      kind: "loss",
      shortLabel: `${formatSignedValue(-s1)} a 0`,
      label: `Entre ${formatSignedValue(-s1)} et 0`,
      tradeCount: 0,
      avgPnl: null,
      netPnlTotal: 0,
    },
    {
      bucketId: "breakeven",
      kind: "breakeven",
      shortLabel: "0",
      label: "Breakeven",
      tradeCount: 0,
      avgPnl: null,
      netPnlTotal: 0,
    },
    {
      bucketId: "gain_1",
      kind: "gain",
      shortLabel: `0 a ${formatSignedValue(s1)}`,
      label: `Entre 0 et ${formatSignedValue(s1)}`,
      tradeCount: 0,
      avgPnl: null,
      netPnlTotal: 0,
    },
    {
      bucketId: "gain_2",
      kind: "gain",
      shortLabel: `${formatSignedValue(s1)} a ${formatSignedValue(s2)}`,
      label: `Entre ${formatSignedValue(s1)} et ${formatSignedValue(s2)}`,
      tradeCount: 0,
      avgPnl: null,
      netPnlTotal: 0,
    },
    {
      bucketId: "gain_3",
      kind: "gain",
      shortLabel: `${formatSignedValue(s2)} a ${formatSignedValue(s3)}`,
      label: `Entre ${formatSignedValue(s2)} et ${formatSignedValue(s3)}`,
      tradeCount: 0,
      avgPnl: null,
      netPnlTotal: 0,
    },
    {
      bucketId: "gain_4",
      kind: "gain",
      shortLabel: `>= ${formatSignedValue(s3)}`,
      label: `Superieur ou egal a ${formatSignedValue(s3)}`,
      tradeCount: 0,
      avgPnl: null,
      netPnlTotal: 0,
    },
  ];
}

function bucketIdFor(pnl: number, bucketSize: number): string {
  if (pnl === 0) return "breakeven";

  const band = Math.min(4, Math.max(1, Math.ceil(Math.abs(pnl) / bucketSize)));

  return pnl < 0 ? `loss_${band}` : `gain_${band}`;
}

function buildBuckets(netPnls: number[], bucketSize: number): ProfitLossDistributionBucket[] {
  const buckets = buildEmptyBuckets(bucketSize);
  const byId = new Map(buckets.map((bucket) => [bucket.bucketId, bucket]));

  for (const pnl of netPnls) {
    const bucket = byId.get(bucketIdFor(pnl, bucketSize));
    if (!bucket) continue;

    bucket.tradeCount += 1;
    bucket.netPnlTotal += pnl;
    bucket.avgPnl = bucket.netPnlTotal / bucket.tradeCount;
  }

  return buckets;
}

function computeStats(
  trades: Trade[],
  netPnls: number[],
  bucketSize: number,
  currency: string,
): ProfitLossDistributionStats {
  let winningTrades = 0;
  let losingTrades = 0;
  let breakevenTrades = 0;
  let largestGain = 0;
  let largestLoss = 0;

  for (const pnl of netPnls) {
    if (pnl > 0) {
      winningTrades += 1;
      if (pnl > largestGain) largestGain = pnl;
      continue;
    }

    if (pnl < 0) {
      losingTrades += 1;
      if (pnl < largestLoss) largestLoss = pnl;
      continue;
    }

    breakevenTrades += 1;
  }

  return {
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    breakevenTrades,
    currency,
    bucketSize,
    largestGain,
    largestLoss,
  };
}

export async function getProfitLossDistributionStats(
  filters?: Omit<TradeFilters, "status">,
): Promise<ProfitLossDistributionResult> {
  logger.debug("Calcul de la distribution gains/pertes", { filters });

  const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

  if (trades.length === 0) {
    logger.debug("Aucun trade ferme - distribution vide");
    return {
      stats: null,
      buckets: [],
      isEmpty: true,
    };
  }

  const currency = dominantCurrency(trades);
  const netPnls = trades.map(netPnlOf);
  const maxAbsPnl = netPnls.reduce(
    (max, pnl) => Math.max(max, Math.abs(pnl)),
    0,
  );
  const bucketSize = createNiceBucketSize(maxAbsPnl);
  const buckets = buildBuckets(netPnls, bucketSize);
  const stats = computeStats(trades, netPnls, bucketSize, currency);

  logger.debug("Distribution gains/pertes calculee", {
    totalTrades: stats.totalTrades,
    bucketSize: stats.bucketSize,
    buckets: buckets.length,
  });

  return {
    stats,
    buckets,
    isEmpty: false,
  };
}
