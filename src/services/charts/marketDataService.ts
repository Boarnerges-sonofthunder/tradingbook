// ============================================================
// Service — Market Data / Trade Replay Chart (lecture seule)
// ============================================================
// Prepare modele chart TradingView pour analyse historique locale.
// Aucun ordre, aucun signal, aucune dependance cloud.
// ============================================================

import type { LineStyle, UTCTimestamp } from "lightweight-charts";
import { findMarketOhlcCandles } from "../../repositories/marketDataRepository";
import type {
  ChartTimeframe,
  GetTradeReplayChartModelOptions,
  MarketOhlcCandle,
  TradeChartMarker,
  TradeChartPriceLevel,
  TradeReplayChartDataSource,
  TradeReplayChartModel,
  TradeReplayFrame,
} from "../../types";

const DEFAULT_TIMEFRAME: ChartTimeframe = "M5";
const DEFAULT_LOOKBACK_CANDLES = 80;
const DEFAULT_LOOKAHEAD_CANDLES = 50;
const MAX_WINDOW_DAYS = 15;

const MARKER_COLORS = {
  entry: "#4CAF50",
  exit: "#F44336",
  stop_loss: "#FF9800",
  take_profit: "#2196F3",
} as const;

const DASHED_LINE_STYLE: LineStyle = 2;

function getTimeframeSeconds(timeframe: ChartTimeframe): number {
  switch (timeframe) {
    case "M1":
      return 60;
    case "M5":
      return 5 * 60;
    case "M15":
      return 15 * 60;
    case "M30":
      return 30 * 60;
    case "H1":
      return 60 * 60;
    case "H4":
      return 4 * 60 * 60;
    case "D1":
      return 24 * 60 * 60;
    default:
      return 5 * 60;
  }
}

function toTimestamp(value: string | null): UTCTimestamp | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return Math.floor(date.getTime() / 1000) as UTCTimestamp;
}

function toIsoUtc(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function normalizeTimeframe(
  value: string | undefined,
  fallback: ChartTimeframe = DEFAULT_TIMEFRAME,
): ChartTimeframe {
  const normalized = (value ?? "").toUpperCase();
  if (
    normalized === "M1" ||
    normalized === "M5" ||
    normalized === "M15" ||
    normalized === "M30" ||
    normalized === "H1" ||
    normalized === "H4" ||
    normalized === "D1"
  ) {
    return normalized;
  }
  return fallback;
}

/**
 * Definit fenetre temporelle locale autour trade.
 * Evite charger historique massif tout en couvrant contexte pre/post trade.
 */
function resolveReplayWindow(
  frame: TradeReplayFrame,
  timeframe: ChartTimeframe,
  lookbackCandles: number,
  lookaheadCandles: number,
): { fromIso: string; toIso: string } {
  const openTs = toTimestamp(frame.openedAt);
  const closeTs = toTimestamp(frame.closedAt);
  const tfSeconds = getTimeframeSeconds(timeframe);

  const nowTs = Math.floor(Date.now() / 1000);
  const anchorStartTs = openTs ?? closeTs ?? nowTs;
  const anchorEndTs = closeTs ?? Math.max(anchorStartTs + tfSeconds, nowTs);

  const rawFromTs = anchorStartTs - Math.max(1, lookbackCandles) * tfSeconds;
  const rawToTs = anchorEndTs + Math.max(1, lookaheadCandles) * tfSeconds;

  const maxWindowSeconds = MAX_WINDOW_DAYS * 24 * 60 * 60;
  const cappedFromTs = Math.max(rawFromTs, rawToTs - maxWindowSeconds);

  return {
    fromIso: toIsoUtc(cappedFromTs),
    toIso: toIsoUtc(rawToTs),
  };
}

function normalizeCandles(candles: MarketOhlcCandle[] | undefined): MarketOhlcCandle[] {
  if (!candles || candles.length === 0) {
    return [];
  }

  const deduplicated = new Map<number, MarketOhlcCandle>();

  for (const candle of candles) {
    if (
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close)
    ) {
      continue;
    }

    const rawTime = candle.time as number;
    if (!Number.isFinite(rawTime)) {
      continue;
    }

    deduplicated.set(rawTime, candle);
  }

  return [...deduplicated.values()].sort(
    (left, right) => (left.time as number) - (right.time as number),
  );
}

function buildMarkers(frame: TradeReplayFrame): TradeChartMarker[] {
  const openedAt = toTimestamp(frame.openedAt);
  const closedAt = toTimestamp(frame.closedAt);

  const markers: TradeChartMarker[] = [];

  if (openedAt !== null) {
    markers.push({
      id: `trade-${frame.tradeId}-entry`,
      kind: "entry",
      time: openedAt,
      position: "belowBar",
      shape: "arrowUp",
      color: MARKER_COLORS.entry,
      text: `ENTREE ${frame.entryPrice.toFixed(5)}`,
      price: frame.entryPrice,
      size: 1,
    });

    if (frame.stopLoss !== null) {
      markers.push({
        id: `trade-${frame.tradeId}-sl`,
        kind: "stop_loss",
        time: openedAt,
        position: "atPriceMiddle",
        shape: "circle",
        color: MARKER_COLORS.stop_loss,
        text: `SL ${frame.stopLoss.toFixed(5)}`,
        price: frame.stopLoss,
        size: 0.8,
      });
    }

    if (frame.takeProfit !== null) {
      markers.push({
        id: `trade-${frame.tradeId}-tp`,
        kind: "take_profit",
        time: openedAt,
        position: "atPriceMiddle",
        shape: "square",
        color: MARKER_COLORS.take_profit,
        text: `TP ${frame.takeProfit.toFixed(5)}`,
        price: frame.takeProfit,
        size: 0.8,
      });
    }
  }

  if (closedAt !== null && frame.exitPrice !== null) {
    markers.push({
      id: `trade-${frame.tradeId}-exit`,
      kind: "exit",
      time: closedAt,
      position: "aboveBar",
      shape: "arrowDown",
      color: MARKER_COLORS.exit,
      text: `SORTIE ${frame.exitPrice.toFixed(5)}`,
      price: frame.exitPrice,
      size: 1,
    });
  }

  return markers;
}

function buildPriceLevels(frame: TradeReplayFrame): TradeChartPriceLevel[] {
  const levels: TradeChartPriceLevel[] = [
    {
      id: `trade-${frame.tradeId}-entry-line`,
      kind: "entry",
      price: frame.entryPrice,
      label: "Entree",
      color: MARKER_COLORS.entry,
      dashed: false,
    },
  ];

  if (frame.exitPrice !== null) {
    levels.push({
      id: `trade-${frame.tradeId}-exit-line`,
      kind: "exit",
      price: frame.exitPrice,
      label: "Sortie",
      color: MARKER_COLORS.exit,
      dashed: false,
    });
  }

  if (frame.stopLoss !== null) {
    levels.push({
      id: `trade-${frame.tradeId}-sl-line`,
      kind: "stop_loss",
      price: frame.stopLoss,
      label: "SL",
      color: MARKER_COLORS.stop_loss,
      dashed: true,
    });
  }

  if (frame.takeProfit !== null) {
    levels.push({
      id: `trade-${frame.tradeId}-tp-line`,
      kind: "take_profit",
      price: frame.takeProfit,
      label: "TP",
      color: MARKER_COLORS.take_profit,
      dashed: true,
    });
  }

  return levels;
}

function sourceFromPlatform(platform: TradeReplayFrame["platform"]): TradeReplayChartDataSource {
  switch (platform) {
    case "mt5":
      return "mt5_local_history";
    case "mt4":
      return "mt4_local_history";
    case "csv":
      return "csv_local_history";
    default:
      return "manual_local_dataset";
  }
}

function resolveChartSource(
  frame: TradeReplayFrame,
  hasMarketData: boolean,
  sourceOverride: TradeReplayChartDataSource | undefined,
): TradeReplayChartDataSource {
  if (sourceOverride) {
    return sourceOverride;
  }

  if (hasMarketData) {
    return sourceFromPlatform(frame.platform);
  }

  return frame.chartDataSource;
}

async function resolveCandles(
  frame: TradeReplayFrame,
  timeframe: ChartTimeframe,
  options: GetTradeReplayChartModelOptions,
): Promise<{ candles: MarketOhlcCandle[]; fromIso: string; toIso: string }> {
  const lookbackCandles = Math.max(20, options.lookbackCandles ?? DEFAULT_LOOKBACK_CANDLES);
  const lookaheadCandles = Math.max(20, options.lookaheadCandles ?? DEFAULT_LOOKAHEAD_CANDLES);
  const window = resolveReplayWindow(frame, timeframe, lookbackCandles, lookaheadCandles);

  if (options.candles && options.candles.length > 0) {
    return {
      candles: normalizeCandles(options.candles),
      fromIso: window.fromIso,
      toIso: window.toIso,
    };
  }

  const candles = await findMarketOhlcCandles({
    symbol: frame.symbol,
    timeframe,
    platform: frame.platform,
    broker: frame.broker,
    accountId: frame.accountId,
    fromIso: window.fromIso,
    toIso: window.toIso,
  });

  return {
    candles: normalizeCandles(candles),
    fromIso: window.fromIso,
    toIso: window.toIso,
  };
}

/**
 * Assemble modele chart complet pour un trade selectionne.
 * Les candles OHLC sont optionnelles tant que source historique locale
 * (MT5/CSV) n'est pas encore branchee.
 */
export async function getTradeReplayChartModel(
  frame: TradeReplayFrame,
  options: GetTradeReplayChartModelOptions = {},
): Promise<TradeReplayChartModel> {
  const timeframe = normalizeTimeframe(options.timeframe, DEFAULT_TIMEFRAME);
  const { candles, fromIso, toIso } = await resolveCandles(
    frame,
    timeframe,
    options,
  );
  const hasMarketData = candles.length > 0;
  const source = resolveChartSource(frame, hasMarketData, options.source);

  const priceLevels = buildPriceLevels(frame);
  const markers = buildMarkers(frame);

  return {
    tradeId: frame.tradeId,
    symbol: frame.symbol,
    timeframe,
    source,
    hasMarketData,
    candles,
    markers,
    priceLevels,
    replayWindow: {
      from: fromIso,
      to: toIso,
    },
    emptyStateMessage:
      "Aucune serie OHLC locale disponible dans fenetre replay. Synchronisez historique OHLC MT5/CSV puis rechargez.",
  };
}

export { DASHED_LINE_STYLE };
