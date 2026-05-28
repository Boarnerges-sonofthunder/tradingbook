// ============================================================
// Repository — Emotions (CRUD + liaisons trade ↔ emotion)
// ============================================================
// Toutes les requêtes SQL sur `emotions` et `trade_emotions` passent ici.
// ============================================================

import { getDb } from "../services/database";
import type {
  Emotion,
  TradeEmotion,
  EmotionPhase,
  CreateEmotionInput,
  AddEmotionToTradeInput,
} from "../types";

// ------------------------------------------------------------
// Types internes — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface EmotionRow {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

interface TradeEmotionRow {
  trade_id: number;
  emotion_id: number;
  intensity: number;
  phase: string;
  created_at: string;
}

function rowToEmotion(row: EmotionRow): Emotion {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------
// CRUD Emotions (catalogue)
// ------------------------------------------------------------

export async function insertEmotion(data: CreateEmotionInput): Promise<Emotion> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO emotions (name, description) VALUES ($1, $2)",
    [data.name, data.description ?? null]
  );
  const emotion = await findEmotionById(result.lastInsertId!);
  if (!emotion) throw new Error("Émotion créée introuvable");
  return emotion;
}

export async function findEmotionById(id: number): Promise<Emotion | null> {
  const db = await getDb();
  const rows = await db.select<EmotionRow[]>(
    "SELECT * FROM emotions WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToEmotion(rows[0]) : null;
}

export async function findEmotions(): Promise<Emotion[]> {
  const db = await getDb();
  const rows = await db.select<EmotionRow[]>(
    "SELECT * FROM emotions ORDER BY name ASC"
  );
  return rows.map(rowToEmotion);
}

export async function updateEmotionById(
  id: number,
  data: Partial<CreateEmotionInput>
): Promise<Emotion | null> {
  const db = await getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description ?? null); }

  if (fields.length === 0) return findEmotionById(id);

  params.push(id);
  await db.execute(
    `UPDATE emotions SET ${fields.join(", ")} WHERE id = $${idx}`,
    params
  );
  return findEmotionById(id);
}

/** Supprime une émotion. Les liaisons trade_emotions sont supprimées via CASCADE. */
export async function deleteEmotionById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM emotions WHERE id = $1",
    [id]
  );
  return result.rowsAffected > 0;
}

// ------------------------------------------------------------
// Liaisons trade ↔ emotion
// ------------------------------------------------------------

/**
 * INSERT OR REPLACE : remplace si la même (trade, emotion, phase) existe déjà.
 */
export async function upsertTradeEmotion(data: AddEmotionToTradeInput): Promise<void> {
  const db = await getDb();
  const phase: EmotionPhase = data.phase ?? "during";
  const intensity = data.intensity ?? 3;
  await db.execute(
    `INSERT OR REPLACE INTO trade_emotions (trade_id, emotion_id, intensity, phase)
     VALUES ($1, $2, $3, $4)`,
    [data.tradeId, data.emotionId, intensity, phase]
  );
}

export async function deleteTradeEmotion(
  tradeId: number,
  emotionId: number,
  phase: EmotionPhase = "during"
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM trade_emotions WHERE trade_id = $1 AND emotion_id = $2 AND phase = $3",
    [tradeId, emotionId, phase]
  );
}

export async function findEmotionsByTradeId(tradeId: number): Promise<TradeEmotion[]> {
  const db = await getDb();
  const rows = await db.select<(TradeEmotionRow & { name: string })[]>(
    `SELECT te.trade_id, te.emotion_id, te.intensity, te.phase, te.created_at, e.name
     FROM trade_emotions te
     INNER JOIN emotions e ON e.id = te.emotion_id
     WHERE te.trade_id = $1
     ORDER BY te.phase ASC, e.name ASC`,
    [tradeId]
  );
  return rows.map((r) => ({
    tradeId: r.trade_id,
    emotionId: r.emotion_id,
    intensity: r.intensity,
    phase: r.phase as EmotionPhase,
    createdAt: r.created_at,
    emotionName: r.name,
  }));
}

/**
 * Retourne toutes les liaisons trade ↔ émotion de la base de données.
 * Utilisé par l'analytics service pour grouper les trades fermés par émotion.
 * Pas de filtre ici : le service filtre ensuite sur les trades fermés.
 */
export async function findAllTradeEmotionMappings(): Promise<
  Array<{ tradeId: number; emotionId: number }>
> {
  const db = await getDb();
  const rows = await db.select<Array<{ trade_id: number; emotion_id: number }>>(
    "SELECT trade_id, emotion_id FROM trade_emotions"
  );
  return rows.map((r) => ({ tradeId: r.trade_id, emotionId: r.emotion_id }));
}

/** Remplace toutes les émotions d'un trade (supprime puis réinsère). */
export async function replaceEmotionsByTradeId(
  tradeId: number,
  items: Array<{ emotionId: number; intensity?: number; phase?: EmotionPhase }>
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM trade_emotions WHERE trade_id = $1",
    [tradeId]
  );
  for (const item of items) {
    await db.execute(
      "INSERT INTO trade_emotions (trade_id, emotion_id, intensity, phase) VALUES ($1, $2, $3, $4)",
      [tradeId, item.emotionId, item.intensity ?? 3, item.phase ?? "during"]
    );
  }
}
