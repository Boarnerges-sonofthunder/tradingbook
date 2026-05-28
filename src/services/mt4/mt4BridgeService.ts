// ============================================================
// MT4 Bridge Service — TradingBook
// ============================================================
// Phase 6 Étape 2.1 — Architecture préparée (NON IMPLÉMENTÉ)
//
// RESPONSABILITÉS (futures) :
//   - Chercher le fichier d'export MT4 dans les chemins connus
//   - Lire et parser le JSON/CSV produit par le MQL4 EA
//   - Retourner un résultat typé MT4ReadResult
//   - Gérer toutes les erreurs (fichier absent, JSON invalide, etc.)
//
// DIFFÉRENCE MT4 vs MT5 :
//   MT5 — bridge Python actif (connexion en temps réel via MetaTrader5 pip)
//   MT4 — bridge fichier passif (lecture d'un export produit par un EA MQL4)
//
// FLUX D'UTILISATION (futur) :
//   1. L'utilisateur exécute le MQL4 EA "TradingBookExport.mq4" dans MT4.
//   2. L'EA écrit un fichier JSON dans un dossier local connu.
//   3. L'utilisateur clique "Importer depuis MT4" dans TradingBook.
//   4. detectMT4ExportFile()  — trouve le fichier dans les chemins connus
//   5. readMT4ExportFile()    — lit et parse le fichier JSON
//   6. Retourne MT4ReadResult → transmis à mt4MappingService
//
// CHEMINS CHERCHÉS (ordre de priorité) :
//   1. data/imports/mt4_export.json   (dossier TradingBook)
//   2. data/imports/mt4_export.csv
//   3. Chemin personnalisé en settings (si configuré)
//   4. %APPDATA%\MetaQuotes\Terminal\<hash>\MQL4\Files\mt4_export.json
//
// ÉTAT : 🔲 NON IMPLÉMENTÉ — stubs architecturaux uniquement
// ============================================================

import { createLogger } from "../logging";
import type { MT4ReadResult } from "../../types/mt4";
import { MT4_EXPORT_FILENAMES } from "../../constants/tradingPlatforms";

const logger = createLogger("mt4-bridge");

// ─── Erreur de non-implémentation ──────────────────────────

/**
 * Erreur levée par tous les stubs de ce service.
 * À retirer lors de l'implémentation réelle.
 */
class MT4NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `MT4BridgeService.${method}() — non implémenté (Phase 6 Étape future). ` +
        `Implémenter quand le MQL4 EA d'export sera disponible.`,
    );
    this.name = "MT4NotImplementedError";
  }
}

// ─── Fonctions publiques (stubs) ───────────────────────────

/**
 * Détecte la présence d'un fichier d'export MT4 dans les chemins connus.
 *
 * Cherche dans cet ordre :
 *   1. data/imports/mt4_export.json (ou variantes)
 *   2. Chemin personnalisé dans les settings
 *   3. Dossier Files/ du terminal MT4 (APPDATA)
 *
 * @returns Chemin absolu vers le fichier trouvé, ou null si absent.
 *
 * @todo Implémenter en Phase 6 Étape MT4.
 *   - Utiliser `appDataDir()` + `join()` de @tauri-apps/api/path
 *   - Utiliser `exists()` de @tauri-apps/plugin-fs
 *   - Chercher dans MT4_EXPORT_FILENAMES (constants/tradingPlatforms.ts)
 */
export async function detectMT4ExportFile(): Promise<string | null> {
  logger.debug(
    `detectMT4ExportFile() appelé — cherche: ${MT4_EXPORT_FILENAMES.join(", ")}`,
  );
  throw new MT4NotImplementedError("detectMT4ExportFile");
}

/**
 * Lit et parse un fichier d'export MT4 JSON ou CSV.
 *
 * @param filePath - Chemin absolu vers le fichier d'export.
 * @returns Résultat structuré avec les données ou une erreur typée.
 *
 * @todo Implémenter en Phase 6 Étape MT4.
 *   - Utiliser `readTextFile()` de @tauri-apps/plugin-fs
 *   - Détecter le format (JSON ou CSV) via l'extension
 *   - Pour JSON : JSON.parse() + validation de structure
 *   - Pour CSV  : passer par csvParserService + mt4CsvProfile
 *   - Retourner MT4ReadResult (jamais throw)
 */
export async function readMT4ExportFile(
  filePath: string,
): Promise<MT4ReadResult> {
  logger.debug(`readMT4ExportFile(${filePath}) appelé`);
  throw new MT4NotImplementedError("readMT4ExportFile");
}

/**
 * Flux complet : détection + lecture du fichier d'export MT4.
 *
 * Combine detectMT4ExportFile() et readMT4ExportFile() en une seule étape.
 * Ne throw jamais — retourne toujours un MT4ReadResult.
 *
 * @todo Implémenter en Phase 6 Étape MT4.
 */
export async function loadMT4Export(): Promise<MT4ReadResult> {
  logger.debug("loadMT4Export() appelé");
  throw new MT4NotImplementedError("loadMT4Export");
}
