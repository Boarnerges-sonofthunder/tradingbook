// ============================================================
// Repository — Trade Notes
// ============================================================
// Toutes les requêtes SQL sur `trade_notes` passent par ce module.
// Aucune validation métier ici — c'est le rôle des services.
// ============================================================

import { getDb } from "../services/database";

// ------------------------------------------------------------
// Type public exporté (utilisé par notesService et consommateurs)
// ------------------------------------------------------------

export interface TradeNote {
  id: number;
  tradeId: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface TradeNoteContext {
  tradeId: number;
  tradeSymbol: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// ------------------------------------------------------------
// Type interne — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface NoteRow {
  id: number;
  trade_id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

function rowToNote(row: NoteRow): TradeNote {
  return {
    id: row.id,
    tradeId: row.trade_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

export async function insertNote(tradeId: number, content: string): Promise<TradeNote> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO trade_notes (trade_id, content) VALUES ($1, $2)",
    [tradeId, content]
  );
  const note = await findNoteById(result.lastInsertId!);
  if (!note) throw new Error("Note créée introuvable");
  return note;
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

export async function findNoteById(id: number): Promise<TradeNote | null> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    "SELECT * FROM trade_notes WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToNote(rows[0]) : null;
}

export async function findNotesByTradeId(tradeId: number): Promise<TradeNote[]> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    "SELECT * FROM trade_notes WHERE trade_id = $1 ORDER BY created_at ASC",
    [tradeId]
  );
  return rows.map(rowToNote);
}

export async function findRecentNotesWithTradeContext(
  limit = 25,
): Promise<TradeNoteContext[]> {
  const db = await getDb();
  const rows = await db.select<
    Array<NoteRow & { symbol: string }>
  >(
    `SELECT n.*, t.symbol
     FROM trade_notes n
     INNER JOIN trades t ON t.id = n.trade_id
     ORDER BY n.updated_at DESC
     LIMIT $1`,
    [limit]
  );

  return rows.map((row) => ({
    tradeId: row.trade_id,
    tradeSymbol: row.symbol,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ------------------------------------------------------------
// UPDATE
// ------------------------------------------------------------

export async function updateNoteById(id: number, content: string): Promise<TradeNote | null> {
  const db = await getDb();
  await db.execute(
    "UPDATE trade_notes SET content = $1 WHERE id = $2",
    [content, id]
  );
  return findNoteById(id);
}

// ------------------------------------------------------------
// DELETE
// ------------------------------------------------------------

export async function deleteNoteById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM trade_notes WHERE id = $1",
    [id]
  );
  return result.rowsAffected > 0;
}

export async function deleteNotesByTradeId(tradeId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM trade_notes WHERE trade_id = $1",
    [tradeId]
  );
}
