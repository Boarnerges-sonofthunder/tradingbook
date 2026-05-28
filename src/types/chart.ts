// ============================================================
// Types — Chart / Trade Replay
// ============================================================
// Contrats de donnees utilises par l'integration Lightweight Charts.
// Objectif: separer preparation des donnees (services) du rendu UI.
// ============================================================

import type {
  CandlestickData,
  SeriesMarker,
  UTCTimestamp,
} from "lightweight-charts";

/** Source locale des candles chargees pour replay. */
export type TradeReplayChartDataSource =
  | "mt5_local_history"
  | "csv_local_history"
  | "mt4_local_history"
  | "manual_local_dataset"
  | "pending_historical_provider"
  | "none";

/** Timeframes supportes pour replay OHLC local. */
export type ChartTimeframe = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1";

/** Chandelle OHLC normalisee pour Lightweight Charts. */
export type MarketOhlcCandle = CandlestickData<UTCTimestamp>;

/** Type fonctionnel du marqueur de trade. */
export type TradeChartMarkerKind =
  | "entry"
  | "exit"
  | "stop_loss"
  | "take_profit";

/** Marqueur place sur serie candlestick. */
export type TradeChartMarker = SeriesMarker<UTCTimestamp> & {
  id: string;
  kind: TradeChartMarkerKind;
};

/** Niveau prix fixe affiche via createPriceLine. */
export interface TradeChartPriceLevel {
  id: string;
  kind: TradeChartMarkerKind;
  price: number;
  label: string;
  color: string;
  dashed?: boolean;
}

/** Modele complet envoye au composant TradingViewChart. */
export interface TradeReplayChartModel {
  tradeId: number;
  symbol: string;
  timeframe: ChartTimeframe;
  source: TradeReplayChartDataSource;
  hasMarketData: boolean;
  candles: MarketOhlcCandle[];
  markers: TradeChartMarker[];
  priceLevels: TradeChartPriceLevel[];
  replayWindow: {
    from: string;
    to: string;
  };
  emptyStateMessage: string;
}

/**
 * Options d'assemblage du modele chart.
 * `candles` reste optionnel pour permettre integration locale progressive.
 */
export interface GetTradeReplayChartModelOptions {
  candles?: MarketOhlcCandle[];
  timeframe?: ChartTimeframe;
  source?: TradeReplayChartDataSource;
  lookbackCandles?: number;
  lookaheadCandles?: number;
}
