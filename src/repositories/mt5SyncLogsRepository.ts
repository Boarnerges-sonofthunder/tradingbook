// ============================================================
// Repository - MT5 Sync Logs
// ============================================================
// Toutes les requetes SQL sur `mt5_sync_logs` passent par ce module.
//
// La table est enrichie par la migration 006 pour conserver un historique
// local lisible de chaque synchronisation MT5. Ces logs fonctionnels ne
// remplacent pas les logs techniques fichier geres par src/services/logging.
// ============================================================

import { getDb } from "../services/database";

// ------------------------------------------------------------
// Types internes - colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface SyncLogRow {
  id: number;
  data_path: string | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  account_id: string | null;
  trading_account_id: number | null;
  broker: string | null;
  broker_id: number | null;
  server: string | null;
  trades_read: number;
  trades_added: number;
  trades_updated: number;
  duplicates_ignored: number;
  probable_duplicates: number;
  invalid_trades: number;
  error_message: string | null;
  created_at: string;
}

// ------------------------------------------------------------
// Types publics
// ------------------------------------------------------------

export type MT5SyncLogStatus =
  | "running"
  | "success"
  | "partial_success"
  | "failed"
  | "cancelled";

export interface MT5SyncLog {
  id: number;
  dataPath: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: MT5SyncLogStatus;
  accountId: string | null;
  tradingAccountId: number | null;
  broker: string | null;
  brokerId: number | null;
  server: string | null;
  tradesRead: number;
  tradesAdded: number;
  tradesUpdated: number;
  duplicatesIgnored: number;
  probableDuplicates: number;
  invalidTrades: number;
  errorMessage: string | null;
  createdAt: string;
}

/** Donnees d'entree pour creer un log de synchronisation. */
export interface CreateSyncLogInput {
  dataPath?: string | null;
  startedAt?: string;
  status?: MT5SyncLogStatus;
  accountId?: string | null;
  tradingAccountId?: number | null;
  broker?: string | null;
  brokerId?: number | null;
  server?: string | null;
}

/** Donnees pour terminer ou corriger un log existant. */
export interface UpdateSyncLogInput {
  dataPath?: string | null;
  startedAt?: string;
  finishedAt?: string | null;
  status?: MT5SyncLogStatus;
  accountId?: string | null;
  tradingAccountId?: number | null;
  broker?: string | null;
  brokerId?: number | null;
  server?: string | null;
  tradesRead?: number;
  tradesAdded?: number;
  tradesUpdated?: number;
  duplicatesIgnored?: number;
  probableDuplicates?: number;
  invalidTrades?: number;
  errorMessage?: string | null;
}

function rowToLog(row: SyncLogRow): MT5SyncLog {
  return {
    id: row.id,
    dataPath: row.data_path,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status as MT5SyncLogStatus,
    accountId: row.account_id,
    tradingAccountId: row.trading_account_id,
    broker: row.broker,
    brokerId: row.broker_id,
    server: row.server,
    tradesRead: row.trades_read,
    tradesAdded: row.trades_added,
    tradesUpdated: row.trades_updated,
    duplicatesIgnored: row.duplicates_ignored,
    probableDuplicates: row.probable_duplicates,
    invalidTrades: row.invalid_trades,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

/**
 * Cree une entree `running` au demarrage d'une synchronisation MT5.
 * Les compteurs restent a zero jusqu'a l'appel a updateSyncLogById().
 */
export async function insertSyncLog(
  data: CreateSyncLogInput = {},
): Promise<MT5SyncLog> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO mt5_sync_logs
       (data_path, started_at, status, account_id, trading_account_id, broker, broker_id, server)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      data.dataPath ?? null,
      data.startedAt ?? new Date().toISOString(),
      data.status ?? "running",
      data.accountId ?? null,
      data.tradingAccountId ?? null,
      data.broker ?? null,
      data.brokerId ?? null,
      data.server ?? null,
    ],
  );

  const log = await findSyncLogById(result.lastInsertId!);
  if (!log) throw new Error("Log de synchronisation MT5 cree introuvable");
  return log;
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

export async function findSyncLogById(id: number): Promise<MT5SyncLog | null> {
  const db = await getDb();
  const rows = await db.select<SyncLogRow[]>(
    "SELECT * FROM mt5_sync_logs WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToLog(rows[0]) : null;
}

export async function findRecentSyncLogs(limit = 20): Promise<MT5SyncLog[]> {
  const db = await getDb();
  const rows = await db.select<SyncLogRow[]>(
    `SELECT * FROM mt5_sync_logs
     ORDER BY started_at DESC, id DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map(rowToLog);
}

export async function findLastSyncLog(): Promise<MT5SyncLog | null> {
  const rows = await findRecentSyncLogs(1);
  return rows[0] ?? null;
}

export async function findLastSuccessfulSync(): Promise<MT5SyncLog | null> {
  const db = await getDb();
  const rows = await db.select<SyncLogRow[]>(
    `SELECT * FROM mt5_sync_logs
     WHERE status = 'success'
     ORDER BY finished_at DESC, started_at DESC, id DESC
     LIMIT 1`,
  );
  return rows[0] ? rowToLog(rows[0]) : null;
}

// ------------------------------------------------------------
// UPDATE
// ------------------------------------------------------------

export async function updateSyncLogById(
  id: number,
  data: UpdateSyncLogInput,
): Promise<MT5SyncLog | null> {
  const db = await getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const mappings: Record<string, unknown> = {
    data_path: data.dataPath,
    started_at: data.startedAt,
    finished_at: data.finishedAt,
    status: data.status,
    account_id: data.accountId,
    trading_account_id: data.tradingAccountId,
    broker: data.broker,
    broker_id: data.brokerId,
    server: data.server,
    trades_read: data.tradesRead,
    trades_added: data.tradesAdded,
    trades_updated: data.tradesUpdated,
    duplicates_ignored: data.duplicatesIgnored,
    probable_duplicates: data.probableDuplicates,
    invalid_trades: data.invalidTrades,
    error_message: data.errorMessage,
  };

  for (const [col, val] of Object.entries(mappings)) {
    if (val !== undefined) {
      fields.push(`${col} = $${idx++}`);
      params.push(val ?? null);
    }
  }

  if (fields.length === 0) return findSyncLogById(id);

  params.push(id);
  await db.execute(
    `UPDATE mt5_sync_logs SET ${fields.join(", ")} WHERE id = $${idx}`,
    params,
  );
  return findSyncLogById(id);
}
