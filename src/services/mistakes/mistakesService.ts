// ============================================================
// Service — Mistakes (validation + logique métier)
// ============================================================

import { createLogger } from "../logging";
import {
  invalidateMistakesCache,
  withCatalogCache,
  withRelationCache,
} from "../cache/domainCache";
import { logActivity } from "../activity/activityService";
import type {
  Mistake,
  TradeMistake,
  CreateMistakeInput,
  AddMistakeToTradeInput,
} from "../../types";
import {
  validate,
  CreateMistakeInputSchema,
  UpdateMistakeSchema,
  AddMistakeToTradeInputSchema,
} from "../../validation";
import * as repo from "../../repositories/mistakesRepository";

const logger = createLogger("mistakes");

// ------------------------------------------------------------
// CRUD Mistakes (catalogue)
// ------------------------------------------------------------

export async function createMistake(data: CreateMistakeInput): Promise<Mistake> {
  validate(CreateMistakeInputSchema, data);
  const mistake = await repo.insertMistake(data);
  invalidateMistakesCache();
  return mistake;
}

export async function getMistakeById(id: number): Promise<Mistake | null> {
  return withCatalogCache("mistakes", "getMistakeById", [id], () =>
    repo.findMistakeById(id),
  );
}

export async function getMistakes(): Promise<Mistake[]> {
  return withCatalogCache("mistakes", "getMistakes", [], () => repo.findMistakes());
}

export async function updateMistake(
  id: number,
  data: Partial<CreateMistakeInput>
): Promise<Mistake | null> {
  validate(UpdateMistakeSchema, data);
  const mistake = await repo.updateMistakeById(id, data);
  if (mistake) {
    invalidateMistakesCache();
  }
  return mistake;
}

/**
 * Supprime une erreur du catalogue.
 * Les liaisons trade_mistakes associées sont supprimées via CASCADE.
 */
export async function deleteMistake(id: number): Promise<boolean> {
  const deleted = await repo.deleteMistakeById(id);
  if (deleted) {
    invalidateMistakesCache();
    logger.info(`Erreur supprimée : id=${id}`);
  }
  return deleted;
}

// ------------------------------------------------------------
// Liaisons trade ↔ mistake
// ------------------------------------------------------------

export async function addMistakeToTrade(data: AddMistakeToTradeInput): Promise<void> {
  validate(AddMistakeToTradeInputSchema, data);
  await repo.upsertTradeMistake(data);
  invalidateMistakesCache();
  void repo.findMistakeById(data.mistakeId).then((mistake) => {
    void logActivity({
      tradeId: data.tradeId,
      action: "mistake_added",
      description: `Erreur ajoutée : ${mistake?.name ?? `#${data.mistakeId}`}`,
    }).catch(() => {});
  }).catch(() => {});
}

export async function removeMistakeFromTrade(tradeId: number, mistakeId: number): Promise<void> {
  const mistake = await repo.findMistakeById(mistakeId).catch(() => null);
  await repo.deleteTradeMistake(tradeId, mistakeId);
  invalidateMistakesCache();
  void logActivity({
    tradeId,
    action: "mistake_removed",
    description: `Erreur retirée : ${mistake?.name ?? `#${mistakeId}`}`,
  }).catch(() => {});
}

export async function getMistakesForTrade(tradeId: number): Promise<TradeMistake[]> {
  return withRelationCache("mistakes", "getMistakesForTrade", [tradeId], () =>
    repo.findMistakesByTradeId(tradeId),
  );
}

/** Remplace toutes les erreurs d'un trade. */
export async function setMistakesForTrade(
  tradeId: number,
  items: Array<{ mistakeId: number; notes?: string | null }>
): Promise<void> {
  await repo.replaceMistakesByTradeId(tradeId, items);
  invalidateMistakesCache();
}
