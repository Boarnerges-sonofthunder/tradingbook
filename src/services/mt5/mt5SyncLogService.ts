// ============================================================
// MT5 Sync Log Service - TradingBook
// ============================================================
// Service metier autour de `mt5_sync_logs`.
//
// Les logs de synchronisation MT5 sont des evenements fonctionnels locaux :
// ils indiquent quand une sync a commence, comment elle s'est terminee et
// quels compteurs ont ete produits. Les erreurs techniques detaillees restent
// dans le systeme de logs existant (`createLogger` / fichier local).
// ============================================================

import {
  findLastSyncLog,
  findRecentSyncLogs,
  insertSyncLog,
  updateSyncLogById,
  type MT5SyncLog,
  type MT5SyncLogStatus,
} from "../../repositories/mt5SyncLogsRepository";
import { createLogger } from "../logging";

const logger = createLogger("mt5-sync-log");

export interface StartMT5SyncLogInput {
  startedAt?: string;
  accountId?: string | null;
  tradingAccountId?: number | null;
  broker?: string | null;
  brokerId?: number | null;
  server?: string | null;
}

export interface FinishMT5SyncLogInput {
  status: MT5SyncLogStatus;
  finishedAt?: string;
  accountId?: string | null;
  tradingAccountId?: number | null;
  broker?: string | null;
  brokerId?: number | null;
  server?: string | null;
  tradesRead: number;
  tradesAdded: number;
  tradesUpdated: number;
  duplicatesIgnored: number;
  probableDuplicates: number;
  invalidTrades: number;
  errorMessage?: string | null;
}

export async function startMT5SyncLog(
  input: StartMT5SyncLogInput = {},
): Promise<MT5SyncLog> {
  const startedAt = input.startedAt ?? new Date().toISOString();

  const log = await insertSyncLog({
    status: "running",
    startedAt,
    accountId: input.accountId ?? null,
    tradingAccountId: input.tradingAccountId ?? null,
    broker: input.broker ?? null,
    brokerId: input.brokerId ?? null,
    server: input.server ?? null,
  });

  logger.debug(`Log MT5 demarre id=${log.id}`);
  return log;
}

export async function finishMT5SyncLog(
  logId: number,
  input: FinishMT5SyncLogInput,
): Promise<MT5SyncLog | null> {
  const finishedAt = input.finishedAt ?? new Date().toISOString();

  const log = await updateSyncLogById(logId, {
    status: input.status,
    finishedAt,
    accountId: input.accountId ?? null,
    tradingAccountId: input.tradingAccountId ?? null,
    broker: input.broker ?? null,
    brokerId: input.brokerId ?? null,
    server: input.server ?? null,
    tradesRead: input.tradesRead,
    tradesAdded: input.tradesAdded,
    tradesUpdated: input.tradesUpdated,
    duplicatesIgnored: input.duplicatesIgnored,
    probableDuplicates: input.probableDuplicates,
    invalidTrades: input.invalidTrades,
    errorMessage: input.errorMessage ?? null,
  });

  logger.debug(`Log MT5 termine id=${logId} status=${input.status}`);
  return log;
}

export async function getMT5SyncHistory(limit = 10): Promise<MT5SyncLog[]> {
  return findRecentSyncLogs(limit);
}

export async function getLastMT5SyncLog(): Promise<MT5SyncLog | null> {
  return findLastSyncLog();
}
