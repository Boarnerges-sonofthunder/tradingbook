// Point d'entrée centralisé pour le service de logging.
// Tous les logs dans l'application passent par ce module.
//
// Utilisation :
//   import { logger, createLogger } from "../services/logging";
//   import type { LogLevel } from "../services/logging";

export { logger, createLogger, Logger } from "./logger";
export { formatMessage } from "./logFormatter";
export { LOG_LEVELS } from "./logLevels";
export {
  getTodayLogFilename,
  listLogFiles,
  readLogFile,
  writeLocalLog,
} from "./loggerService";
export type { LogLevel } from "./logLevels";
export type { LogFileInfo } from "./loggerService";
