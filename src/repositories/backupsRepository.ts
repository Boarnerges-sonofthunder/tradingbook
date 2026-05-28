// ============================================================
// Repository — Backups (métadonnées)
// ============================================================
// Toutes les requêtes SQL sur `backups` passent par ce module.
// Le fichier physique .db est géré par le service filesystem.
// ============================================================

import { getDb } from "../services/database";
import type { Backup, BackupTrigger, CreateBackupInput } from "../types";

// ------------------------------------------------------------
// Type interne — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface BackupRow {
  id: number;
  filename: string;
  size_bytes: number | null;
  trigger: string;
  created_at: string;
}

function rowToBackup(row: BackupRow): Backup {
  return {
    id: row.id,
    filename: row.filename,
    sizeBytes: row.size_bytes,
    trigger: row.trigger as BackupTrigger,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

export async function insertBackup(data: CreateBackupInput): Promise<Backup> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO backups (filename, size_bytes, trigger) VALUES ($1, $2, $3)",
    [data.filename, data.sizeBytes ?? null, data.trigger ?? "manual"]
  );
  const backup = await findBackupById(result.lastInsertId!);
  if (!backup) throw new Error("Backup enregistré introuvable");
  return backup;
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

export async function findBackupById(id: number): Promise<Backup | null> {
  const db = await getDb();
  const rows = await db.select<BackupRow[]>(
    "SELECT * FROM backups WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToBackup(rows[0]) : null;
}

export async function findBackups(): Promise<Backup[]> {
  const db = await getDb();
  const rows = await db.select<BackupRow[]>(
    "SELECT * FROM backups ORDER BY created_at DESC"
  );
  return rows.map(rowToBackup);
}

export async function findLatestBackup(): Promise<Backup | null> {
  const db = await getDb();
  const rows = await db.select<BackupRow[]>(
    "SELECT * FROM backups ORDER BY created_at DESC LIMIT 1"
  );
  return rows[0] ? rowToBackup(rows[0]) : null;
}

export async function findLatestBackupByTrigger(
  trigger: BackupTrigger,
): Promise<Backup | null> {
  const db = await getDb();
  const rows = await db.select<BackupRow[]>(
    "SELECT * FROM backups WHERE trigger = $1 ORDER BY created_at DESC LIMIT 1",
    [trigger],
  );
  return rows[0] ? rowToBackup(rows[0]) : null;
}

export async function findBackupsByTrigger(trigger: BackupTrigger): Promise<Backup[]> {
  const db = await getDb();
  const rows = await db.select<BackupRow[]>(
    "SELECT * FROM backups WHERE trigger = $1 ORDER BY created_at DESC",
    [trigger],
  );
  return rows.map(rowToBackup);
}

// ------------------------------------------------------------
// DELETE
// ------------------------------------------------------------

export async function deleteBackupById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM backups WHERE id = $1",
    [id]
  );
  return result.rowsAffected > 0;
}

/** Supprime les backups créés avant la date ISO fournie. Retourne le nombre supprimé. */
export async function deleteBackupsBefore(cutoffIso: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM backups WHERE created_at < $1",
    [cutoffIso]
  );
  return result.rowsAffected;
}
