// ============================================================
// Service — Tags (validation + logique métier)
// ============================================================

import { createLogger } from "../logging";
import {
  invalidateTagsCache,
  withCatalogCache,
  withRelationCache,
} from "../cache/domainCache";
import { logActivity } from "../activity/activityService";
import type { Tag, TradeTag, CreateTagInput } from "../../types";
import { validate, CreateTagInputSchema, UpdateTagSchema } from "../../validation";
import * as repo from "../../repositories/tagsRepository";

const logger = createLogger("tags");

// ------------------------------------------------------------
// CRUD Tags
// ------------------------------------------------------------

export async function createTag(data: CreateTagInput): Promise<Tag> {
  validate(CreateTagInputSchema, data);
  const tag = await repo.insertTag(data);
  invalidateTagsCache();
  logger.info(`Tag créé : "${tag.name}"`);
  return tag;
}

export async function getTagById(id: number): Promise<Tag | null> {
  return withCatalogCache("tags", "getTagById", [id], () => repo.findTagById(id));
}

export async function getTags(): Promise<Tag[]> {
  return withCatalogCache("tags", "getTags", [], () => repo.findTags());
}

export async function updateTag(
  id: number,
  data: Partial<CreateTagInput>
): Promise<Tag | null> {
  validate(UpdateTagSchema, data);
  const tag = await repo.updateTagById(id, data);
  if (tag) {
    invalidateTagsCache();
  }
  return tag;
}

/**
 * Supprime un tag.
 * Les liaisons trade_tags associées sont supprimées via ON DELETE CASCADE.
 */
export async function deleteTag(id: number): Promise<boolean> {
  const deleted = await repo.deleteTagById(id);
  if (deleted) {
    invalidateTagsCache();
    logger.info(`Tag supprimé : id=${id}`);
  }
  return deleted;
}

// ------------------------------------------------------------
// Liaisons trade ↔ tag
// ------------------------------------------------------------

/** Associe un tag à un trade. Idempotent. */
export async function addTagToTrade(tradeId: number, tagId: number): Promise<void> {
  await repo.insertTradeTag(tradeId, tagId);
  invalidateTagsCache();
  // Charger le nom du tag pour un message lisible (fire-and-forget)
  void repo.findTagById(tagId).then((tag) => {
    void logActivity({
      tradeId,
      action: "tag_added",
      description: `Tag ajouté : ${tag?.name ?? `#${tagId}`}`,
    }).catch(() => {});
  }).catch(() => {});
}

/** Retire l'association entre un trade et un tag. */
export async function removeTagFromTrade(tradeId: number, tagId: number): Promise<void> {
  // Charger le nom avant suppression
  const tag = await repo.findTagById(tagId).catch(() => null);
  await repo.deleteTradeTag(tradeId, tagId);
  invalidateTagsCache();
  void logActivity({
    tradeId,
    action: "tag_removed",
    description: `Tag retiré : ${tag?.name ?? `#${tagId}`}`,
  }).catch(() => {});
}

/** Retourne tous les tags associés à un trade. */
export async function getTagsForTrade(tradeId: number): Promise<Tag[]> {
  return withRelationCache("tags", "getTagsForTrade", [tradeId], () =>
    repo.findTagsByTradeId(tradeId),
  );
}

/** Remplace tous les tags d'un trade (supprime puis réinsère). */
export async function setTagsForTrade(tradeId: number, tagIds: number[]): Promise<void> {
  await repo.replaceTradeTagsByTradeId(tradeId, tagIds);
  invalidateTagsCache();
}

/** Retourne les liaisons trade_tags d'un trade (avec tagName). */
export async function getTradeTags(tradeId: number): Promise<TradeTag[]> {
  return withRelationCache("tags", "getTradeTags", [tradeId], () =>
    repo.findTradeTags(tradeId),
  );
}
