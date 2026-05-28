// ============================================================
// Service — Imports (validation + logique métier)
// ============================================================
// Gère les sessions d'import et les lignes brutes associées.
// La logique de parsing CSV/MT5 sera dans des modules dédiés
// qui appelleront ce service pour persister les données.
// ============================================================

import { createLogger } from "../logging";
import type {
  ImportSession,
  ImportRow,
  ImportStatus,
  ImportRowStatus,
  CreateImportInput,
} from "../../types";
import { validate, CreateImportInputSchema } from "../../validation";
import * as repo from "../../repositories/importsRepository";

const logger = createLogger("imports");

// ------------------------------------------------------------
// Sessions d'import (table `imports`)
// ------------------------------------------------------------

/** Crée une nouvelle session d'import et retourne son entité. */
export async function createImportSession(data: CreateImportInput): Promise<ImportSession> {
  validate(CreateImportInputSchema, data);
  const session = await repo.insertImportSession(data);
  logger.info(`Session d'import créée : id=${session.id} source=${session.source}`);
  return session;
}

export async function getImportSessionById(id: number): Promise<ImportSession | null> {
  return repo.findImportSessionById(id);
}

export async function getImportSessions(): Promise<ImportSession[]> {
  return repo.findImportSessions();
}

/** Met à jour les compteurs et le statut d'une session d'import. */
export async function updateImportSession(
  id: number,
  data: {
    status?: ImportStatus;
    totalRows?: number;
    importedRows?: number;
    skippedRows?: number;
    errorRows?: number;
    warningRows?: number;
    fileSizeBytes?: number | null;
    importedAt?: string | null;
    errorMessage?: string | null;
    broker?: string | null;
    brokerId?: number | null;
    accountId?: string | null;
    tradingAccountId?: number | null;
  }
): Promise<ImportSession | null> {
  return repo.updateImportSessionById(id, data);
}

/**
 * Met à jour une session avec les résultats de l'analyse CSV.
 * Appelé après parsing + détection broker + validation dans ImportsPage.
 *
 * - status         → "analyzed"
 * - totalRows      → nombre total de lignes de données
 * - importedRows   → lignes importables (valid + warning)
 * - errorRows      → lignes invalides exclues
 * - warningRows    → lignes valides avec avertissements
 * - broker         → nom du format broker détecté (optionnel)
 */
export async function analyzeImportSession(
  id: number,
  data: {
    totalRows: number;
    importableRows: number;
    errorRows: number;
    warningRows: number;
    broker?: string | null;
    brokerId?: number | null;
    accountId?: string | null;
    tradingAccountId?: number | null;
  }
): Promise<void> {
  await updateImportSession(id, {
    status: "analyzed",
    totalRows: data.totalRows,
    importedRows: data.importableRows, // lignes qui PEUVENT être importées
    errorRows: data.errorRows,
    warningRows: data.warningRows,
    broker: data.broker ?? null,
    brokerId: data.brokerId ?? null,
    accountId: data.accountId ?? null,
    tradingAccountId: data.tradingAccountId ?? null,
  });
  logger.info(
    `Session ${id} analysée : ${data.totalRows} lignes, ${data.importableRows} importables, ${data.errorRows} invalides`,
  );
}

/** Marque une session comme terminée avec succès. */
export async function completeImportSession(
  id: number,
  counts: { imported: number; skipped: number; errors: number; total: number }
): Promise<ImportSession | null> {
  return updateImportSession(id, {
    status: "completed",
    totalRows: counts.total,
    importedRows: counts.imported,
    skippedRows: counts.skipped,
    errorRows: counts.errors,
    importedAt: new Date().toISOString(),
  });
}

/** Marque une session comme échouée. */
export async function failImportSession(
  id: number,
  errorMessage: string
): Promise<ImportSession | null> {
  return updateImportSession(id, { status: "failed", errorMessage });
}

/** Supprime une session d'import et ses lignes brutes (CASCADE). */
export async function deleteImportSession(id: number): Promise<boolean> {
  const deleted = await repo.deleteImportSessionById(id);
  if (deleted) logger.info(`Session d'import supprimée : id=${id}`);
  return deleted;
}

// ------------------------------------------------------------
// Lignes brutes (table `import_rows`)
// ------------------------------------------------------------

/** Insère une ligne brute dans une session d'import. */
export async function createImportRow(
  importId: number,
  rowIndex: number,
  rawData: unknown
): Promise<ImportRow> {
  return repo.insertImportRow(importId, rowIndex, rawData);
}

export async function getImportRowById(id: number): Promise<ImportRow | null> {
  return repo.findImportRowById(id);
}

export async function getImportRows(importId: number): Promise<ImportRow[]> {
  return repo.findImportRowsBySessionId(importId);
}

/** Met à jour le statut d'une ligne brute (après traitement). */
export async function updateImportRowStatus(
  id: number,
  status: ImportRowStatus,
  tradeId?: number | null,
  errorMessage?: string | null
): Promise<void> {
  return repo.updateImportRowStatus(id, status, tradeId, errorMessage);
}
