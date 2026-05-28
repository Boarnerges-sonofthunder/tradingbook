// ============================================================
// Service — Brokers (validation + logique metier)
// ============================================================

import { createLogger } from "../logging";
import { invalidateCacheByPrefix } from "../cache/localCache";
import { validate, ValidationError } from "../../validation";
import { BrokerFormDataSchema, UpdateBrokerSchema } from "../../validation";
import type { Broker, BrokerFormData } from "../../types";
import * as repo from "../../repositories/brokersRepository";

const logger = createLogger("brokers");
const CACHE_PREFIX = "catalog:brokers:";

function invalidateCatalogCache(): void {
  invalidateCacheByPrefix(CACHE_PREFIX);
}

export async function createBroker(data: BrokerFormData): Promise<Broker> {
  validate(BrokerFormDataSchema, data);
  const broker = await repo.insertBroker(data);
  invalidateCatalogCache();
  logger.info(`Broker cree : id=${broker.id} "${broker.name}"`);
  return broker;
}

export async function getBrokers(onlyActive = false): Promise<Broker[]> {
  return repo.findBrokers(onlyActive);
}

/** Retourne seulement les brokers vus dans synchronisations MT5. */
export async function getSyncedBrokers(onlyActive = false): Promise<Broker[]> {
  return repo.findSyncedBrokers(onlyActive);
}

export async function getBrokerById(id: number): Promise<Broker | null> {
  return repo.findBrokerById(id);
}

export async function resolveBrokerByName(name: string): Promise<Broker> {
  const broker = await repo.resolveOrCreateBrokerByName(name);
  invalidateCatalogCache();
  return broker;
}

export async function updateBroker(
  id: number,
  data: Partial<BrokerFormData>,
): Promise<Broker | null> {
  validate(UpdateBrokerSchema, data);
  const broker = await repo.updateBrokerById(id, data);
  if (broker) {
    invalidateCatalogCache();
    logger.info(`Broker mis a jour : id=${broker.id}`);
  }
  return broker;
}

export async function deactivateBroker(id: number): Promise<boolean> {
  const ok = await repo.deactivateBroker(id);
  if (ok) {
    invalidateCatalogCache();
    logger.info(`Broker desactive : id=${id}`);
  }
  return ok;
}

export async function deleteBroker(id: number): Promise<boolean> {
  const accountsCount = await repo.countTradingAccountsForBroker(id);
  if (accountsCount > 0) {
    throw new ValidationError([
      `Ce broker est lie a ${accountsCount} compte(s). Desactivez-le plutot que de le supprimer.`,
    ]);
  }

  const updated = await repo.updateBrokerById(id, { isActive: false });
  if (updated) {
    invalidateCatalogCache();
    logger.info(`Broker archive : id=${id}`);
    return true;
  }
  return false;
}
