// ============================================================
// Repository — Mistakes (CRUD + liaisons trade ↔ mistake)
// ============================================================
// Toutes les requêtes SQL sur `mistakes` et `trade_mistakes` passent ici.
// ============================================================

import { getDb } from "../services/database";
import type {
  Mistake,
  TradeMistake,
  CreateMistakeInput,
  AddMistakeToTradeInput,
} from "../types";

// ------------------------------------------------------------
// Types internes — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface MistakeRow {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

interface TradeMistakeRow {
  trade_id: number;
  mistake_id: number;
  notes: string | null;
  created_at: string;
}

function rowToMistake(row: MistakeRow): Mistake {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------
// CRUD Mistakes (catalogue)
// ------------------------------------------------------------

export async function insertMistake(data: CreateMistakeInput): Promise<Mistake> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO mistakes (name, description) VALUES ($1, $2)",
    [data.name, data.description ?? null]
  );
  const mistake = await findMistakeById(result.lastInsertId!);
  if (!mistake) throw new Error("Erreur créée introuvable");
  return mistake;
}

export async function findMistakeById(id: number): Promise<Mistake | null> {
  const db = await getDb();
  const rows = await db.select<MistakeRow[]>(
    "SELECT * FROM mistakes WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToMistake(rows[0]) : null;
}

export async function findMistakes(): Promise<Mistake[]> {
  const db = await getDb();
  const rows = await db.select<MistakeRow[]>(
    "SELECT * FROM mistakes ORDER BY name ASC"
  );
  return rows.map(rowToMistake);
}

export async function updateMistakeById(
  id: number,
  data: Partial<CreateMistakeInput>
): Promise<Mistake | null> {
  const db = await getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description ?? null); }

  if (fields.length === 0) return findMistakeById(id);

  params.push(id);
  await db.execute(
    `UPDATE mistakes SET ${fields.join(", ")} WHERE id = $${idx}`,
    params
  );
  return findMistakeById(id);
}

/**
 * Supprime une erreur du catalogue.
 * Les liaisons trade_mistakes associées sont supprimées via CASCADE.
 */
export async function deleteMistakeById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM mistakes WHERE id = $1",
    [id]
  );
  return result.rowsAffected > 0;
}

// ------------------------------------------------------------
// Liaisons trade ↔ mistake
// ------------------------------------------------------------

/** INSERT OR REPLACE : remplace si la même (trade, mistake) existe déjà. */
export async function upsertTradeMistake(data: AddMistakeToTradeInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO trade_mistakes (trade_id, mistake_id, notes)
     VALUES ($1, $2, $3)`,
    [data.tradeId, data.mistakeId, data.notes ?? null]
  );
}

export async function deleteTradeMistake(tradeId: number, mistakeId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM trade_mistakes WHERE trade_id = $1 AND mistake_id = $2",
    [tradeId, mistakeId]
  );
}

export async function findMistakesByTradeId(tradeId: number): Promise<TradeMistake[]> {
  const db = await getDb();
  const rows = await db.select<(TradeMistakeRow & { name: string })[]>(
    `SELECT tm.trade_id, tm.mistake_id, tm.notes, tm.created_at, m.name
     FROM trade_mistakes tm
     INNER JOIN mistakes m ON m.id = tm.mistake_id
     WHERE tm.trade_id = $1
     ORDER BY m.name ASC`,
    [tradeId]
  );
  return rows.map((r) => ({
    tradeId: r.trade_id,
    mistakeId: r.mistake_id,
    notes: r.notes,
    createdAt: r.created_at,
    mistakeName: r.name,
  }));
}

/**
 * Retourne toutes les liaisons trade ↔ erreur de la base de données.
 * Utilisé par les services analytics qui agrègent par habitudes.
 */
export async function findAllTradeMistakeMappings(): Promise<
  Array<{ tradeId: number; mistakeId: number }>
> {
  const db = await getDb();
  const rows = await db.select<Array<{ trade_id: number; mistake_id: number }>>(
    "SELECT trade_id, mistake_id FROM trade_mistakes"
  );
  return rows.map((r) => ({ tradeId: r.trade_id, mistakeId: r.mistake_id }));
}

/** Remplace toutes les erreurs d'un trade (supprime puis réinsère). */
export async function replaceMistakesByTradeId(
  tradeId: number,
  items: Array<{ mistakeId: number; notes?: string | null }>
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM trade_mistakes WHERE trade_id = $1",
    [tradeId]
  );
  for (const item of items) {
    await db.execute(
      "INSERT INTO trade_mistakes (trade_id, mistake_id, notes) VALUES ($1, $2, $3)",
      [tradeId, item.mistakeId, item.notes ?? null]
    );
  }
}
