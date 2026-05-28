import type { TradeSortField, TradeSortOption, TradesSort } from "../../types";

export const DEFAULT_TRADES_SORT: TradesSort = {
  field: "openedAt",
  direction: "desc",
};

export const TRADE_SORT_LABELS: Record<TradeSortField, string> = {
  openedAt: "Date d'ouverture",
  closedAt: "Date de fermeture",
  symbol: "Symbole",
  netPnl: "PnL net",
  volume: "Volume",
  side: "Direction",
  status: "Statut",
  strategy: "Strategie",
  broker: "Broker",
  platform: "Plateforme",
  riskReward: "Risk/reward",
  createdAt: "Creation",
  updatedAt: "Mise a jour",
};

export const TRADE_SORT_OPTIONS: TradeSortOption[] = [
  { field: "openedAt", label: TRADE_SORT_LABELS.openedAt },
  { field: "closedAt", label: TRADE_SORT_LABELS.closedAt },
  { field: "symbol", label: TRADE_SORT_LABELS.symbol },
  { field: "netPnl", label: TRADE_SORT_LABELS.netPnl },
  { field: "volume", label: TRADE_SORT_LABELS.volume },
  { field: "side", label: TRADE_SORT_LABELS.side },
  { field: "status", label: TRADE_SORT_LABELS.status },
  { field: "strategy", label: TRADE_SORT_LABELS.strategy },
  { field: "broker", label: TRADE_SORT_LABELS.broker },
  { field: "platform", label: TRADE_SORT_LABELS.platform },
  { field: "riskReward", label: TRADE_SORT_LABELS.riskReward },
  { field: "createdAt", label: TRADE_SORT_LABELS.createdAt },
  { field: "updatedAt", label: TRADE_SORT_LABELS.updatedAt },
];

const DEFAULT_DIRECTION_BY_FIELD: Record<TradeSortField, TradesSort["direction"]> = {
  openedAt: "desc",
  closedAt: "desc",
  symbol: "asc",
  netPnl: "desc",
  volume: "desc",
  side: "asc",
  status: "asc",
  strategy: "asc",
  broker: "asc",
  platform: "asc",
  riskReward: "desc",
  createdAt: "desc",
  updatedAt: "desc",
};

const SORT_FIELDS = new Set<TradeSortField>(TRADE_SORT_OPTIONS.map((option) => option.field));

export function normalizeTradesSort(sort?: Partial<TradesSort>): TradesSort {
  const field = sort?.field && SORT_FIELDS.has(sort.field) ? sort.field : DEFAULT_TRADES_SORT.field;
  const direction = sort?.direction === "asc" || sort?.direction === "desc"
    ? sort.direction
    : DEFAULT_DIRECTION_BY_FIELD[field];

  return { field, direction };
}

export function toggleTradesSort(current: TradesSort, field: TradeSortField): TradesSort {
  if (current.field === field) {
    return {
      field,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }

  return {
    field,
    direction: DEFAULT_DIRECTION_BY_FIELD[field],
  };
}
