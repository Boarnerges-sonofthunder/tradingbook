// ============================================================
// Service — Trade Replay (lecture seule)
// ============================================================
// Construit modèle replay à partir des trades SQLite + screenshots.
// Ne lit que données passées. Aucune logique d'exécution d'ordres.
// ============================================================

import { getTrades } from "../trades/tradesService";
import {
  getScreenshotsForTrade,
  type TradeScreenshot,
} from "../screenshots/screenshotsService";
import type {
  GetTradeReplayDatasetOptions,
  ReplayScreenshotItem,
  Trade,
  TradeReplayDataset,
  TradeReplayFrame,
} from "../../types";

const DEFAULT_MAX_REPLAY_TRADES = 200;

function mapScreenshotToReplayItem(
  screenshot: TradeScreenshot,
): ReplayScreenshotItem {
  return {
    id: screenshot.id,
    filename: screenshot.filename,
    filePath: screenshot.filePath,
    fileName: screenshot.fileName,
    mimeType: screenshot.mimeType,
    fileSize: screenshot.fileSize,
    label: screenshot.label,
    timeframe: screenshot.timeframe,
    createdAt: screenshot.createdAt,
  };
}

function mapTradeToReplayFrame(
  trade: Trade,
  screenshots: TradeScreenshot[],
): TradeReplayFrame {
  return {
    tradeId: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    platform: trade.platform,
    broker: trade.broker,
    accountId: trade.accountId,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    volume: trade.volume,
    grossPnl: trade.grossPnl,
    netPnl: trade.netPnl,
    currency: trade.currency,
    screenshots: screenshots.map(mapScreenshotToReplayItem),
    // Préparation explicite pour phase future d'intégration chart historique.
    hasHistoricalChartData: false,
    chartDataSource: "pending_historical_provider",
  };
}

/**
 * Retourne dataset replay orienté analyse historique.
 *
 * @param options.includeOpenTrades - true pour inclure trades ouverts.
 * @param options.maxTrades - borne supérieure pour maîtriser coût UI/IO.
 */
export async function getTradeReplayDataset(
  options: GetTradeReplayDatasetOptions = {},
): Promise<TradeReplayDataset> {
  const maxTrades = Math.max(1, options.maxTrades ?? DEFAULT_MAX_REPLAY_TRADES);
  const includeOpenTrades = options.includeOpenTrades ?? false;

  const trades = await getTrades();
  const filteredTrades = includeOpenTrades
    ? trades
    : trades.filter((trade) => trade.status !== "open");
  const limitedTrades = filteredTrades.slice(0, maxTrades);

  const frames = await Promise.all(
    limitedTrades.map(async (trade) => {
      const screenshots = await getScreenshotsForTrade(trade.id);
      return mapTradeToReplayFrame(trade, screenshots);
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    totalTrades: filteredTrades.length,
    frames,
  };
}
