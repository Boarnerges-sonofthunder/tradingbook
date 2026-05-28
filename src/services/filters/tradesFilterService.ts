import type {
  PaginationState,
  TradesFilterOptions,
  TradesFilterResult,
  TradesMultiFilters,
  TradesSort,
} from "../../types";
import {
  countTradesByMultiFilters,
  findTradesByMultiFilters,
  getTradesFilterOptions,
} from "../../repositories/tradesFilterRepository";
import { buildPaginationMeta, DEFAULT_TRADES_PAGINATION } from "../pagination";
import { DEFAULT_TRADES_SORT, normalizeTradesSort } from "../sorting";

export const DEFAULT_TRADES_FILTERS: TradesMultiFilters = {
  dateField: "openedAt",
  dateFrom: "",
  dateTo: "",
  symbol: "",
  status: "all",
  side: "all",
  broker: "",
  brokerId: "all",
  platform: "all",
  accountId: "",
  tradingAccountId: "all",
  strategyId: "all",
  tagId: "all",
  emotionId: "all",
  mistakeId: "all",
  result: "all",
  source: "all",
};

export function normalizeTradesFilters(filters: Partial<TradesMultiFilters>): TradesMultiFilters {
  return {
    ...DEFAULT_TRADES_FILTERS,
    ...filters,
    symbol: filters.symbol?.trim() ?? DEFAULT_TRADES_FILTERS.symbol,
    broker: filters.broker?.trim() ?? DEFAULT_TRADES_FILTERS.broker,
    brokerId: filters.brokerId ?? DEFAULT_TRADES_FILTERS.brokerId,
    accountId: filters.accountId?.trim() ?? DEFAULT_TRADES_FILTERS.accountId,
    tradingAccountId:
      filters.tradingAccountId ?? DEFAULT_TRADES_FILTERS.tradingAccountId,
  };
}

export function hasActiveTradesFilters(filters: TradesMultiFilters): boolean {
  const normalized = normalizeTradesFilters(filters);
  return Object.entries(DEFAULT_TRADES_FILTERS).some(([key, defaultValue]) => {
    return normalized[key as keyof TradesMultiFilters] !== defaultValue;
  });
}

export type TradesPageQueryResult = Omit<TradesFilterResult, "options">;

export async function getTradesFilterOptionsData(): Promise<TradesFilterOptions> {
  return getTradesFilterOptions();
}

export async function getFilteredTradesPageData(
  filters: Partial<TradesMultiFilters> = {},
  sort: Partial<TradesSort> = DEFAULT_TRADES_SORT,
  pagination: Partial<PaginationState> = DEFAULT_TRADES_PAGINATION,
): Promise<TradesPageQueryResult> {
  const normalizedFilters = normalizeTradesFilters(filters);
  const normalizedSort = normalizeTradesSort(sort);
  const total = await countTradesByMultiFilters(normalizedFilters);
  const paginationMeta = buildPaginationMeta(total, pagination);
  const trades = await findTradesByMultiFilters(
    normalizedFilters,
    normalizedSort,
    paginationMeta,
  );

  return {
    trades,
    total,
    filters: normalizedFilters,
    sort: normalizedSort,
    pagination: paginationMeta,
  };
}

export async function getFilteredTrades(
  filters: Partial<TradesMultiFilters> = {},
  sort: Partial<TradesSort> = DEFAULT_TRADES_SORT,
  pagination: Partial<PaginationState> = DEFAULT_TRADES_PAGINATION,
): Promise<TradesFilterResult> {
  const [pageData, options] = await Promise.all([
    getFilteredTradesPageData(filters, sort, pagination),
    getTradesFilterOptionsData(),
  ]);

  return {
    ...pageData,
    options,
  };
}
