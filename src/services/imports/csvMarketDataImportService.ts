// ============================================================
// CSV Market Data Import Service — TradingBook
// ============================================================
// Détecte et importe bougies OHLC depuis CSV local vers SQLite.
// Non bloquant: si colonnes OHLC absentes, retourne simplement 0.
// ============================================================

import { upsertMarketOhlcCandles } from "../../repositories";
import type { ChartTimeframe } from "../../types";
import { normalizeHeader } from "./csvMappingService";
import type { CsvParseResult } from "./csvParserService";

export interface ImportCsvMarketDataInput {
  parseResult: CsvParseResult;
  broker?: string | null;
  accountId?: string | null;
  timeframeFallback?: ChartTimeframe;
}

export interface ImportCsvMarketDataResult {
  detected: boolean;
  importedRows: number;
  skippedRows: number;
  reason?: string;
}

const DEFAULT_TIMEFRAME: ChartTimeframe = "M5";

const HEADER_ALIASES = {
  symbol: ["symbol", "instrument", "pair", "ticker"],
  time: ["time", "datetime", "date", "timestamp", "candletime", "candle_time"],
  timeframe: ["timeframe", "tf", "period"],
  open: ["open", "openprice", "open_price"],
  high: ["high", "highprice", "high_price"],
  low: ["low", "lowprice", "low_price"],
  close: ["close", "closeprice", "close_price"],
  volume: ["volume", "tickvolume", "tick_volume", "real_volume"],
} as const;

function findHeader(
  headers: string[],
  aliases: readonly string[],
): string | null {
  const map = new Map<string, string>();
  for (const header of headers) {
    map.set(normalizeHeader(header), header);
  }

  for (const alias of aliases) {
    const header = map.get(normalizeHeader(alias));
    if (header) {
      return header;
    }
  }

  return null;
}

function parseTimeframe(value: string | null | undefined): ChartTimeframe | null {
  if (!value) {
    return null;
  }
  const tf = value.trim().toUpperCase();
  if (tf === "M1" || tf === "M5" || tf === "M15" || tf === "M30" || tf === "H1" || tf === "H4" || tf === "D1") {
    return tf;
  }
  return null;
}

function parseNumber(raw: string | null | undefined): number | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseIso(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

/**
 * Tente import OHLC depuis CSV parse.
 * Si schéma colonnes OHLC absent, retourne detected=false.
 */
export async function importCsvMarketData(
  input: ImportCsvMarketDataInput,
): Promise<ImportCsvMarketDataResult> {
  const headers = input.parseResult.headers;

  const symbolHeader = findHeader(headers, HEADER_ALIASES.symbol);
  const timeHeader = findHeader(headers, HEADER_ALIASES.time);
  const openHeader = findHeader(headers, HEADER_ALIASES.open);
  const highHeader = findHeader(headers, HEADER_ALIASES.high);
  const lowHeader = findHeader(headers, HEADER_ALIASES.low);
  const closeHeader = findHeader(headers, HEADER_ALIASES.close);

  if (!symbolHeader || !timeHeader || !openHeader || !highHeader || !lowHeader || !closeHeader) {
    return {
      detected: false,
      importedRows: 0,
      skippedRows: input.parseResult.rows.length,
      reason: "Colonnes OHLC minimales absentes",
    };
  }

  const timeframeHeader = findHeader(headers, HEADER_ALIASES.timeframe);
  const volumeHeader = findHeader(headers, HEADER_ALIASES.volume);

  const rows = [] as Parameters<typeof upsertMarketOhlcCandles>[0];
  let skipped = 0;

  for (const row of input.parseResult.rows) {
    const symbol = String(row[symbolHeader] ?? "").trim().toUpperCase();
    const candleTime = parseIso(row[timeHeader]);
    const open = parseNumber(row[openHeader]);
    const high = parseNumber(row[highHeader]);
    const low = parseNumber(row[lowHeader]);
    const close = parseNumber(row[closeHeader]);

    if (!symbol || !candleTime || open === null || high === null || low === null || close === null) {
      skipped++;
      continue;
    }

    const timeframe =
      parseTimeframe(timeframeHeader ? row[timeframeHeader] : null) ??
      input.timeframeFallback ??
      DEFAULT_TIMEFRAME;

    rows.push({
      platform: "csv",
      broker: input.broker ?? null,
      accountId: input.accountId ?? null,
      symbol,
      timeframe,
      candleTime,
      open,
      high,
      low,
      close,
      volume: volumeHeader ? parseNumber(row[volumeHeader]) : null,
      sourceLabel: "csv_import",
    });
  }

  if (rows.length === 0) {
    return {
      detected: true,
      importedRows: 0,
      skippedRows: skipped,
      reason: "Colonnes OHLC detectées mais aucune ligne valide",
    };
  }

  const upsert = await upsertMarketOhlcCandles(rows);

  return {
    detected: true,
    importedRows: upsert.insertedOrUpdated,
    skippedRows: skipped,
  };
}
