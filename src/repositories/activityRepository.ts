// ============================================================
// Repository — Historique d'activité des trades
// ============================================================
// Toutes les requêtes SQL sur `trade_activity_logs` passent ici.
// ============================================================

import { getDb } from "../services/database";
import type {
  TradeActivityLog,
  LogActivityInput,
} from "../types";

// ------------------------------------------------------------
// Type interne — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface ActivityRow {
  id: number;
  trade_id: number;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  description: string;
  created_at: string;
}

function rowToLog(row: ActivityRow): TradeActivityLog {
  return {
    id: row.id,
    tradeId: row.trade_id,
    action: row.action as TradeActivityLog["action"],
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    description: row.description,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

/**
 * Insère une nouvelle entrée dans l'historique.
 * Appelé exclusivement depuis activityService — jamais directement
 * depuis les composants React.
 */
export async function insertActivityLog(
  input: LogActivityInput
): Promise<TradeActivityLog> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO trade_activity_logs
       (trade_id, action, field_name, old_value, new_value, description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.tradeId,
      input.action,
      input.fieldName ?? null,
      input.oldValue ?? null,
      input.newValue ?? null,
      input.description,
    ]
  );
  const log = await findActivityLogById(result.lastInsertId!);
  if (!log) throw new Error("Log d'activité créé introuvable");
  return log;
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

/** Retourne une entrée par son ID. */
export async function findActivityLogById(
  id: number
): Promise<TradeActivityLog | null> {
  const db = await getDb();
  const rows = await db.select<ActivityRow[]>(
    "SELECT * FROM trade_activity_logs WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToLog(rows[0]) : null;
}

/**
 * Retourne l'historique d'un trade, trié du plus récent au plus ancien.
 * @param tradeId  Identifiant du trade.
 * @param limit    Nombre maximum d'entrées (défaut : 200).
 */
export async function findActivityByTradeId(
  tradeId: number,
  limit = 200
): Promise<TradeActivityLog[]> {
  const db = await getDb();
  const rows = await db.select<ActivityRow[]>(
    `SELECT * FROM trade_activity_logs
     WHERE trade_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tradeId, limit]
  );
  return rows.map(rowToLog);
}

// ------------------------------------------------------------
// DELETE (utilitaire maintenance)
// ------------------------------------------------------------

/**
 * Supprime tous les logs d'un trade.
 * En pratique, ON DELETE CASCADE s'en charge automatiquement lors
 * de la suppression du trade. Cette fonction est fournie pour un
 * éventuel usage de nettoyage manuel.
 */
export async function deleteActivityByTradeId(tradeId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM trade_activity_logs WHERE trade_id = $1",
    [tradeId]
  );
}
