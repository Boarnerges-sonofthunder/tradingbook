// Point d'entrée centralisé pour le service système de fichiers.
// Tous les accès fichiers dans l'application passent par ce module.
//
// Utilisation :
//   import { initAppFolders, getFolderPath, FOLDER_NAMES } from "../services/filesystem";

export {
  initAppFolders,
  ensureAppFolder,
  folderExists,
  getAppLocalDataDir,
  getFolderPath,
  getFolderItemPath,
  getFilePath,
  getScreenshotsFolderPath,
  getImportsFolderPath,
  getExportsFolderPath,
  getAIExportsFolderPath,
  getBackupsFolderPath,
  getLogsFolderPath,
  getTempFolderPath,
  getScreenshotFilePath,
  getImportFilePath,
  getExportFilePath,
  getAIExportFilePath,
  getBackupFilePath,
  getLogFilePath,
  getTempFilePath,
  getStandardFolderPaths,
  FOLDER_NAMES,
  APP_FOLDERS,
} from "./fileSystemService";

export type { AppFolder } from "./fileSystemService";
