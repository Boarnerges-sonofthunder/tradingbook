import { getDb } from "./client";

// Type interne pour les lignes de app_metadata
interface MetadataRow {
  value: string;
}

/**
 * Initialise la connexion SQLite au démarrage de l'application.
 * Appeler cette fonction dans App.tsx (useEffect) pour :
 *   - déclencher le chargement du plugin tauri-plugin-sql
 *   - appliquer automatiquement toutes les migrations en attente
 *   - détecter toute erreur de base de données dès le lancement
 */
export async function initDatabase(): Promise<void> {
  await getDb();
}

/**
 * Vérifie que la connexion SQLite est opérationnelle.
 * Lit la version du schéma depuis app_metadata (créée par la migration 001).
 * Retourne true si la base répond correctement, false sinon.
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = await db.select<MetadataRow[]>(
      "SELECT value FROM app_metadata WHERE key = 'schema_version'"
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Retourne la version courante du schéma de la base de données.
 * Utile pour afficher des informations de diagnostic dans les paramètres.
 */
export async function getSchemaVersion(): Promise<string | null> {
  try {
    const db = await getDb();
    const rows = await db.select<MetadataRow[]>(
      "SELECT value FROM app_metadata WHERE key = 'schema_version'"
    );
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}
