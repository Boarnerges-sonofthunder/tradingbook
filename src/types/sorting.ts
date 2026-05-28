export type SortDirection = "asc" | "desc";

export type TradeSortField =
  | "openedAt"
  | "closedAt"
  | "symbol"
  | "netPnl"
  | "volume"
  | "side"
  | "status"
  | "strategy"
  | "broker"
  | "platform"
  | "riskReward"
  | "createdAt"
  | "updatedAt";

export interface TradesSort {
  field: TradeSortField;
  direction: SortDirection;
}

export interface TradeSortOption {
  field: TradeSortField;
  label: string;
}
