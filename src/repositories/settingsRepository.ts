// ============================================================
// Repository — Settings (préférences utilisateur)
// ============================================================
// Modèle clé-valeur : table `settings` (key TEXT PK, value TEXT).
// Toutes les requêtes SQL sur `settings` passent par ce module.
// ============================================================

import { getDb } from "../services/database";

// ------------------------------------------------------------
// Type interne — colonnes SQLite
// ------------------------------------------------------------

interface SettingRow {
  key: string;
  value: string;
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

/** Lit la valeur brute d'une clé. Retourne null si absente. */
export async function findSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<SettingRow[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

/** Retourne toutes les entrées sous forme de Record<string, string>. */
export async function findAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select<SettingRow[]>(
    "SELECT key, value FROM settings"
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ------------------------------------------------------------
// WRITE
// ------------------------------------------------------------

/** Écrit ou remplace une valeur (UPSERT). */
export async function upsertSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}
