// ============================================================
// Service — Market data historical CSV import (backtesting)
// ============================================================
// Pipeline:
//   1) parse CSV local
//   2) valider bougies OHLCV
//   3) dedupliquer memoire
//   4) upsert SQLite table market_data
// ============================================================

import { findMarketDataCandles, listMarketDataSymbols, upsertMarketDataCandles } from "../../repositories";
import type {
  ChartTimeframe,
  MarketDataImportSummary,
  UpsertMarketDataCandleInput,
} from "../../types";

const REQUIRED_HEADERS = ["symbol", "timeframe", "timestamp", "open", "high", "low", "close"] as const;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseTimeframe(raw: string | undefined): ChartTimeframe | null {
  const value = raw?.trim().toUpperCase();
  if (!value) {
    return null;
  }
  if (value === "M1" || value === "M5" || value === "M15" || value === "M30" || value === "H1" || value === "H4" || value === "D1") {
    return value;
  }
  return null;
}

function parseTimestamp(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const date = new Date(raw.trim());
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function isValidOhlc(candle: {
  open: number;
  high: number;
  low: number;
  close: number;
}): boolean {
  if (candle.high < candle.low) {
    return false;
  }

  if (candle.open < candle.low || candle.open > candle.high) {
    return false;
  }

  if (candle.close < candle.low || candle.close > candle.high) {
    return false;
  }

  return true;
}

/**
 * Importe CSV OHLCV vers market_data.
 * Dedup locale: symbol+timeframe+timestamp+source.
 */
export async function importHistoricalMarketDataCsv(
  csvContent: string,
  sourceLabel = "csv_manual_import",
): Promise<MarketDataImportSummary> {
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      totalRows: 0,
      importedRows: 0,
      skippedRows: 0,
      duplicateRows: 0,
      invalidRows: 0,
    };
  }

  const headers = parseCsvLine(lines[0]).map((header) => normalizeHeader(header));
  const indexes = new Map<string, number>();
  headers.forEach((header, index) => indexes.set(header, index));

  for (const header of REQUIRED_HEADERS) {
    if (!indexes.has(header)) {
      throw new Error(`Colonne CSV manquante: ${header}`);
    }
  }

  const unique = new Map<string, UpsertMarketDataCandleInput>();
  let invalidRows = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);

    const symbol = values[indexes.get("symbol") ?? -1]?.trim().toUpperCase();
    const timeframe = parseTimeframe(values[indexes.get("timeframe") ?? -1]);
    const timestamp = parseTimestamp(values[indexes.get("timestamp") ?? -1]);
    const open = parseNumber(values[indexes.get("open") ?? -1]);
    const high = parseNumber(values[indexes.get("high") ?? -1]);
    const low = parseNumber(values[indexes.get("low") ?? -1]);
    const close = parseNumber(values[indexes.get("close") ?? -1]);
    const volume = parseNumber(values[indexes.get("volume") ?? -1]);

    if (!symbol || !timeframe || !timestamp || open === null || high === null || low === null || close === null) {
      invalidRows += 1;
      continue;
    }

    if (!isValidOhlc({ open, high, low, close })) {
      invalidRows += 1;
      continue;
    }

    const row: UpsertMarketDataCandleInput = {
      symbol,
      timeframe,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      source: sourceLabel,
      platform: "csv",
    };

    const dedupKey = `${symbol}|${timeframe}|${timestamp}|${sourceLabel}`;
    unique.set(dedupKey, row);
  }

  const dedupedRows = Array.from(unique.values());
  const affected = await upsertMarketDataCandles(dedupedRows);

  return {
    totalRows: lines.length - 1,
    importedRows: affected,
    skippedRows: Math.max(0, lines.length - 1 - dedupedRows.length),
    duplicateRows: Math.max(0, lines.length - 1 - dedupedRows.length - invalidRows),
    invalidRows,
  };
}

export async function getHistoricalMarketSymbols(): Promise<string[]> {
  return listMarketDataSymbols();
}

export async function getHistoricalCandlesForReplay(
  symbol: string,
  timeframe: ChartTimeframe,
  fromIso?: string,
  toIso?: string,
) {
  return findMarketDataCandles({
    symbol,
    timeframe,
    fromIso,
    toIso,
  });
}
