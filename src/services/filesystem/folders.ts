// ============================================================
// Gestion des dossiers locaux — TradingBook
// ============================================================
// Fournit les utilitaires pour créer et vérifier les dossiers
// applicatifs au démarrage de l'application.
//
// Les dossiers sont créés dans le répertoire de données local
// de Tauri (voir paths.ts). Ils sont recréés automatiquement
// s'ils ont été supprimés par l'utilisateur.
// ============================================================

import { mkdir, exists } from "@tauri-apps/plugin-fs";
import { APP_FOLDERS, AppFolder, getFolderPath } from "./paths";

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/**
 * S'assure qu'un dossier existe. Le crée (récursivement) si absent.
 * Ne fait rien si le dossier existe déjà.
 */
export async function ensureAppFolder(folder: AppFolder): Promise<void> {
  const path = await getFolderPath(folder);
  const alreadyExists = await exists(path);
  if (!alreadyExists) {
    await mkdir(path, { recursive: true });
    console.log(`[TradingBook] Dossier créé : ${path}`);
  }
}

// ------------------------------------------------------------
// API publique
// ------------------------------------------------------------

/**
 * Initialise tous les dossiers applicatifs nécessaires.
 * À appeler au démarrage de l'application (App.tsx).
 *
 * Dossiers créés si absents :
 *   - screenshots/  — captures d'écran des trades
 *   - imports/      — fichiers CSV importés
 *   - exports/      — fichiers exportés
 *   - backups/      — sauvegardes de la base de données
 *   - logs/         — fichiers de log
 *   - temp/         — fichiers temporaires
 */
export async function initAppFolders(): Promise<void> {
  await Promise.all(APP_FOLDERS.map(ensureAppFolder));
}

/**
 * Vérifie si un dossier applicatif existe.
 * Utile pour des contrôles de santé ou de diagnostic.
 */
export async function folderExists(folder: AppFolder): Promise<boolean> {
  const path = await getFolderPath(folder);
  return exists(path);
}
