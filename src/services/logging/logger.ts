// ============================================================
// Logger principal — TradingBook
// ============================================================
// Wrapper TypeScript autour de @tauri-apps/plugin-log.
// Les messages sont transmis via IPC au backend Rust, qui les
// écrit dans le fichier local ET les transmet à la webview.
//
// Utilisation recommandée :
//   import { logger } from "../services/logging";
//   logger.info("Application démarrée");
//
//   import { createLogger } from "../services/logging";
//   const dbLogger = createLogger("database");
//   dbLogger.error("Erreur de connexion", error);
//
// ⚠️  Les méthodes sont synchrones côté appel (fire-and-forget).
//     L'écriture dans le fichier est asynchrone mais non bloquante.
// ============================================================

import {
  debug as tauriDebug,
  info as tauriInfo,
  warn as tauriWarn,
  error as tauriError,
} from "@tauri-apps/plugin-log";
import { formatMessage } from "./logFormatter";
import { writeLocalLog } from "./loggerService";

// ------------------------------------------------------------
// Classe Logger contextualisée
// ------------------------------------------------------------

/**
 * Logger contextualisé par module.
 * Préfixe automatiquement chaque message avec le nom du contexte.
 *
 * @example
 * const log = new Logger("import");
 * log.warn("Fichier CSV ignoré : format inconnu", { file: "data.csv" });
 */
export class Logger {
  constructor(private readonly context: string) {}

  /**
   * Log de débogage — détails techniques fins.
   * Visible uniquement si le niveau de log est DEBUG (développement).
   * Ne pas inclure en production sans raison.
   */
  debug(message: string, data?: unknown): void {
    writeLocalLog("debug", this.context, message, data);
    tauriDebug(formatMessage(this.context, message, data)).catch(() => {});
  }

  /**
   * Log informatif — déroulement normal attendu.
   * Ex : "Application démarrée", "Migration appliquée", "Dossiers créés"
   */
  info(message: string, data?: unknown): void {
    writeLocalLog("info", this.context, message, data);
    tauriInfo(formatMessage(this.context, message, data)).catch(() => {});
  }

  /**
   * Avertissement — situation anormale mais récupérable.
   * Ex : "Fichier CSV ignoré", "Paramètre manquant remplacé par défaut"
   */
  warn(message: string, data?: unknown): void {
    writeLocalLog("warn", this.context, message, data);
    tauriWarn(formatMessage(this.context, message, data)).catch(() => {});
  }

  /**
   * Erreur critique — échec d'une opération importante.
   * Ex : "Erreur SQLite", "Migration échouée", "Import impossible"
   * Toujours passer l'objet Error en second paramètre si disponible.
   */
  error(message: string, err?: unknown): void {
    writeLocalLog("error", this.context, message, err);
    tauriError(formatMessage(this.context, message, err)).catch(() => {});
  }
}

// ------------------------------------------------------------
// API publique
// ------------------------------------------------------------

/**
 * Logger par défaut — contexte "app".
 * À utiliser pour les messages généraux non liés à un module précis.
 */
export const logger = new Logger("app");

/**
 * Crée un logger contextualisé pour un module ou service donné.
 * Préférer cette fonction pour isoler les logs par domaine.
 *
 * @param context  Identifiant du module (ex : "database", "import", "mt5", "analytics")
 *
 * @example
 * // Dans database/client.ts :
 * const log = createLogger("database");
 * log.info("Connexion SQLite établie");
 *
 * // Dans features/imports :
 * const log = createLogger("import");
 * log.warn("Fichier ignoré : format inconnu", { filename });
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
