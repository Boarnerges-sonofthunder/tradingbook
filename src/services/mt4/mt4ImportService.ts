// ============================================================
// MT4 Import Service — TradingBook
// ============================================================
// Phase 6 Étape 2.1 — Architecture préparée (NON IMPLÉMENTÉ)
//
// RESPONSABILITÉS (futures) :
//   - Orchestrer le flux complet d'import MT4 (lecture → mapping → SQLite)
//   - Créer la session d'import dans la table `imports`
//   - Déléguer à mt4BridgeService et mt4MappingService
//   - Passer par mt4DeduplicationService avant insertion
//   - Insérer les trades dans SQLite via tradesService
//   - Retourner un rapport d'import détaillé
//
// FLUX COMPLET (futur) :
//   1. loadMT4Export()          — bridge : lit le fichier JSON/CSV
//   2. mapMT4Orders()           — mapping : MT4RawOrder → CreateTradeInput[]
//   3. deduplicateMT4Trades()   — déduplication : filtre les doublons
//   4. createImportSession()    — SQLite : crée imports row (source = "mt4")
//   5. tradesService.create()   — SQLite : insère chaque trade
//   6. Retourne ImportResult    — rapport pour l'UI
//
// PRÉREQUIS :
//   - Migration 005 appliquée (platform = "mt4" autorisé dans SQLite)
//   - Fichier d'export MT4 présent dans data/imports/
//
// ÉTAT : 🔲 NON IMPLÉMENTÉ — stubs architecturaux uniquement
// ============================================================

import { createLogger } from "../logging";
import type { MT4ImportStatus } from "../../types/mt4";
import type { ImportResult } from "../../types/import";

const logger = createLogger("mt4-import");

// ─── Erreur de non-implémentation ──────────────────────────

class MT4NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `MT4ImportService.${method}() — non implémenté (Phase 6 Étape future). ` +
        `Prérequis : migration 005 + MQL4 EA disponible.`,
    );
    this.name = "MT4NotImplementedError";
  }
}

// ─── Callback de progression ───────────────────────────────

/**
 * Callback appelé à chaque changement d'état du flux d'import.
 * Permet à l'UI de mettre à jour un indicateur de progression.
 *
 * @param status  - Nouvel état de l'import
 * @param message - Message descriptif optionnel
 */
export type MT4ImportProgressCallback = (
  status: MT4ImportStatus,
  message?: string,
) => void;

// ─── Fonctions publiques (stubs) ───────────────────────────

/**
 * Lance le flux d'import MT4 complet depuis le fichier d'export local.
 *
 * Flux : detectFile → readFile → mapOrders → deduplicate → insertSQLite
 *
 * @param onProgress - Callback optionnel pour suivre la progression dans l'UI
 * @returns Rapport d'import (ImportResult) avec compteurs et erreurs éventuelles
 *
 * @todo Implémenter en Phase 6 Étape MT4.
 */
export async function importFromMT4File(
  onProgress?: MT4ImportProgressCallback,
): Promise<ImportResult> {
  logger.debug("importFromMT4File() appelé");
  onProgress?.("detecting", "Recherche du fichier d'export MT4...");
  throw new MT4NotImplementedError("importFromMT4File");
}

/**
 * Lance un import MT4 depuis un chemin de fichier spécifié manuellement.
 *
 * Utilisé quand l'utilisateur sélectionne un fichier via le sélecteur
 * de fichiers de l'OS (dialog.open() de Tauri).
 *
 * @param filePath   - Chemin absolu vers le fichier d'export MT4
 * @param onProgress - Callback optionnel de progression
 *
 * @todo Implémenter en Phase 6 Étape MT4.
 */
export async function importFromMT4FilePath(
  filePath: string,
  onProgress?: MT4ImportProgressCallback,
): Promise<ImportResult> {
  logger.debug(`importFromMT4FilePath(${filePath}) appelé`);
  onProgress?.("reading", "Lecture du fichier MT4...");
  throw new MT4NotImplementedError("importFromMT4FilePath");
}
