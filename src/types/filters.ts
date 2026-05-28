import type { Trade, TradePlatform, TradeSide, TradeStatus } from "./trade";
import type { TradesSort } from "./sorting";
import type { PaginationMeta } from "./pagination";

export type TradeDateFilterField = "openedAt" | "closedAt";

export type TradeResultFilter = "all" | "winning" | "losing" | "breakeven";

export type TradeSourceFilter =
  | "all"
  | "manual"
  | "csv_import"
  | "mt5_sync"
  | "mt4_import";

export type StrategyFilterValue = number | "none" | "all";

export interface TradesMultiFilters {
  dateField: TradeDateFilterField;
  dateFrom: string;
  dateTo: string;
  symbol: string;
  status: TradeStatus | "all";
  side: TradeSide | "all";
  broker: string;
  brokerId: number | "all";
  platform: TradePlatform | "all";
  accountId: string;
  tradingAccountId: number | "all";
  strategyId: StrategyFilterValue;
  tagId: number | "all";
  emotionId: number | "all";
  mistakeId: number | "all";
  result: TradeResultFilter;
  source: TradeSourceFilter;
}

export interface TradesFilterOption {
  value: string;
  label: string;
}

export interface TradesFilterEntityOption {
  id: number;
  name: string;
}

export interface TradesFilterOptions {
  symbols: string[];
  brokers: string[];
  brokersCatalog: TradesFilterEntityOption[];
  accounts: string[];
  tradingAccounts: TradesFilterEntityOption[];
  platforms: TradePlatform[];
  strategies: TradesFilterEntityOption[];
  tags: TradesFilterEntityOption[];
  emotions: TradesFilterEntityOption[];
  mistakes: TradesFilterEntityOption[];
}

export interface TradesFilterResult {
  trades: Trade[];
  total: number;
  filters: TradesMultiFilters;
  sort: TradesSort;
  pagination: PaginationMeta;
  options: TradesFilterOptions;
}
