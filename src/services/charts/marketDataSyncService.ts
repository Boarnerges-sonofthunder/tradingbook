// ============================================================
// Service — Market Data Sync (MT5 -> SQLite)
// ============================================================
// Synchronise chandelles OHLC locales pour module replay.
// Lecture seule MT5, persistance SQLite locale.
// ============================================================

import { upsertMarketOhlcCandles } from "../../repositories";
import type {
  ChartTimeframe,
  MT5RawDeal,
  MT5RawPosition,
  TradePlatform,
} from "../../types";
import { fetchMT5Candles } from "../mt5/mt5CandlesService";
import { createLogger } from "../logging";

const logger = createLogger("market-data-sync");

const DEFAULT_TIMEFRAMES: ChartTimeframe[] = ["M5", "M15", "H1"];

export interface SyncMT5MarketDataInput {
  deals: MT5RawDeal[];
  positions: MT5RawPosition[];
  broker?: string | null;
  accountId?: string | null;
  fromIso: string;
  toIso: string;
  platform?: TradePlatform;
  timeframes?: ChartTimeframe[];
  maxSymbols?: number;
}

export interface SyncMT5MarketDataResult {
  symbolsProcessed: number;
  timeframesProcessed: number;
  candlesFetched: number;
  rowsUpserted: number;
  errors: string[];
}

function collectSymbols(
  deals: MT5RawDeal[],
  positions: MT5RawPosition[],
  maxSymbols = 20,
): string[] {
  const unique = new Set<string>();

  for (const deal of deals) {
    const symbol = String(deal.symbol ?? "").trim().toUpperCase();
    if (!symbol) {
      continue;
    }
    unique.add(symbol);
    if (unique.size >= maxSymbols) {
      break;
    }
  }

  if (unique.size < maxSymbols) {
    for (const position of positions) {
      const symbol = String(position.symbol ?? "").trim().toUpperCase();
      if (!symbol) {
        continue;
      }
      unique.add(symbol);
      if (unique.size >= maxSymbols) {
        break;
      }
    }
  }

  return [...unique.values()];
}

/**
 * Synchronise chandelles MT5 locales pour replay.
 * Erreurs non bloquantes: retourne rapport détaillé sans throw.
 */
export async function syncMT5MarketDataForReplay(
  input: SyncMT5MarketDataInput,
): Promise<SyncMT5MarketDataResult> {
  const timeframes =
    input.timeframes && input.timeframes.length > 0
      ? input.timeframes
      : DEFAULT_TIMEFRAMES;

  const symbols = collectSymbols(input.deals, input.positions, input.maxSymbols ?? 20);
  const errors: string[] = [];
  let candlesFetched = 0;
  let rowsUpserted = 0;

  for (const symbol of symbols) {
    for (const timeframe of timeframes) {
      const result = await fetchMT5Candles({
        symbol,
        timeframe,
        fromIso: input.fromIso,
        toIso: input.toIso,
        maxBars: 3000,
      });

      if (!result.success) {
        const msg = `[${symbol}/${timeframe}] ${result.message}`;
        logger.warn(`Sync OHLC ignorée: ${msg}`);
        errors.push(msg);
        continue;
      }

      if (result.candles.length === 0) {
        continue;
      }

      candlesFetched += result.candles.length;

      const rows = result.candles.map((candle) => ({
        platform: input.platform ?? "mt5",
        broker: input.broker ?? null,
        accountId: input.accountId ?? null,
        symbol,
        timeframe,
        candleTime: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        sourceLabel: `mt5_bridge:${timeframe}`,
      }));

      const upsert = await upsertMarketOhlcCandles(rows);
      rowsUpserted += upsert.insertedOrUpdated;
    }
  }

  return {
    symbolsProcessed: symbols.length,
    timeframesProcessed: timeframes.length,
    candlesFetched,
    rowsUpserted,
    errors,
  };
}
