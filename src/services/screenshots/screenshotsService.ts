// ============================================================
// Service — Screenshots (validation + logique métier)
// ============================================================
// SQLite stocke le nom de fichier. Le fichier physique est dans
// le dossier screenshots local (getFilePath('screenshots', filename)).
// ============================================================

import { createLogger } from "../logging";
import { logActivity } from "../activity/activityService";
import { validate, CreateScreenshotInputSchema, UpdateScreenshotSchema } from "../../validation";
import * as repo from "../../repositories/screenshotsRepository";
import {
  findMissingScreenshotFiles,
  readScreenshotBytes,
  removeScreenshotFile,
  storeScreenshotFile,
  type MissingScreenshot,
} from "./screenshotStorageService";

// Ré-exports pour compatibilité descendante
export type { TradeScreenshot, CreateScreenshotInput } from "../../repositories/screenshotsRepository";
import type { TradeScreenshot, CreateScreenshotInput } from "../../repositories/screenshotsRepository";

const logger = createLogger("screenshots");

export async function createScreenshot(data: CreateScreenshotInput): Promise<TradeScreenshot> {
  validate(CreateScreenshotInputSchema, data);
  const screenshot = await repo.insertScreenshot(data);
  logger.info(`Screenshot enregistré : "${data.filename}" trade=${data.tradeId}`);
  void logActivity({
    tradeId: data.tradeId,
    action: "screenshot_added",
    description: `Capture ajoutée : ${data.label ?? data.filename}`,
  }).catch(() => {});
  return screenshot;
}

export async function addScreenshotFileToTrade(input: {
  tradeId: number;
  file: File;
  label?: string | null;
  timeframe?: string | null;
  notes?: string | null;
}): Promise<TradeScreenshot> {
  const storedFile = await storeScreenshotFile(input.tradeId, input.file);
  return createScreenshot({
    tradeId: input.tradeId,
    filename: storedFile.filename,
    filePath: storedFile.filePath,
    fileName: storedFile.fileName,
    mimeType: storedFile.mimeType,
    fileSize: storedFile.fileSize,
    label: input.label ?? null,
    timeframe: input.timeframe ?? null,
    notes: input.notes ?? null,
  });
}

export async function getScreenshotById(id: number): Promise<TradeScreenshot | null> {
  return repo.findScreenshotById(id);
}

export async function getScreenshotsForTrade(tradeId: number): Promise<TradeScreenshot[]> {
  return repo.findScreenshotsByTradeId(tradeId);
}

export async function readScreenshotImage(screenshot: TradeScreenshot): Promise<Uint8Array> {
  return readScreenshotBytes(screenshot);
}

export async function findMissingScreenshotsForTrade(
  tradeId: number,
): Promise<MissingScreenshot[]> {
  const screenshots = await repo.findScreenshotsByTradeId(tradeId);
  return findMissingScreenshotFiles(screenshots);
}

export async function findAllMissingScreenshots(): Promise<MissingScreenshot[]> {
  const screenshots = await repo.findAllScreenshots();
  return findMissingScreenshotFiles(screenshots);
}

export async function updateScreenshot(
  id: number,
  data: Partial<Pick<CreateScreenshotInput, "timeframe" | "label" | "notes">>
): Promise<TradeScreenshot | null> {
  validate(UpdateScreenshotSchema, data);
  return repo.updateScreenshotById(id, data);
}

/** Supprime les métadonnées d'un screenshot. Le fichier physique reste sur disque. */
export async function deleteScreenshot(id: number): Promise<boolean> {
  const screenshot = await repo.findScreenshotById(id).catch(() => null);
  const deleted = await repo.deleteScreenshotById(id);
  if (deleted) {
    logger.info(`Screenshot supprimé de la base : id=${id}`);
    if (screenshot) {
      void logActivity({
        tradeId: screenshot.tradeId,
        action: "screenshot_removed",
        description: `Capture supprimée : ${screenshot.label ?? screenshot.filename}`,
      }).catch(() => {});
    }
  }
  return deleted;
}

export async function deleteScreenshotWithFile(id: number): Promise<boolean> {
  const screenshot = await repo.findScreenshotById(id).catch(() => null);
  if (screenshot) {
    await removeScreenshotFile(screenshot).catch(() => {
      // Le fichier peut deja etre absent; la ligne SQLite reste supprimable.
    });
  }
  return deleteScreenshot(id);
}
