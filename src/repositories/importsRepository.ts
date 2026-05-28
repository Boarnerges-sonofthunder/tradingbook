// ============================================================
// Repository — Imports (sessions + lignes brutes)
// ============================================================
// Toutes les requêtes SQL sur `imports` et `import_rows` passent ici.
// ============================================================

import { getDb } from "../services/database";
import type {
  ImportSession,
  ImportRow,
  ImportSource,
  ImportStatus,
  ImportRowStatus,
  CreateImportInput,
} from "../types";

// ------------------------------------------------------------
// Types internes — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface ImportSessionRow {
  id: number;
  source: string;
  filename: string | null;
  broker: string | null;
  broker_id: number | null;
  account_id: string | null;
  trading_account_id: number | null;
  status: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_rows: number;
  warning_rows: number;
  file_size_bytes: number | null;
  imported_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface ImportRowRow {
  id: number;
  import_id: number;
  row_index: number;
  raw_data: string;
  status: string;
  trade_id: number | null;
  error_message: string | null;
  created_at: string;
}

function rowToSession(row: ImportSessionRow): ImportSession {
  return {
    id: row.id,
    source: row.source as ImportSource,
    filename: row.filename,
    broker: row.broker,
    brokerId: row.broker_id,
    accountId: row.account_id,
    tradingAccountId: row.trading_account_id,
    status: row.status as ImportStatus,
    totalRows: row.total_rows,
    importedRows: row.imported_rows,
    skippedRows: row.skipped_rows,
    errorRows: row.error_rows,
    warningRows: row.warning_rows ?? 0,
    fileSizeBytes: row.file_size_bytes ?? null,
    importedAt: row.imported_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function rowToImportRow(row: ImportRowRow): ImportRow {
  return {
    id: row.id,
    importId: row.import_id,
    rowIndex: row.row_index,
    rawData: row.raw_data,
    status: row.status as ImportRowStatus,
    tradeId: row.trade_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------
// Sessions d'import (table `imports`)
// ------------------------------------------------------------

export async function insertImportSession(data: CreateImportInput): Promise<ImportSession> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO imports (source, filename, broker, broker_id, account_id, trading_account_id, status, file_size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, 'analyzed', $7)`,
    [
      data.source,
      data.filename ?? null,
      data.broker ?? null,
      data.brokerId ?? null,
      data.accountId ?? null,
      data.tradingAccountId ?? null,
      data.fileSizeBytes ?? null,
    ]
  );
  const session = await findImportSessionById(result.lastInsertId!);
  if (!session) throw new Error("Session d'import créée introuvable");
  return session;
}

export async function findImportSessionById(id: number): Promise<ImportSession | null> {
  const db = await getDb();
  const rows = await db.select<ImportSessionRow[]>(
    "SELECT * FROM imports WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function findImportSessions(): Promise<ImportSession[]> {
  const db = await getDb();
  const rows = await db.select<ImportSessionRow[]>(
    "SELECT * FROM imports ORDER BY created_at DESC"
  );
  return rows.map(rowToSession);
}

export async function updateImportSessionById(
  id: number,
  data: {
    status?: ImportStatus;
    totalRows?: number;
    importedRows?: number;
    skippedRows?: number;
    errorRows?: number;
    warningRows?: number;
    fileSizeBytes?: number | null;
    importedAt?: string | null;
    errorMessage?: string | null;
    broker?: string | null;
    brokerId?: number | null;
    accountId?: string | null;
    tradingAccountId?: number | null;
  }
): Promise<ImportSession | null> {
  const db = await getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const map: Record<string, unknown> = {
    status: data.status,
    total_rows: data.totalRows,
    imported_rows: data.importedRows,
    skipped_rows: data.skippedRows,
    error_rows: data.errorRows,
    warning_rows: data.warningRows,
    file_size_bytes: data.fileSizeBytes,
    imported_at: data.importedAt,
    error_message: data.errorMessage,
    broker: data.broker,
    broker_id: data.brokerId,
    account_id: data.accountId,
    trading_account_id: data.tradingAccountId,
  };

  for (const [col, val] of Object.entries(map)) {
    if (val !== undefined) {
      fields.push(`${col} = $${idx++}`);
      params.push(val ?? null);
    }
  }

  if (fields.length === 0) return findImportSessionById(id);

  params.push(id);
  await db.execute(
    `UPDATE imports SET ${fields.join(", ")} WHERE id = $${idx}`,
    params
  );
  return findImportSessionById(id);
}

export async function deleteImportSessionById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM imports WHERE id = $1",
    [id]
  );
  return result.rowsAffected > 0;
}

// ------------------------------------------------------------
// Lignes brutes (table `import_rows`)
// ------------------------------------------------------------

export async function insertImportRow(
  importId: number,
  rowIndex: number,
  rawData: unknown
): Promise<ImportRow> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO import_rows (import_id, row_index, raw_data, status)
     VALUES ($1, $2, $3, 'pending')`,
    [importId, rowIndex, JSON.stringify(rawData)]
  );
  const row = await findImportRowById(result.lastInsertId!);
  if (!row) throw new Error("Ligne d'import créée introuvable");
  return row;
}

export async function findImportRowById(id: number): Promise<ImportRow | null> {
  const db = await getDb();
  const rows = await db.select<ImportRowRow[]>(
    "SELECT * FROM import_rows WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToImportRow(rows[0]) : null;
}

export async function findImportRowsBySessionId(importId: number): Promise<ImportRow[]> {
  const db = await getDb();
  const rows = await db.select<ImportRowRow[]>(
    "SELECT * FROM import_rows WHERE import_id = $1 ORDER BY row_index ASC",
    [importId]
  );
  return rows.map(rowToImportRow);
}

export async function updateImportRowStatus(
  id: number,
  status: ImportRowStatus,
  tradeId?: number | null,
  errorMessage?: string | null
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE import_rows SET status = $1, trade_id = $2, error_message = $3 WHERE id = $4`,
    [status, tradeId ?? null, errorMessage ?? null, id]
  );
}
