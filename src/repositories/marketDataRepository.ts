// ============================================================
// Repository — Market OHLC (lecture seule replay)
// ============================================================
// Lit donnees OHLC locales stockees en SQLite.
// Aucune execution ordre. Aucune source cloud.
// ============================================================

import type { UTCTimestamp } from "lightweight-charts";
import { getDb, withDatabaseBusyRetry } from "../services/database";
import type {
  ChartTimeframe,
  MarketDataCandle,
  MarketDataRangeFilter,
  MarketOhlcCandle,
  TradePlatform,
  UpsertMarketDataCandleInput,
} from "../types";

interface MarketOhlcRow {
  candle_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface UpsertMarketOhlcCandleInput {
  platform: TradePlatform;
  broker?: string | null;
  accountId?: string | null;
  symbol: string;
  timeframe: ChartTimeframe;
  candleTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  sourceLabel?: string | null;
}

export interface FindMarketOhlcCandlesParams {
  symbol: string;
  timeframe: ChartTimeframe;
  platform: TradePlatform;
  broker?: string | null;
  accountId?: string | null;
  fromIso: string;
  toIso: string;
  limit?: number;
}

function toTimestamp(value: string): number | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return Math.floor(date.getTime() / 1000);
}

/**
 * Charge chandelles OHLC locales par symbole/timeframe dans fenetre donnee.
 * Priorise contexte compte (broker/account_id) puis fallback global.
 */
export async function findMarketOhlcCandles(
  params: FindMarketOhlcCandlesParams,
): Promise<MarketOhlcCandle[]> {
  const db = await getDb();

  const maxRows = Math.max(100, Math.min(params.limit ?? 2400, 20_000));

  const rows = await withDatabaseBusyRetry(() =>
    db.select<MarketOhlcRow[]>(
      `SELECT
        candle_time,
        open,
        high,
        low,
        close
      FROM market_ohlc
      WHERE symbol = $1
        AND timeframe = $2
        AND platform = $3
        AND candle_time >= $4
        AND candle_time <= $5
        AND (
          (broker IS NULL AND account_id IS NULL)
          OR (
            ($6 IS NULL AND broker IS NULL) OR broker = $6
          )
          AND (
            ($7 IS NULL AND account_id IS NULL) OR account_id = $7
          )
        )
      ORDER BY
        CASE WHEN broker = $6 AND account_id = $7 THEN 0 ELSE 1 END,
        candle_time ASC
      LIMIT $8`,
      [
        params.symbol,
        params.timeframe,
        params.platform,
        params.fromIso,
        params.toIso,
        params.broker ?? null,
        params.accountId ?? null,
        maxRows,
      ],
    ),
  );

  // Deduplique par timestamp (garde contexte compte prioritaire via ORDER BY).
  const byTime = new Map<number, MarketOhlcCandle>();

  for (const row of rows) {
    const timestamp = toTimestamp(row.candle_time);
    if (timestamp === null) {
      continue;
    }

    if (!Number.isFinite(row.open) || !Number.isFinite(row.high) || !Number.isFinite(row.low) || !Number.isFinite(row.close)) {
      continue;
    }

    if (!byTime.has(timestamp)) {
      byTime.set(timestamp, {
        time: timestamp as UTCTimestamp,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
      });
    }
  }

  return [...byTime.values()].sort((left, right) => (left.time as number) - (right.time as number));
}

/**
 * Upsert batch de chandelles OHLC locales.
 * Conserve modele multi-broker/multi-plateforme.
 */
export async function upsertMarketOhlcCandles(
  rows: UpsertMarketOhlcCandleInput[],
): Promise<{ insertedOrUpdated: number }> {
  if (rows.length === 0) {
    return { insertedOrUpdated: 0 };
  }

  const db = await getDb();
  let insertedOrUpdated = 0;

  for (const row of rows) {
    if (
      !row.symbol ||
      !row.candleTime ||
      !Number.isFinite(row.open) ||
      !Number.isFinite(row.high) ||
      !Number.isFinite(row.low) ||
      !Number.isFinite(row.close)
    ) {
      continue;
    }

    const execResult = await withDatabaseBusyRetry(() =>
      db.execute(
        `INSERT INTO market_ohlc (
          platform,
          broker,
          account_id,
          symbol,
          timeframe,
          candle_time,
          open,
          high,
          low,
          close,
          volume,
          source_label
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12
        )
        ON CONFLICT DO UPDATE SET
          open = excluded.open,
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          volume = excluded.volume,
          source_label = excluded.source_label,
          updated_at = datetime('now')`,
        [
          row.platform,
          row.broker ?? null,
          row.accountId ?? null,
          row.symbol,
          row.timeframe,
          row.candleTime,
          row.open,
          row.high,
          row.low,
          row.close,
          row.volume ?? null,
          row.sourceLabel ?? null,
        ],
      ),
    );

    insertedOrUpdated += execResult.rowsAffected;
  }

  return { insertedOrUpdated };
}

/**
 * Purge anciennes chandelles pour limiter taille locale.
 * Retourne nombre de lignes supprimées.
 */
export async function purgeMarketOhlcOlderThanIso(
  thresholdIso: string,
): Promise<number> {
  const db = await getDb();
  const result = await withDatabaseBusyRetry(() =>
    db.execute(`DELETE FROM market_ohlc WHERE candle_time < $1`, [thresholdIso]),
  );
  return result.rowsAffected;
}

interface MarketDataRow {
  id: number;
  symbol: string;
  timeframe: ChartTimeframe;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  source: string;
  platform: TradePlatform;
  broker: string | null;
  account_id: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToMarketDataCandle(row: MarketDataRow): MarketDataCandle {
  return {
    id: row.id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    timestamp: row.timestamp,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    source: row.source,
    platform: row.platform,
    broker: row.broker,
    accountId: row.account_id,
    externalId: row.external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lit bougies historiques dediees backtesting.
 * Donnees strictement locales (SQLite), hors trading live.
 */
export async function findMarketDataCandles(
  filter: MarketDataRangeFilter,
): Promise<MarketDataCandle[]> {
  const db = await getDb();
  const rows = await withDatabaseBusyRetry(() =>
    db.select<MarketDataRow[]>(
      `SELECT *
       FROM market_data
       WHERE symbol = $1
         AND timeframe = $2
         AND ($3 IS NULL OR timestamp >= $3)
         AND ($4 IS NULL OR timestamp <= $4)
       ORDER BY timestamp ASC`,
      [
        filter.symbol,
        filter.timeframe,
        filter.fromIso ?? null,
        filter.toIso ?? null,
      ],
    ),
  );

  return rows.map(rowToMarketDataCandle);
}

/**
 * Upsert lot de bougies dans market_data avec deduplication SQL.
 */
export async function upsertMarketDataCandles(
  rows: UpsertMarketDataCandleInput[],
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const db = await getDb();
  let affected = 0;

  for (const row of rows) {
    const result = await withDatabaseBusyRetry(() =>
      db.execute(
        `INSERT INTO market_data (
          symbol,
          timeframe,
          timestamp,
          open,
          high,
          low,
          close,
          volume,
          source,
          platform,
          broker,
          account_id,
          external_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT(symbol, timeframe, timestamp, source)
        DO UPDATE SET
          open = excluded.open,
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          volume = excluded.volume,
          platform = excluded.platform,
          broker = excluded.broker,
          account_id = excluded.account_id,
          external_id = excluded.external_id,
          updated_at = datetime('now')`,
        [
          row.symbol,
          row.timeframe,
          row.timestamp,
          row.open,
          row.high,
          row.low,
          row.close,
          row.volume ?? null,
          row.source,
          row.platform ?? "csv",
          row.broker ?? null,
          row.accountId ?? null,
          row.externalId ?? null,
        ],
      ),
    );

    affected += result.rowsAffected;
  }

  return affected;
}

export async function listMarketDataSymbols(): Promise<string[]> {
  const db = await getDb();
  const rows = await withDatabaseBusyRetry(() =>
    db.select<Array<{ symbol: string }>>(
      `SELECT DISTINCT symbol
       FROM market_data
       ORDER BY symbol ASC`,
    ),
  );
  return rows.map((row) => row.symbol);
}
