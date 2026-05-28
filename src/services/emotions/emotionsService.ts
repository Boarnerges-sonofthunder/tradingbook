// ============================================================
// Service — Emotions (validation + logique métier)
// ============================================================

import { createLogger } from "../logging";
import {
  invalidateEmotionAnalyticsCaches,
  withCatalogCache,
  withRelationCache,
} from "../cache/domainCache";
import { logActivity } from "../activity/activityService";
import type {
  Emotion,
  TradeEmotion,
  EmotionPhase,
  CreateEmotionInput,
  AddEmotionToTradeInput,
} from "../../types";
import {
  validate,
  CreateEmotionInputSchema,
  UpdateEmotionSchema,
  AddEmotionToTradeInputSchema,
} from "../../validation";
import * as repo from "../../repositories/emotionsRepository";

const logger = createLogger("emotions");

// ------------------------------------------------------------
// CRUD Emotions (catalogue)
// ------------------------------------------------------------

export async function createEmotion(data: CreateEmotionInput): Promise<Emotion> {
  validate(CreateEmotionInputSchema, data);
  const emotion = await repo.insertEmotion(data);
  invalidateEmotionAnalyticsCaches();
  return emotion;
}

export async function getEmotionById(id: number): Promise<Emotion | null> {
  return withCatalogCache("emotions", "getEmotionById", [id], () =>
    repo.findEmotionById(id),
  );
}

export async function getEmotions(): Promise<Emotion[]> {
  return withCatalogCache("emotions", "getEmotions", [], () => repo.findEmotions());
}

export async function updateEmotion(
  id: number,
  data: Partial<CreateEmotionInput>
): Promise<Emotion | null> {
  validate(UpdateEmotionSchema, data);
  const emotion = await repo.updateEmotionById(id, data);
  if (emotion) {
    invalidateEmotionAnalyticsCaches();
  }
  return emotion;
}

/** Supprime une émotion. Les liaisons trade_emotions sont supprimées via CASCADE. */
export async function deleteEmotion(id: number): Promise<boolean> {
  const deleted = await repo.deleteEmotionById(id);
  if (deleted) {
    invalidateEmotionAnalyticsCaches();
    logger.info(`Émotion supprimée : id=${id}`);
  }
  return deleted;
}

// ------------------------------------------------------------
// Liaisons trade ↔ emotion
// ------------------------------------------------------------

/**
 * Associe une émotion à un trade.
 * INSERT OR REPLACE : remplace si la même (trade, emotion, phase) existe déjà.
 */
export async function addEmotionToTrade(data: AddEmotionToTradeInput): Promise<void> {
  validate(AddEmotionToTradeInputSchema, data);
  await repo.upsertTradeEmotion(data);
  invalidateEmotionAnalyticsCaches();
  // Charger le nom de l'émotion pour un message lisible
  void repo.findEmotionById(data.emotionId).then((emotion) => {
    const phase = data.phase ?? "during";
    const phaseLabel = { before: "Avant", during: "Pendant", after: "Après" }[phase];
    void logActivity({
      tradeId: data.tradeId,
      action: "emotion_added",
      description: `Émotion ajoutée : ${emotion?.name ?? `#${data.emotionId}`} (${phaseLabel})`,
    }).catch(() => {});
  }).catch(() => {});
}

export async function removeEmotionFromTrade(
  tradeId: number,
  emotionId: number,
  phase: EmotionPhase = "during"
): Promise<void> {
  const emotion = await repo.findEmotionById(emotionId).catch(() => null);
  await repo.deleteTradeEmotion(tradeId, emotionId, phase);
  invalidateEmotionAnalyticsCaches();
  const phaseLabel = { before: "Avant", during: "Pendant", after: "Après" }[phase];
  void logActivity({
    tradeId,
    action: "emotion_removed",
    description: `Émotion retirée : ${emotion?.name ?? `#${emotionId}`} (${phaseLabel})`,
  }).catch(() => {});
}

export async function getEmotionsForTrade(tradeId: number): Promise<TradeEmotion[]> {
  return withRelationCache("emotions", "getEmotionsForTrade", [tradeId], () =>
    repo.findEmotionsByTradeId(tradeId),
  );
}

/** Remplace toutes les émotions d'un trade. */
export async function setEmotionsForTrade(
  tradeId: number,
  items: Array<{ emotionId: number; intensity?: number; phase?: EmotionPhase }>
): Promise<void> {
  await repo.replaceEmotionsByTradeId(tradeId, items);
  invalidateEmotionAnalyticsCaches();
}
