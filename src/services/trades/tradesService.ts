// ============================================================
// Service — Trades (validation + logique métier)
// ============================================================
// Ce service orchestre la validation et la logique métier.
// Toutes les requêtes SQL sont déléguées à tradesRepository.
//
// Usage :
//   import { getTrades, createTrade } from "../services/trades/tradesService";
// ============================================================

import { createLogger } from "../logging";
import { invalidateTradeRelatedCaches } from "../cache/domainCache";
import { logActivity } from "../activity/activityService";
import { notifyIfTwoConsecutiveLosses } from "./lossStreakAlertService";
import type { Trade, CreateTradeInput, UpdateTradeInput } from "../../types";
import { validate, CreateTradeInputSchema, UpdateTradeInputSchema } from "../../validation";
import * as repo from "../../repositories/tradesRepository";

// Ré-export pour compatibilité descendante
export type { TradeFilters } from "../../repositories/tradesRepository";
import type { TradeFilters } from "../../repositories/tradesRepository";

const logger = createLogger("trades");

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

/** Crée un nouveau trade et retourne l'entité créée. */
export async function createTrade(data: CreateTradeInput): Promise<Trade> {
  validate(CreateTradeInputSchema, data);
  const trade = await repo.insertTrade(data);
  invalidateTradeRelatedCaches();
  logger.info(`Trade créé : id=${trade.id} ${trade.symbol} ${trade.side}`);
  void logActivity({
    tradeId: trade.id,
    action: "trade_created",
    description: `Trade créé : ${trade.symbol} ${trade.side}`,
  }).catch(() => {});
  void notifyIfTwoConsecutiveLosses(trade);
  return trade;
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

/** Retourne un trade par son ID, ou null s'il n'existe pas. */
export async function getTradeById(id: number): Promise<Trade | null> {
  return repo.findTradeById(id);
}

/**
 * Retourne la liste des trades avec filtres optionnels.
 * Tri par défaut : opened_at DESC (plus récent en premier).
 */
export async function getTrades(filters: TradeFilters = {}): Promise<Trade[]> {
  return repo.findTrades(filters);
}

// ------------------------------------------------------------
// UPDATE
// ------------------------------------------------------------

/** Met à jour un trade et retourne l'entité mise à jour, ou null si introuvable. */
export async function updateTrade(
  id: number,
  data: UpdateTradeInput
): Promise<Trade | null> {
  validate(UpdateTradeInputSchema, data);
  const trade = await repo.updateTradeById(id, data);
  if (trade) {
    invalidateTradeRelatedCaches();
    logger.info(`Trade mis à jour : id=${id}`);
    // Déterminer l'action la plus précise selon les champs modifiés
    if (data.status !== undefined) {
      void logActivity({
        tradeId: id,
        action: "status_changed",
        fieldName: "status",
        newValue: data.status,
        description: `Statut → ${data.status}`,
      }).catch(() => {});
    } else if (data.strategyId !== undefined) {
      void logActivity({
        tradeId: id,
        action: "strategy_changed",
        fieldName: "strategy_id",
        description: "Stratégie modifiée",
      }).catch(() => {});
    } else {
      const updatedFields = Object.keys(data).join(", ");
      void logActivity({
        tradeId: id,
        action: "trade_updated",
        description: `Trade mis à jour : ${updatedFields}`,
      }).catch(() => {});
    }
    void notifyIfTwoConsecutiveLosses(trade);
  }
  return trade;
}

/**
 * Raccourci pour fermer un trade (statut + prix de sortie + P&L).
 */
export async function closeTrade(
  id: number,
  data: {
    closedAt: string;
    exitPrice: number;
    grossPnl: number;
    netPnl: number;
    commission?: number;
    swap?: number;
  }
): Promise<Trade | null> {
  return updateTrade(id, {
    status: "closed",
    closedAt: data.closedAt,
    exitPrice: data.exitPrice,
    grossPnl: data.grossPnl,
    netPnl: data.netPnl,
    commission: data.commission,
    swap: data.swap,
  });
}

// ------------------------------------------------------------
// DELETE
// ------------------------------------------------------------

/**
 * Supprime un trade par son ID.
 * Les enregistrements liés (notes, screenshots, tags…) sont supprimés
 * automatiquement via ON DELETE CASCADE (si PRAGMA foreign_keys = ON).
 * Retourne true si la suppression a eu lieu, false si le trade n'existait pas.
 */
export async function deleteTrade(id: number): Promise<boolean> {
  // Enregistrer l'historique AVANT la suppression (CASCADE supprimera les logs après)
  const trade = await repo.findTradeById(id);
  const deleted = await repo.deleteTradeById(id);
  if (deleted) {
    invalidateTradeRelatedCaches();
    logger.info(`Trade supprimé : id=${id}`);
    // Note : ce log sera supprimé par CASCADE mais reste utile pour
    // d'eventuels systèmes de corbeille futurs.
    if (trade) {
      void logActivity({
        tradeId: id,
        action: "trade_deleted",
        description: `Trade supprimé : ${trade.symbol} ${trade.side}`,
      }).catch(() => {});
    }
  }
  return deleted;
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------

/** Compte le nombre total de trades (avec filtres optionnels). */
export async function countTrades(filters: TradeFilters = {}): Promise<number> {
  return repo.countTrades(filters);
}

/** Retourne true si un trade avec cet external_id + account_id existe déjà. */
export async function tradeExistsByExternalId(
  externalId: string,
  accountId: string
): Promise<boolean> {
  return repo.tradeExistsByExternalId(externalId, accountId);
}
