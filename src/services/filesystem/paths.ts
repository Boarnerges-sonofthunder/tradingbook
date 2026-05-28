// ============================================================
// Chemins locaux — TradingBook (paths.ts)
// ============================================================
// Fournit les chemins résolus vers les dossiers applicatifs.
// Tous les chemins sont construits à partir du répertoire
// de données local de l'application (appLocalDataDir) fourni
// par Tauri, qui sur Windows correspond à :
//   %LOCALAPPDATA%\com.tradingbook.app\
//
// Les fichiers physiques (screenshots, CSV…) y sont stockés.
// SQLite conserve uniquement les chemins relatifs ou noms de fichiers.
// ============================================================

import { appLocalDataDir, join } from "@tauri-apps/api/path";

// ------------------------------------------------------------
// Dossiers applicatifs
// ------------------------------------------------------------

/** Identifiants des dossiers gérés par l'application. */
export const FOLDER_NAMES = {
  /** Captures d'écran des trades. */
  SCREENSHOTS: "screenshots",
  /** Fichiers CSV/données importés. */
  IMPORTS: "imports",
  /** Fichiers exportés (CSV, PDF…). */
  EXPORTS: "exports",
  /** Exports analytics sanitizes pour assistant IA. */
  AI_EXPORTS: "ai_exports",
  /** Sauvegardes de la base de données. */
  BACKUPS: "backups",
  /** Fichiers de log applicatif. */
  LOGS: "logs",
  /** Fichiers temporaires (supprimés au démarrage si nécessaire). */
  TEMP: "temp",
} as const;

/** Union des noms de dossiers valides. */
export type AppFolder = (typeof FOLDER_NAMES)[keyof typeof FOLDER_NAMES];

/** Liste canonique des dossiers crees au demarrage. */
export const APP_FOLDERS = Object.values(FOLDER_NAMES) as AppFolder[];

// ------------------------------------------------------------
// Résolution de chemins
// ------------------------------------------------------------

// Cache en mémoire — évite des appels IPC répétés vers Tauri.
let _baseDir: string | null = null;

/**
 * Résout et met en cache le répertoire de données local de l'application.
 * Windows  : %LOCALAPPDATA%\com.tradingbook.app\
 * macOS    : ~/Library/Application Support/com.tradingbook.app/
 * Linux    : ~/.local/share/com.tradingbook.app/
 */
async function resolveBaseDir(): Promise<string> {
  if (!_baseDir) {
    _baseDir = await appLocalDataDir();
  }
  return _baseDir;
}

/**
 * Retourne le répertoire de données local de l'application.
 */
export async function getAppLocalDataDir(): Promise<string> {
  return resolveBaseDir();
}

/**
 * Retourne le chemin absolu d'un dossier applicatif.
 *
 * @example
 * // Windows → "C:\Users\...\AppData\Local\com.tradingbook.app\screenshots"
 * const screenshotsPath = await getFolderPath("screenshots");
 */
export async function getFolderPath(folder: AppFolder): Promise<string> {
  const base = await resolveBaseDir();
  return join(base, folder);
}

/**
 * Retourne un chemin sous un dossier applicatif.
 * Les segments restent relatifs au dossier cible afin de ne jamais exposer de
 * logique de chemin systeme aux composants React.
 */
export async function getFolderItemPath(
  folder: AppFolder,
  ...segments: string[]
): Promise<string> {
  const folderPath = await getFolderPath(folder);
  return join(folderPath, ...segments);
}

/**
 * Retourne un chemin de fichier dans un dossier applicatif.
 * Utile pour construire le chemin d'un fichier à stocker.
 *
 * @example
 * const filePath = await getFilePath("screenshots", "trade_001.png");
 */
export async function getFilePath(
  folder: AppFolder,
  filename: string
): Promise<string> {
  return getFolderItemPath(folder, filename);
}

export const getScreenshotsFolderPath = (): Promise<string> =>
  getFolderPath(FOLDER_NAMES.SCREENSHOTS);

export const getImportsFolderPath = (): Promise<string> =>
  getFolderPath(FOLDER_NAMES.IMPORTS);

export const getExportsFolderPath = (): Promise<string> =>
  getFolderPath(FOLDER_NAMES.EXPORTS);

export const getAIExportsFolderPath = (): Promise<string> =>
  getFolderPath(FOLDER_NAMES.AI_EXPORTS);

export const getBackupsFolderPath = (): Promise<string> =>
  getFolderPath(FOLDER_NAMES.BACKUPS);

export const getLogsFolderPath = (): Promise<string> =>
  getFolderPath(FOLDER_NAMES.LOGS);

export const getTempFolderPath = (): Promise<string> =>
  getFolderPath(FOLDER_NAMES.TEMP);

export const getScreenshotFilePath = (...segments: string[]): Promise<string> =>
  getFolderItemPath(FOLDER_NAMES.SCREENSHOTS, ...segments);

export const getImportFilePath = (...segments: string[]): Promise<string> =>
  getFolderItemPath(FOLDER_NAMES.IMPORTS, ...segments);

export const getExportFilePath = (...segments: string[]): Promise<string> =>
  getFolderItemPath(FOLDER_NAMES.EXPORTS, ...segments);

export const getAIExportFilePath = (...segments: string[]): Promise<string> =>
  getFolderItemPath(FOLDER_NAMES.AI_EXPORTS, ...segments);

export const getBackupFilePath = (...segments: string[]): Promise<string> =>
  getFolderItemPath(FOLDER_NAMES.BACKUPS, ...segments);

export const getLogFilePath = (...segments: string[]): Promise<string> =>
  getFolderItemPath(FOLDER_NAMES.LOGS, ...segments);

export const getTempFilePath = (...segments: string[]): Promise<string> =>
  getFolderItemPath(FOLDER_NAMES.TEMP, ...segments);

/**
 * Retourne tous les dossiers standards resolus en chemins absolus.
 * Utile pour les diagnostics et les futures pages de maintenance locale.
 */
export async function getStandardFolderPaths(): Promise<Record<AppFolder, string>> {
  const entries = await Promise.all(
    APP_FOLDERS.map(async (folder) => [folder, await getFolderPath(folder)] as const),
  );
  return Object.fromEntries(entries) as Record<AppFolder, string>;
}
