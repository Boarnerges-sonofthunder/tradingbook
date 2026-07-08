// ============================================================
// Repository — Trades (CRUD + filtres)
// ============================================================
// Toutes les requêtes SQL sur `trades` passent par ce module.
// ============================================================

import { getDb, withDatabaseBusyRetry } from "../services/database";
import type {
  Trade,
  TradeSide,
  TradeStatus,
  TradePlatform,
  CreateTradeInput,
  UpdateTradeInput,
} from "../types";

// ------------------------------------------------------------
// Type interne — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface TradeRow {
  id: number;
  external_id: string | null;
  broker: string | null;
  broker_id: number | null;
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

interface AnalyticsTradeRow {
  id: number;
  external_id: string | null;
  platform: string;
  source: string;
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
  risk_reward_ratio: number | null;
  strategy_id: number | null;
  created_at: string;
}

const TRADE_SELECT_COLUMNS = `
  id, external_id, broker, broker_id, account_id, trading_account_id, platform, source, import_id,
  symbol, side, status, opened_at, closed_at,
  entry_price, exit_price, stop_loss, take_profit, volume,
  commission, swap, fees, gross_pnl, net_pnl, currency,
  risk_amount, reward_amount, risk_reward_ratio, strategy_id,
  created_at, updated_at
`;

const ANALYTICS_TRADE_SELECT_COLUMNS = `
  id, external_id, platform, source, symbol, side, status,
  opened_at, closed_at, entry_price, exit_price, stop_loss, take_profit,
  volume, commission, swap, fees, gross_pnl, net_pnl, currency,
  risk_reward_ratio, strategy_id, created_at
`;

function rowToTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    externalId: row.external_id,
    broker: row.broker,
    brokerId: row.broker_id,
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

function rowToAnalyticsTrade(row: AnalyticsTradeRow): Trade {
  return {
    id: row.id,
    externalId: row.external_id,
    broker: null,
    brokerId: null,
    accountId: null,
    tradingAccountId: null,
    platform: row.platform as TradePlatform,
    source: row.source as TradePlatform,
    importId: null,
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
    riskAmount: null,
    rewardAmount: null,
    riskRewardRatio: row.risk_reward_ratio,
    strategyId: row.strategy_id,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

// ------------------------------------------------------------
// Filtres (exporté, réexporté par le service)
// ------------------------------------------------------------

export interface TradeFilters {
  symbol?: string;
  side?: TradeSide;
  status?: TradeStatus;
  strategyId?: number | null;
  importId?: number | null;
  dateFrom?: string;   // ISO 8601 — filtre sur opened_at
  dateTo?: string;     // ISO 8601 — filtre sur opened_at
  broker?: string;
  accountId?: string;
  accountIds?: string[];
  tradingAccountId?: number | null;
}

// ------------------------------------------------------------
// Helpers internes
// ------------------------------------------------------------

function buildWhereClause(filters: TradeFilters): {
  where: string;
  params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.symbol) { conditions.push(`symbol = $${idx++}`); params.push(filters.symbol); }
  if (filters.side) { conditions.push(`side = $${idx++}`); params.push(filters.side); }
  if (filters.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }

  if (filters.strategyId !== undefined) {
    conditions.push(
      filters.strategyId === null ? "strategy_id IS NULL" : `strategy_id = $${idx++}`
    );
    if (filters.strategyId !== null) params.push(filters.strategyId);
  }

  if (filters.importId !== undefined) {
    conditions.push(
      filters.importId === null ? "import_id IS NULL" : `import_id = $${idx++}`
    );
    if (filters.importId !== null) params.push(filters.importId);
  }

  if (filters.dateFrom) { conditions.push(`opened_at >= $${idx++}`); params.push(filters.dateFrom); }
  if (filters.dateTo) { conditions.push(`opened_at <= $${idx++}`); params.push(filters.dateTo); }
  if (filters.broker) { conditions.push(`broker = $${idx++}`); params.push(filters.broker); }
  if (filters.accountId) { conditions.push(`account_id = $${idx++}`); params.push(filters.accountId); }
  if (filters.accountIds && filters.accountIds.length > 0) {
    const placeholders = filters.accountIds.map(() => `$${idx++}`).join(", ");
    conditions.push(`account_id IN (${placeholders})`);
    params.push(...filters.accountIds);
  }
  if (filters.tradingAccountId !== undefined) {
    conditions.push(
      filters.tradingAccountId === null
        ? "trading_account_id IS NULL"
        : `trading_account_id = $${idx++}`,
    );
    if (filters.tradingAccountId !== null) params.push(filters.tradingAccountId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

export async function insertTrade(data: CreateTradeInput): Promise<Trade> {
  const db = await getDb();
  const result = await withDatabaseBusyRetry(
    () =>
      db.execute(
    `INSERT INTO trades (
      external_id, broker, broker_id, account_id, trading_account_id, platform, source, import_id,
      symbol, side, status, opened_at, closed_at,
      entry_price, exit_price, stop_loss, take_profit, volume,
      commission, swap, fees, gross_pnl, net_pnl, currency,
      risk_amount, reward_amount, risk_reward_ratio, strategy_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18,
      $19, $20, $21, $22, $23, $24,
      $25, $26, $27, $28
    )`,
    [
      data.externalId ?? null,
      data.broker ?? null,
      data.brokerId ?? null,
      data.accountId ?? null,
      data.tradingAccountId ?? null,
      data.platform ?? "manual",
      data.source ?? "manual",
      data.importId ?? null,
      data.symbol,
      data.side,
      data.status ?? "open",
      data.openedAt,
      data.closedAt ?? null,
      data.entryPrice,
      data.exitPrice ?? null,
      data.stopLoss ?? null,
      data.takeProfit ?? null,
      data.volume,
      data.commission ?? 0,
      data.swap ?? 0,
      data.fees ?? 0,
      data.grossPnl ?? null,
      data.netPnl ?? null,
      data.currency ?? "USD",
      data.riskAmount ?? null,
      data.rewardAmount ?? null,
      data.riskRewardRatio ?? null,
      data.strategyId ?? null,
    ],
      ),
    { operationName: "insertTrade" },
  );

  const insertedId = result.lastInsertId;
  if (!insertedId) throw new Error(`INSERT trades a échoué : lastInsertId=${insertedId}`);
  const trade = await withDatabaseBusyRetry(
    () => findTradeById(insertedId),
    { operationName: "findTradeById apres insertion" },
  );
  if (!trade) throw new Error(`Trade créé introuvable après insertion (id=${insertedId})`);
  return trade;
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

export async function findTradeById(id: number): Promise<Trade | null> {
  const db = await getDb();
  const rows = await db.select<TradeRow[]>(
    `SELECT ${TRADE_SELECT_COLUMNS} FROM trades WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToTrade(rows[0]) : null;
}

export async function findTrades(filters: TradeFilters = {}): Promise<Trade[]> {
  const db = await getDb();
  const { where, params } = buildWhereClause(filters);
  const rows = await db.select<TradeRow[]>(
    `SELECT ${TRADE_SELECT_COLUMNS} FROM trades ${where} ORDER BY opened_at DESC, id DESC`,
    params
  );
  return rows.map(rowToTrade);
}

/**
 * Retourne les N trades clotures les plus recents.
 * Utilise `closed_at` comme ordre principal (plus recent d'abord).
 */
export async function findRecentClosedTrades(limit = 2): Promise<Trade[]> {
  const db = await getDb();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 2;
  const rows = await db.select<TradeRow[]>(
    `SELECT ${TRADE_SELECT_COLUMNS}
     FROM trades
     WHERE status = 'closed' AND closed_at IS NOT NULL
     ORDER BY closed_at DESC, id DESC
     LIMIT $1`,
    [safeLimit],
  );
  return rows.map(rowToTrade);
}

/**
 * Projection légère dédiée à l'analytics.
 *
 * Les services analytics n'utilisent qu'un sous-ensemble des colonnes de
 * `trades`. On évite donc de charger broker/account/import/risk metadata
 * à chaque calcul massif tout en conservant le contrat `Trade`.
 */
export async function findTradesForAnalytics(
  filters: TradeFilters = {},
): Promise<Trade[]> {
  const db = await getDb();
  const { where, params } = buildWhereClause(filters);
  const rows = await db.select<AnalyticsTradeRow[]>(
    `SELECT ${ANALYTICS_TRADE_SELECT_COLUMNS}
     FROM trades
     ${where}
     ORDER BY opened_at DESC, id DESC`,
    params,
  );
  return rows.map(rowToAnalyticsTrade);
}

export async function countTrades(filters: TradeFilters = {}): Promise<number> {
  const db = await getDb();
  const { where, params } = buildWhereClause(filters);
  const rows = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM trades ${where}`,
    params
  );
  return rows[0]?.cnt ?? 0;
}

export async function tradeExistsByExternalId(
  externalId: string,
  accountId: string
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ cnt: number }[]>(
    "SELECT COUNT(*) AS cnt FROM trades WHERE external_id = $1 AND account_id = $2",
    [externalId, accountId]
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

/**
 * Récupère les trades pertinents pour la déduplication.
 *
 * Retourne tous les trades dont le symbole OU l'external_id
 * correspond à l'une des valeurs passées en paramètre.
 *
 * Optimisé pour éviter les N+1 queries : une seule requête pour
 * l'ensemble du fichier CSV.
 *
 * Utilisé exclusivement par tradeDeduplicationService.
 *
 * @param symbols     — liste des symboles uniques du fichier CSV
 * @param externalIds — liste des external_ids uniques du fichier CSV
 */
export async function findTradesForDeduplication(
  symbols: string[],
  externalIds: string[],
): Promise<Trade[]> {
  if (symbols.length === 0 && externalIds.length === 0) return [];

  const db = await getDb();
  const resultsById = new Map<number, Trade>();
  const CHUNK_SIZE = 400;

  if (symbols.length > 0) {
    for (let start = 0; start < symbols.length; start += CHUNK_SIZE) {
      const chunk = symbols.slice(start, start + CHUNK_SIZE);
      const placeholders = chunk.map((_, i) => `$${i + 1}`).join(", ");
      const rows = await db.select<TradeRow[]>(
        `SELECT ${TRADE_SELECT_COLUMNS}
         FROM trades
         WHERE symbol IN (${placeholders})
         ORDER BY opened_at DESC, id DESC`,
        chunk,
      );
      for (const row of rows) {
        const trade = rowToTrade(row);
        resultsById.set(trade.id, trade);
      }
    }
  }

  if (externalIds.length > 0) {
    for (let start = 0; start < externalIds.length; start += CHUNK_SIZE) {
      const chunk = externalIds.slice(start, start + CHUNK_SIZE);
      const placeholders = chunk.map((_, i) => `$${i + 1}`).join(", ");
      const rows = await db.select<TradeRow[]>(
        `SELECT ${TRADE_SELECT_COLUMNS}
         FROM trades
         WHERE external_id IN (${placeholders})
         ORDER BY opened_at DESC, id DESC`,
        chunk,
      );
      for (const row of rows) {
        const trade = rowToTrade(row);
        resultsById.set(trade.id, trade);
      }
    }
  }

  return [...resultsById.values()].sort(
    (a, b) =>
      new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime() ||
      b.id - a.id,
  );
}

/**
 * Retrouve des trades par leurs external_id (déduplication MT5).
 *
 * Utilisé par mt5DeduplicationService pour comparer les candidats
 * MT5 avec les trades déjà présents dans SQLite.
 *
 * Retourne uniquement les trades dont l'external_id est dans la liste.
 * Un external_id non trouvé est silencieusement ignoré.
 */
export async function findTradesByExternalIds(
  externalIds: string[],
): Promise<Trade[]> {
  if (externalIds.length === 0) return [];

  const db = await getDb();
  const placeholders = externalIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await withDatabaseBusyRetry(
    () =>
      db.select<TradeRow[]>(
        `SELECT ${TRADE_SELECT_COLUMNS}
         FROM trades
         WHERE external_id IN (${placeholders})
         ORDER BY opened_at DESC, id DESC`,
        externalIds,
      ),
    { operationName: "findTradesByExternalIds" },
  );
  return rows.map(rowToTrade);
}

// ------------------------------------------------------------
// UPDATE
// ------------------------------------------------------------

export async function updateTradeById(
  id: number,
  data: UpdateTradeInput
): Promise<Trade | null> {
  const db = await getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const mappings: Record<string, unknown> = {
    external_id: data.externalId,
    broker: data.broker,
    broker_id: data.brokerId,
    account_id: data.accountId,
    trading_account_id: data.tradingAccountId,
    platform: data.platform,
    source: data.source,
    import_id: data.importId,
    symbol: data.symbol,
    side: data.side,
    status: data.status,
    opened_at: data.openedAt,
    closed_at: data.closedAt,
    entry_price: data.entryPrice,
    exit_price: data.exitPrice,
    stop_loss: data.stopLoss,
    take_profit: data.takeProfit,
    volume: data.volume,
    commission: data.commission,
    swap: data.swap,
    fees: data.fees,
    gross_pnl: data.grossPnl,
    net_pnl: data.netPnl,
    currency: data.currency,
    risk_amount: data.riskAmount,
    reward_amount: data.rewardAmount,
    risk_reward_ratio: data.riskRewardRatio,
    strategy_id: data.strategyId,
  };

  for (const [col, val] of Object.entries(mappings)) {
    if (val !== undefined) {
      fields.push(`${col} = $${idx++}`);
      params.push(val ?? null);
    }
  }

  if (fields.length === 0) return findTradeById(id);

  params.push(id);
  await withDatabaseBusyRetry(
    () =>
      db.execute(
        `UPDATE trades SET ${fields.join(", ")} WHERE id = $${idx}`,
        params,
      ),
    { operationName: "updateTradeById" },
  );
  return withDatabaseBusyRetry(
    () => findTradeById(id),
    { operationName: "findTradeById apres update" },
  );
}

// ------------------------------------------------------------
// DELETE
// ------------------------------------------------------------

/**
 * Supprime un trade.
 * Les enregistrements liés (notes, screenshots, tags…) sont supprimés
 * via ON DELETE CASCADE (PRAGMA foreign_keys = ON requis).
 */
export async function deleteTradeById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM trades WHERE id = $1",
    [id]
  );
  return result.rowsAffected > 0;
}
