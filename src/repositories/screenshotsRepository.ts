// ============================================================
// Repository — Trade Screenshots (métadonnées)
// ============================================================
// Toutes les requêtes SQL sur `trade_screenshots` passent par ce module.
// Le fichier physique sur le disque est géré par le service filesystem.
// ============================================================

import { getDb } from "../services/database";

// ------------------------------------------------------------
// Types publics exportés
// ------------------------------------------------------------

export interface TradeScreenshot {
  id: number;
  tradeId: number;
  filename: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  timeframe: string | null;
  label: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateScreenshotInput {
  tradeId: number;
  filename: string;
  filePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  timeframe?: string | null;
  label?: string | null;
  notes?: string | null;
}

// ------------------------------------------------------------
// Type interne — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface ScreenshotRow {
  id: number;
  trade_id: number;
  filename: string;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  timeframe: string | null;
  label: string | null;
  notes: string | null;
  created_at: string;
}

function rowToScreenshot(row: ScreenshotRow): TradeScreenshot {
  return {
    id: row.id,
    tradeId: row.trade_id,
    filename: row.filename,
    filePath: row.file_path ?? row.filename,
    fileName: row.file_name ?? row.filename.split(/[\\/]/).pop() ?? row.filename,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    timeframe: row.timeframe,
    label: row.label,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

export async function insertScreenshot(data: CreateScreenshotInput): Promise<TradeScreenshot> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO trade_screenshots (
       trade_id, filename, file_path, file_name, mime_type, file_size,
       timeframe, label, notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      data.tradeId,
      data.filename,
      data.filePath ?? data.filename,
      data.fileName ?? data.filename.split(/[\\/]/).pop() ?? data.filename,
      data.mimeType ?? null,
      data.fileSize ?? null,
      data.timeframe ?? null,
      data.label ?? null,
      data.notes ?? null,
    ]
  );
  const screenshot = await findScreenshotById(result.lastInsertId!);
  if (!screenshot) throw new Error("Screenshot créé introuvable");
  return screenshot;
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

export async function findScreenshotById(id: number): Promise<TradeScreenshot | null> {
  const db = await getDb();
  const rows = await db.select<ScreenshotRow[]>(
    "SELECT * FROM trade_screenshots WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToScreenshot(rows[0]) : null;
}

export async function findScreenshotsByTradeId(tradeId: number): Promise<TradeScreenshot[]> {
  const db = await getDb();
  const rows = await db.select<ScreenshotRow[]>(
    "SELECT * FROM trade_screenshots WHERE trade_id = $1 ORDER BY created_at ASC",
    [tradeId]
  );
  return rows.map(rowToScreenshot);
}

export async function findAllScreenshots(): Promise<TradeScreenshot[]> {
  const db = await getDb();
  const rows = await db.select<ScreenshotRow[]>(
    "SELECT * FROM trade_screenshots ORDER BY created_at ASC"
  );
  return rows.map(rowToScreenshot);
}

// ------------------------------------------------------------
// UPDATE
// ------------------------------------------------------------

export async function updateScreenshotById(
  id: number,
  data: Partial<Pick<CreateScreenshotInput, "timeframe" | "label" | "notes">>
): Promise<TradeScreenshot | null> {
  const db = await getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.timeframe !== undefined) { fields.push(`timeframe = $${idx++}`); params.push(data.timeframe ?? null); }
  if (data.label !== undefined) { fields.push(`label = $${idx++}`); params.push(data.label ?? null); }
  if (data.notes !== undefined) { fields.push(`notes = $${idx++}`); params.push(data.notes ?? null); }

  if (fields.length === 0) return findScreenshotById(id);

  params.push(id);
  await db.execute(
    `UPDATE trade_screenshots SET ${fields.join(", ")} WHERE id = $${idx}`,
    params
  );
  return findScreenshotById(id);
}

// ------------------------------------------------------------
// DELETE
// ------------------------------------------------------------

export async function deleteScreenshotById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM trade_screenshots WHERE id = $1",
    [id]
  );
  return result.rowsAffected > 0;
}
