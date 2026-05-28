// ============================================================
// Service — Strategies (validation + logique métier)
// ============================================================

import { createLogger } from "../logging";
import {
  invalidateStrategyAnalyticsCaches,
  withCatalogCache,
} from "../cache/domainCache";
import type { Strategy, StrategyFormData } from "../../types";
import { validate, StrategyFormDataSchema, UpdateStrategySchema } from "../../validation";
import * as repo from "../../repositories/strategiesRepository";

const logger = createLogger("strategies");

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

export async function createStrategy(data: StrategyFormData): Promise<Strategy> {
  validate(StrategyFormDataSchema, data);
  const strategy = await repo.insertStrategy(data);
  invalidateStrategyAnalyticsCaches();
  logger.info(`Stratégie créée : id=${strategy.id} "${strategy.name}"`);
  return strategy;
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

export async function getStrategyById(id: number): Promise<Strategy | null> {
  return withCatalogCache("strategies", "getStrategyById", [id], () =>
    repo.findStrategyById(id),
  );
}

/** Retourne toutes les stratégies, actives en premier. */
export async function getStrategies(onlyActive = false): Promise<Strategy[]> {
  return withCatalogCache("strategies", "getStrategies", [onlyActive], () =>
    repo.findStrategies(onlyActive),
  );
}

// ------------------------------------------------------------
// UPDATE
// ------------------------------------------------------------

export async function updateStrategy(
  id: number,
  data: Partial<StrategyFormData>
): Promise<Strategy | null> {
  validate(UpdateStrategySchema, data);
  const strategy = await repo.updateStrategyById(id, data);
  if (strategy) {
    invalidateStrategyAnalyticsCaches();
    logger.info(`Stratégie mise à jour : id=${id}`);
  }
  return strategy;
}

// ------------------------------------------------------------
// DELETE
// ------------------------------------------------------------

/**
 * Supprime une stratégie.
 * Les trades liés auront strategy_id = NULL (ON DELETE SET NULL).
 */
export async function deleteStrategy(id: number): Promise<boolean> {
  const deleted = await repo.deleteStrategyById(id);
  if (deleted) {
    invalidateStrategyAnalyticsCaches();
    logger.info(`Stratégie supprimée : id=${id}`);
  }
  return deleted;
}
