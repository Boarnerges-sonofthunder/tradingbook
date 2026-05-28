// ============================================================
// Service — Trading Accounts (validation + logique métier)
// ============================================================
// Gestion CRUD des comptes trading multi-broker / multi-plateforme.
//
// Architecture :
//   TradingAccountsPage (React)
//     └── tradingAccountsService  ← ici
//           └── tradingAccountsRepository
//                 └── SQLite (table `trading_accounts`)
// ============================================================

import { createLogger } from "../logging";
import { invalidateCacheByPrefix } from "../cache/localCache";
import { validate, ValidationError } from "../../validation";
import {
  TradingAccountFormDataSchema,
  UpdateTradingAccountSchema,
} from "../../validation";
import type {
  TradingAccount,
  TradingAccountFormData,
  ResolveTradingAccountInput,
} from "../../types";
import * as repo from "../../repositories/tradingAccountsRepository";

const logger = createLogger("trading-accounts");

/** Préfixe cache pour les comptes trading. */
const CACHE_PREFIX = "catalog:trading-accounts:";

function invalidateCatalogCache(_domain: string): void {
  invalidateCacheByPrefix(CACHE_PREFIX);
}

// ─── CREATE ────────────────────────────────────────────────

export async function createTradingAccount(
  data: TradingAccountFormData,
): Promise<TradingAccount> {
  validate(TradingAccountFormDataSchema, data);
  const account = await repo.insertTradingAccount(data);
  invalidateCatalogCache("trading-accounts");
  logger.info(`Compte créé : id=${account.id} "${account.name}"`);
  return account;
}

// ─── RESOLVE OR CREATE ────────────────────────────────────

/**
 * Cherche ou crée un compte de trading par (broker, platform, accountNumber).
 * Utilisé automatiquement par les pipelines MT5 sync et CSV import.
 */
export async function resolveTradingAccount(
  input: ResolveTradingAccountInput,
): Promise<TradingAccount> {
  const account = await repo.resolveOrCreateTradingAccount(input);
  invalidateCatalogCache("trading-accounts");
  return account;
}

// ─── READ ─────────────────────────────────────────────────

export async function getTradingAccountById(
  id: number,
): Promise<TradingAccount | null> {
  return repo.findTradingAccountById(id);
}

/** Retourne tous les comptes (actifs en premier). */
export async function getTradingAccounts(
  onlyActive = false,
): Promise<TradingAccount[]> {
  return repo.findTradingAccounts(onlyActive);
}

/** Retourne seulement les comptes vus dans synchronisations MT5. */
export async function getSyncedTradingAccounts(
  onlyActive = false,
): Promise<TradingAccount[]> {
  return repo.findSyncedTradingAccounts(onlyActive);
}

// ─── UPDATE ───────────────────────────────────────────────

export async function updateTradingAccount(
  id: number,
  data: Partial<TradingAccountFormData>,
): Promise<TradingAccount | null> {
  validate(UpdateTradingAccountSchema, data);
  const account = await repo.updateTradingAccountById(id, data);
  if (account) {
    invalidateCatalogCache("trading-accounts");
    logger.info(`Compte mis à jour : id=${id}`);
  }
  return account;
}

// ─── DEACTIVATE / DELETE ──────────────────────────────────

/**
 * Désactive un compte sans le supprimer.
 * Les trades liés conservent leur référence.
 */
export async function deactivateTradingAccount(id: number): Promise<boolean> {
  const ok = await repo.deactivateTradingAccount(id);
  if (ok) {
    invalidateCatalogCache("trading-accounts");
    logger.info(`Compte désactivé : id=${id}`);
  }
  return ok;
}

/**
 * Supprime définitivement un compte si aucun trade n'y est lié.
 * Lève une ValidationError si des trades existent pour ce compte.
 */
export async function deleteTradingAccount(id: number): Promise<boolean> {
  const tradeCount = await repo.countTradesForAccount(id);
  if (tradeCount > 0) {
    throw new ValidationError([
      `Ce compte a ${tradeCount} trade(s) associé(s). Désactivez-le plutôt que de le supprimer.`,
    ]);
  }
  const ok = await repo.deleteTradingAccountById(id);
  if (ok) {
    invalidateCatalogCache("trading-accounts");
    logger.info(`Compte supprimé : id=${id}`);
  }
  return ok;
}
