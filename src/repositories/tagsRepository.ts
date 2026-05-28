// ============================================================
// Repository — Tags (CRUD + liaisons trade ↔ tag)
// ============================================================
// Toutes les requêtes SQL sur `tags` et `trade_tags` passent ici.
// ============================================================

import { getDb } from "../services/database";
import type { Tag, TradeTag, CreateTagInput } from "../types";

// ------------------------------------------------------------
// Types internes — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface TagRow {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

interface TradeTagRow {
  trade_id: number;
  tag_id: number;
  created_at: string;
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------
// CRUD Tags
// ------------------------------------------------------------

export async function insertTag(data: CreateTagInput): Promise<Tag> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO tags (name, color) VALUES ($1, $2)",
    [data.name, data.color ?? "#6366f1"]
  );
  const tag = await findTagById(result.lastInsertId!);
  if (!tag) throw new Error("Tag créé introuvable");
  return tag;
}

export async function findTagById(id: number): Promise<Tag | null> {
  const db = await getDb();
  const rows = await db.select<TagRow[]>(
    "SELECT * FROM tags WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToTag(rows[0]) : null;
}

export async function findTags(): Promise<Tag[]> {
  const db = await getDb();
  const rows = await db.select<TagRow[]>(
    "SELECT * FROM tags ORDER BY name ASC"
  );
  return rows.map(rowToTag);
}

export async function updateTagById(
  id: number,
  data: Partial<CreateTagInput>
): Promise<Tag | null> {
  const db = await getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
  if (data.color !== undefined) { fields.push(`color = $${idx++}`); params.push(data.color); }

  if (fields.length === 0) return findTagById(id);

  params.push(id);
  await db.execute(
    `UPDATE tags SET ${fields.join(", ")} WHERE id = $${idx}`,
    params
  );
  return findTagById(id);
}

/**
 * Supprime un tag.
 * Les liaisons trade_tags associées sont supprimées via ON DELETE CASCADE.
 */
export async function deleteTagById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM tags WHERE id = $1",
    [id]
  );
  return result.rowsAffected > 0;
}

// ------------------------------------------------------------
// Liaisons trade ↔ tag
// ------------------------------------------------------------

/** Associe un tag à un trade. Idempotent (INSERT OR IGNORE). */
export async function insertTradeTag(tradeId: number, tagId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES ($1, $2)",
    [tradeId, tagId]
  );
}

/** Retire l'association entre un trade et un tag. */
export async function deleteTradeTag(tradeId: number, tagId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM trade_tags WHERE trade_id = $1 AND tag_id = $2",
    [tradeId, tagId]
  );
}

/** Retourne tous les tags associés à un trade. */
export async function findTagsByTradeId(tradeId: number): Promise<Tag[]> {
  const db = await getDb();
  const rows = await db.select<TagRow[]>(
    `SELECT t.* FROM tags t
     INNER JOIN trade_tags tt ON tt.tag_id = t.id
     WHERE tt.trade_id = $1
     ORDER BY t.name ASC`,
    [tradeId]
  );
  return rows.map(rowToTag);
}

/** Remplace tous les tags d'un trade (supprime puis réinsère). */
export async function replaceTradeTagsByTradeId(tradeId: number, tagIds: number[]): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM trade_tags WHERE trade_id = $1",
    [tradeId]
  );
  for (const tagId of tagIds) {
    await db.execute(
      "INSERT INTO trade_tags (trade_id, tag_id) VALUES ($1, $2)",
      [tradeId, tagId]
    );
  }
}

/** Retourne les liaisons trade_tags d'un trade (avec tagName et tagColor). */
export async function findTradeTags(tradeId: number): Promise<TradeTag[]> {
  const db = await getDb();
  const rows = await db.select<(TradeTagRow & { name: string; color: string })[]>(
    `SELECT tt.trade_id, tt.tag_id, tt.created_at, t.name, t.color
     FROM trade_tags tt
     INNER JOIN tags t ON t.id = tt.tag_id
     WHERE tt.trade_id = $1`,
    [tradeId]
  );
  return rows.map((r) => ({
    tradeId: r.trade_id,
    tagId: r.tag_id,
    createdAt: r.created_at,
    tagName: r.name,
    tagColor: r.color,
  }));
}
