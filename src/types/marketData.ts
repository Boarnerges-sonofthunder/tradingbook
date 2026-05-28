// ============================================================
// Types — Donnees de marche historiques (backtesting)
// ============================================================
// Table cible: market_data (SQLite local uniquement)
// Donnees dediees simulation historique. Aucun ordre reel.
// ============================================================

import type { ChartTimeframe } from "./chart";
import type { TradePlatform } from "./trade";

export interface MarketDataCandle {
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
  accountId: string | null;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertMarketDataCandleInput {
  symbol: string;
  timeframe: ChartTimeframe;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  source: string;
  platform?: TradePlatform;
  broker?: string | null;
  accountId?: string | null;
  externalId?: string | null;
}

export interface MarketDataRangeFilter {
  symbol: string;
  timeframe: ChartTimeframe;
  fromIso?: string;
  toIso?: string;
}

export interface MarketDataImportSummary {
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  duplicateRows: number;
  invalidRows: number;
}
