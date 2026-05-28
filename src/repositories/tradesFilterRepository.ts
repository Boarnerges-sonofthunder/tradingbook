import { getDb } from "../services/database";
import type {
  Trade,
  TradePlatform,
  TradeSide,
  TradeStatus,
  PaginationMeta,
  TradesFilterEntityOption,
  TradesFilterOptions,
  TradesMultiFilters,
  TradesSort,
} from "../types";

interface TradeRow {
  id: number;
  external_id: string | null;
  broker: string | null;
  account_id: string | null;
  trading_account_id: number | null;
  platform: string;
  source: string;
  import_id: number | null;
  symbol: string;
  side: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  volume: number;
  commission: number;
  swap: number;
  fees: number;
  gross_pnl: number | null;
  net_pnl: number | null;
  currency: string;
  risk_amount: number | null;
  reward_amount: number | null;
  risk_reward_ratio: number | null;
  strategy_id: number | null;
  created_at: string;
  updated_at: string;
}

function rowToTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    externalId: row.external_id,
    broker: row.broker,
    accountId: row.account_id,
    tradingAccountId: row.trading_account_id,
    platform: row.platform as TradePlatform,
    source: row.source as TradePlatform,
    importId: row.import_id,
    symbol: row.symbol,
    side: row.side as TradeSide,
    status: row.status as TradeStatus,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    volume: row.volume,
    commission: row.commission,
    swap: row.swap,
    fees: row.fees,
    grossPnl: row.gross_pnl,
    netPnl: row.net_pnl,
    currency: row.currency,
    riskAmount: row.risk_amount,
    rewardAmount: row.reward_amount,
    riskRewardRatio: row.risk_reward_ratio,
    strategyId: row.strategy_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pushParam(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

function normalizeDateBoundary(date: string, endOfDay = false): string {
  return `${date}${endOfDay ? "T23:59:59" : "T00:00:00"}`;
}

function mapSourceFilter(source: TradesMultiFilters["source"]): TradePlatform | null {
  switch (source) {
    case "manual":
      return "manual";
    case "csv_import":
      return "csv";
    case "mt5_sync":
      return "mt5";
    case "mt4_import":
      return "mt4";
    default:
      return null;
  }
}

function buildTradesWhere(filters: TradesMultiFilters): {
  where: string;
  params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const dateColumn = filters.dateField === "closedAt" ? "t.closed_at" : "t.opened_at";

  if (filters.dateFrom) {
    conditions.push(`${dateColumn} >= ${pushParam(params, normalizeDateBoundary(filters.dateFrom))}`);
  }

  if (filters.dateTo) {
    conditions.push(`${dateColumn} <= ${pushParam(params, normalizeDateBoundary(filters.dateTo, true))}`);
  }

  if (filters.symbol.trim()) {
    conditions.push(`t.symbol LIKE ${pushParam(params, `%${filters.symbol.trim()}%`)} COLLATE NOCASE`);
  }

  if (filters.status !== "all") {
    conditions.push(`t.status = ${pushParam(params, filters.status)}`);
  }

  if (filters.side !== "all") {
    conditions.push(`t.side = ${pushParam(params, filters.side)}`);
  }

  if (filters.broker.trim()) {
    conditions.push(
      `COALESCE(t.broker, '') LIKE ${pushParam(params, `%${filters.broker.trim()}%`)} COLLATE NOCASE`,
    );
  }

  if (filters.brokerId !== "all") {
    const brokerIdPlaceholder = pushParam(params, filters.brokerId);
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM brokers b
        WHERE b.id = ${brokerIdPlaceholder}
          AND LOWER(TRIM(COALESCE(t.broker, ''))) = LOWER(TRIM(b.name))
      )`,
    );
  }

  if (filters.platform !== "all") {
    conditions.push(`t.platform = ${pushParam(params, filters.platform)}`);
  }

  if (filters.accountId.trim()) {
    conditions.push(
      `COALESCE(t.account_id, '') LIKE ${pushParam(params, `%${filters.accountId.trim()}%`)} COLLATE NOCASE`,
    );
  }

  if (filters.tradingAccountId !== "all") {
    conditions.push(`t.trading_account_id = ${pushParam(params, filters.tradingAccountId)}`);
  }

  if (filters.strategyId !== "all") {
    if (filters.strategyId === "none") {
      conditions.push("t.strategy_id IS NULL");
    } else {
      conditions.push(`t.strategy_id = ${pushParam(params, filters.strategyId)}`);
    }
  }

  if (filters.tagId !== "all") {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM trade_tags tt
        WHERE tt.trade_id = t.id AND tt.tag_id = ${pushParam(params, filters.tagId)}
      )`,
    );
  }

  if (filters.emotionId !== "all") {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM trade_emotions te
        WHERE te.trade_id = t.id AND te.emotion_id = ${pushParam(params, filters.emotionId)}
      )`,
    );
  }

  if (filters.mistakeId !== "all") {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM trade_mistakes tm
        WHERE tm.trade_id = t.id AND tm.mistake_id = ${pushParam(params, filters.mistakeId)}
      )`,
    );
  }

  if (filters.result !== "all") {
    conditions.push("t.status = 'closed'");
    conditions.push("t.net_pnl IS NOT NULL");
    if (filters.result === "winning") conditions.push("t.net_pnl > 0");
    if (filters.result === "losing") conditions.push("t.net_pnl < 0");
    if (filters.result === "breakeven") conditions.push("t.net_pnl = 0");
  }

  const mappedSource = mapSourceFilter(filters.source);
  if (mappedSource) {
    conditions.push(`t.source = ${pushParam(params, mappedSource)}`);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

function buildTradesOrderBy(sort: TradesSort): string {
  const direction = sort.direction === "asc" ? "ASC" : "DESC";

  switch (sort.field) {
    case "openedAt":
      return `ORDER BY t.opened_at ${direction}, t.id DESC`;
    case "closedAt":
      return `ORDER BY t.closed_at IS NULL ASC, t.closed_at ${direction}, t.id DESC`;
    case "symbol":
      return `ORDER BY t.symbol COLLATE NOCASE ${direction}, t.opened_at DESC, t.id DESC`;
    case "netPnl":
      return `ORDER BY t.net_pnl IS NULL ASC, t.net_pnl ${direction}, t.opened_at DESC, t.id DESC`;
    case "volume":
      return `ORDER BY t.volume ${direction}, t.opened_at DESC, t.id DESC`;
    case "side":
      return `ORDER BY t.side ${direction}, t.opened_at DESC, t.id DESC`;
    case "status":
      return `ORDER BY t.status ${direction}, t.opened_at DESC, t.id DESC`;
    case "strategy":
      return `ORDER BY s.name IS NULL ASC, s.name COLLATE NOCASE ${direction}, t.opened_at DESC, t.id DESC`;
    case "broker":
      return `ORDER BY t.broker IS NULL ASC, t.broker COLLATE NOCASE ${direction}, t.opened_at DESC, t.id DESC`;
    case "platform":
      return `ORDER BY t.platform ${direction}, t.opened_at DESC, t.id DESC`;
    case "riskReward":
      return `ORDER BY t.risk_reward_ratio IS NULL ASC, t.risk_reward_ratio ${direction}, t.opened_at DESC, t.id DESC`;
    case "createdAt":
      return `ORDER BY t.created_at ${direction}, t.id DESC`;
    case "updatedAt":
      return `ORDER BY t.updated_at ${direction}, t.id DESC`;
    default:
      return "ORDER BY t.opened_at DESC, t.id DESC";
  }
}

async function selectDistinctStrings(column: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    `SELECT DISTINCT ${column} AS value
     FROM trades
     WHERE ${column} IS NOT NULL AND ${column} <> ''
     ORDER BY ${column} COLLATE NOCASE ASC`,
  );
  return rows.map((row) => row.value);
}

async function selectEntities(tableName: string): Promise<TradesFilterEntityOption[]> {
  const db = await getDb();
  const rows = await db.select<TradesFilterEntityOption[]>(
    `SELECT id, name FROM ${tableName} ORDER BY name COLLATE NOCASE ASC`,
  );
  return rows;
}

export async function findTradesByMultiFilters(
  filters: TradesMultiFilters,
  sort: TradesSort,
  pagination: PaginationMeta,
): Promise<Trade[]> {
  const db = await getDb();
  const { where, params } = buildTradesWhere(filters);
  const orderBy = buildTradesOrderBy(sort);
  const joinStrategies = sort.field === "strategy"
    ? "LEFT JOIN strategies s ON s.id = t.strategy_id"
    : "";
  const limitPlaceholder = pushParam(params, pagination.limit);
  const offsetPlaceholder = pushParam(params, pagination.offset);
  const rows = await db.select<TradeRow[]>(
    `SELECT t.*
     FROM trades t
     ${joinStrategies}
     ${where}
     ${orderBy}
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    params,
  );
  return rows.map(rowToTrade);
}

export async function countTradesByMultiFilters(
  filters: TradesMultiFilters,
): Promise<number> {
  const db = await getDb();
  const { where, params } = buildTradesWhere(filters);
  const rows = await db.select<{ total: number }[]>(
    `SELECT COUNT(*) AS total
     FROM trades t
     ${where}`,
    params,
  );
  return rows[0]?.total ?? 0;
}

export async function getTradesFilterOptions(): Promise<TradesFilterOptions> {
  const db = await getDb();
  const platformRows = await db.select<{ value: TradePlatform }[]>(
    `SELECT DISTINCT platform AS value
     FROM trades
     WHERE platform IS NOT NULL AND platform <> ''
     ORDER BY platform ASC`,
  );

  const tradingAccountRows = await db.select<TradesFilterEntityOption[]>(
    `SELECT id, name
     FROM trading_accounts
     WHERE is_active = 1
     ORDER BY name COLLATE NOCASE ASC`,
  );

  const brokersCatalogRows = await db.select<TradesFilterEntityOption[]>(
    `SELECT id, name
     FROM brokers
     WHERE is_active = 1
     ORDER BY name COLLATE NOCASE ASC`,
  );

  return {
    symbols: await selectDistinctStrings("symbol"),
    brokers: await selectDistinctStrings("broker"),
    brokersCatalog: brokersCatalogRows,
    accounts: await selectDistinctStrings("account_id"),
    tradingAccounts: tradingAccountRows,
    platforms: platformRows.map((row) => row.value),
    strategies: await selectEntities("strategies"),
    tags: await selectEntities("tags"),
    emotions: await selectEntities("emotions"),
    mistakes: await selectEntities("mistakes"),
  };
}
