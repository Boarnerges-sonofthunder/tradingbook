// Point d'entrée centralisé pour le service base de données.
// Tous les accès SQLite dans l'application passent par ce module.
//
// Utilisation :
//   import { getDb, initDatabase, checkConnection } from "../services/database";

export { getDb, closeDb, getDatabaseFilePath } from "./client";
export { initDatabase, checkConnection, getSchemaVersion } from "./database";
export {
  MIGRATIONS_REGISTRY,
  getAppliedMigrations,
  getCurrentMigrationVersion,
} from "./migrations";
export { isDatabaseLockedError, withDatabaseBusyRetry } from "./sqliteRetry";
export type { MigrationEntry } from "./migrations";
