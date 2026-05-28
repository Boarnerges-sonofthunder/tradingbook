// ============================================================
// Repository — Strategies (CRUD)
// ============================================================
// Toutes les requêtes SQL sur `strategies` passent par ce module.
// ============================================================

import { getDb } from "../services/database";
import type { Strategy, StrategyFormData } from "../types";

// ------------------------------------------------------------
// Type interne — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface StrategyRow {
  id: number;
  name: string;
  description: string | null;
  rules: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToStrategy(row: StrategyRow): Strategy {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rules: row.rules,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

export async function insertStrategy(data: StrategyFormData): Promise<Strategy> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO strategies (name, description, rules, is_active)
     VALUES ($1, $2, $3, $4)`,
    [
      data.name,
      data.description ?? null,
      data.rules ?? null,
      data.isActive !== false ? 1 : 0,
    ]
  );
  const strategy = await findStrategyById(result.lastInsertId!);
  if (!strategy) throw new Error("Stratégie créée introuvable");
  return strategy;
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

export async function findStrategyById(id: number): Promise<Strategy | null> {
  const db = await getDb();
  const rows = await db.select<StrategyRow[]>(
    "SELECT * FROM strategies WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToStrategy(rows[0]) : null;
}

/** Retourne toutes les stratégies, actives en premier. */
export async function findStrategies(onlyActive = false): Promise<Strategy[]> {
  const db = await getDb();
  const where = onlyActive ? "WHERE is_active = 1" : "";
  const rows = await db.select<StrategyRow[]>(
    `SELECT * FROM strategies ${where} ORDER BY is_active DESC, name ASC`
  );
  return rows.map(rowToStrategy);
}

// ------------------------------------------------------------
// UPDATE
// ------------------------------------------------------------

export async function updateStrategyById(
  id: number,
  data: Partial<StrategyFormData>
): Promise<Strategy | null> {
  const db = await getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description ?? null); }
  if (data.rules !== undefined) { fields.push(`rules = $${idx++}`); params.push(data.rules ?? null); }
  if (data.isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(data.isActive ? 1 : 0); }

  if (fields.length === 0) return findStrategyById(id);

  params.push(id);
  await db.execute(
    `UPDATE strategies SET ${fields.join(", ")} WHERE id = $${idx}`,
    params
  );
  return findStrategyById(id);
}

// ------------------------------------------------------------
// DELETE
// ------------------------------------------------------------

/**
 * Supprime une stratégie.
 * Les trades liés auront strategy_id = NULL (ON DELETE SET NULL).
 */
export async function deleteStrategyById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM strategies WHERE id = $1",
    [id]
  );
  return result.rowsAffected > 0;
}
