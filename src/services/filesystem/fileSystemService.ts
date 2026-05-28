// ============================================================
// FileSystem Service — TradingBook
// ============================================================
// Façade principale du service système de fichiers.
// Regroupe les opérations de haut niveau utilisées par le reste
// de l'application. Les composants React n'importent jamais
// directement depuis paths.ts ou folders.ts.
//
// Architecture :
//   paths.ts          → résolution de chemins (IPC Tauri)
//   folders.ts        → création / vérification de dossiers
//   fileSystemService → façade de haut niveau (ce fichier)
//
// Comment SQLite référence les fichiers :
//   - Les colonnes de type TEXT stockeront le nom du fichier
//     (ex : "trade_001.png") ou un chemin relatif au dossier.
//   - Le chemin absolu est reconstruit à la volée via getFolderPath().
//   - Cela évite de stocker des chemins absolus dépendants de la machine.
//
// Exemple :
//   // En base : screenshot_filename = "2024-01-15_EURUSD.png"
//   const fullPath = await getFilePath("screenshots", screenshot_filename);
// ============================================================

export {
  // Initialisation
  initAppFolders,
  ensureAppFolder,
  folderExists,
} from "./folders";

export {
  // Chemins
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
} from "./paths";

export type { AppFolder } from "./paths";
