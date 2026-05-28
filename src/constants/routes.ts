export const ROUTES = {
  DASHBOARD: "/",
  TRADES: "/trades",
  REPLAY: "/replay",
  TRADE_NEW: "/trades/new",
  TRADE_DETAILS: "/trades/:id",
  ANALYTICS: "/analytics",
  BACKTESTING: "/backtesting",
  CALENDAR: "/calendar",
  IMPORTS: "/imports",
  MT5_SYNC: "/mt5",
  STRATEGIES: "/strategies",
  ACCOUNTS: "/accounts",
  SCREENSHOTS: "/screenshots",
  BACKUPS: "/backups",
  LOGS: "/logs",
  SETTINGS: "/settings",
} as const;

export type RouteKey = keyof typeof ROUTES;
