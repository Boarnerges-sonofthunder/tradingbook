// ============================================================
// MT5 Sync Service — TradingBook
// ============================================================
// Phase 6 Étape 5 — Orchestrateur principal de la synchronisation MT5.
//
// RÔLE :
//   Exécuter une synchronisation complète entre MT5 et la base SQLite TradingBook.
//   Lit les données MT5 (historique + positions ouvertes) via le bridge Python,
//   mappe et déduplique les trades, puis écrit dans SQLite.
//
// FLUX DÉTAILLÉ :
//   1. Créer un log local dans mt5_sync_logs (status = "running")
//   2. En parallèle :
//      - Récupérer l'historique MT5 (deals fermés, période configurable)
//      - Récupérer les positions ouvertes
//      Les deux fetches sont indépendants — une erreur sur l'un ne bloque pas l'autre.
//   3. Mapper les deals groupés par positionId → CreateTradeInput[] (trades fermés)
//   4. Mapper les positions ouvertes → CreateTradeInput[] (trades ouverts)
//   5. Dédupliquer les candidats vs SQLite par externalId = "mt5_pos_{positionId}"
//   6. Insérer les nouveaux trades un par un (toInsert)
//   7. Mettre à jour les trades existants un par un (toUpdate)
//   8. Terminer le log (success / partial_success / failed)
//   9. Retourner le MT5SyncReport complet
//
// GESTION DES ERREURS :
//   - Ce service ne lève JAMAIS d'exception (never throws).
//   - Les erreurs individuelles d'insertion/mise à jour sont comptées dans le rapport.
//   - Une erreur critique (MT5 inaccessible + aucun candidat) → status "failed"
//   - Des erreurs partielles → status "success" avec errors > 0
//
// SÉCURITÉ :
//   - LECTURE SEULE côté MT5 : aucun ordre envoyé à MT5
//   - Les données utilisateur (notes, stratégie, tags) ne sont jamais écrasées
//   - Le log d'erreur est limité à 20 messages pour éviter de surcharger l'UI
//
// PARAMÈTRES :
//   period     — période de l'historique ("7d" | "30d" | "90d" | "1y" | "all" | "custom")
//   fromDate   — date de début si period = "custom" (ISO 8601 optionnel)
//   toDate     — date de fin si period = "custom" (ISO 8601 optionnel)
// ============================================================

import { createLogger } from "../logging";
import { invalidateTradeRelatedCaches } from "../cache/domainCache";
import { syncMT5MarketDataForReplay } from "../charts/marketDataSyncService";
import { runMarketDataRetention } from "../charts/marketDataRetentionService";
import { fetchMT5History } from "./mt5HistoryService";
import { fetchMT5Positions } from "./mt5OpenPositionsService";
import { mapDealsToTrades, mapPositionsToTrades } from "./mt5MappingService";
import { detectMT5Trades } from "./mt5TradeDetectionService";
import { buildMT5ResultError } from "./mt5ErrorService";
import { finishMT5SyncLog, startMT5SyncLog } from "./mt5SyncLogService";
import { inferTradingAccountTypeFromText } from "../tradingAccounts/accountTypeInference";
import {
  findTradesByExternalIds,
  insertTrade,
  updateTradeById,
} from "../../repositories/tradesRepository";
import { resolveTradingAccount } from "../tradingAccounts/tradingAccountsService";
import type { MT5HistoryPeriod } from "../../types/mt5";
import type { MT5SyncReport, MT5SyncStatus } from "../../types/mt5";
import type { MT5SyncLogStatus } from "../../repositories/mt5SyncLogsRepository";
import type { ChartTimeframe } from "../../types";

export type { MT5SyncStatus };

const logger = createLogger("mt5-sync");

// ─── Types publics ─────────────────────────────────────────

/** Options de synchronisation MT5. */
export interface MT5SyncOptions {
  /** Période de l'historique (défaut : "30d"). */
  period?: MT5HistoryPeriod;
  /** Date de début si period = "custom" (ISO 8601). */
  fromDate?: string | null;
  /** Date de fin si period = "custom" (ISO 8601). */
  toDate?: string | null;
  /** Active la sync OHLC locale pour replay. */
  syncReplayMarketData?: boolean;
  /** Timeframes OHLC à synchroniser depuis MT5 bridge. */
  replayMarketDataTimeframes?: ChartTimeframe[];
  /** Rétention locale OHLC en jours. */
  replayMarketDataRetentionDays?: number;
}

// ─── Constante ─────────────────────────────────────────────

const MAX_ERROR_MESSAGES = 20;

// ─── Fonction principale ───────────────────────────────────

/**
 * Exécute une synchronisation complète MT5 → SQLite.
 *
 * Ne lève jamais d'exception. Toutes les erreurs sont capturées
 * et incluses dans le MT5SyncReport retourné.
 *
 * @param options — paramètres optionnels (période, dates)
 * @returns       — rapport complet de la synchronisation
 */
export async function runMT5Sync(
  options: MT5SyncOptions = {},
): Promise<MT5SyncReport> {
  const period = options.period ?? "30d";
  const fromDate = options.fromDate ?? null;
  const toDate = options.toDate ?? null;
  // Désactivé par défaut pour garder une sync MT5 rapide et centrée trades.
  const syncReplayMarketData = options.syncReplayMarketData ?? false;
  const startedAt = new Date().toISOString();

  logger.info(`Démarrage synchronisation MT5 — période: ${period}`);

  // Étape 1 : ouvrir le log fonctionnel local de cette synchronisation.
  let logId: number | undefined;
  try {
    const log = await startMT5SyncLog({ startedAt });
    logId = log.id;
    logger.debug(`Log de sync créé avec id=${logId}`);
  } catch (err) {
    logger.warn(`Impossible de créer le log de sync : ${String(err)}`);
    // On continue sans log — la sync peut toujours être faite
  }

  // ── Étape 2 : Récupérer historique + positions en parallèle ──
  logger.debug("Fetching historique MT5 et positions ouvertes en parallèle…");
  const [historyResult, positionsResult] = await Promise.allSettled([
    fetchMT5History(period, fromDate, toDate),
    fetchMT5Positions(),
  ]);

  // Extraire les résultats (sans throw si une des deux fetches a échoué)
  const history = historyResult.status === "fulfilled" ? historyResult.value : null;
  const positions = positionsResult.status === "fulfilled" ? positionsResult.value : null;

  if (historyResult.status === "rejected") {
    const error = buildMT5ResultError({
      code: "BRIDGE_EXECUTION_FAILED",
      message: String(historyResult.reason),
      technicalDetails: historyResult.reason,
      context: "sync-history",
    });
    logger.error(`fetchMT5History a rejeté la promesse : ${error.message}`);
  }
  if (positionsResult.status === "rejected") {
    const error = buildMT5ResultError({
      code: "BRIDGE_EXECUTION_FAILED",
      message: String(positionsResult.reason),
      technicalDetails: positionsResult.reason,
      context: "sync-positions",
    });
    logger.error(`fetchMT5Positions a rejeté la promesse : ${error.message}`);
  }

  // ── Extraire les données MT5 ──────────────────────────────────
  const deals = history?.success ? (history.deals ?? []) : [];
  const positionsList = positions?.success ? (positions.positions ?? []) : [];

  // Contexte de compte MT5 (présent si au moins une fetch a réussi)
  // Fallback critique: certains bridges renvoient account/server sans accountId/broker.
  const rawAccount = history?.account ?? positions?.account;
  const rawServer = history?.server ?? positions?.server;
  const rawBroker = history?.broker ?? positions?.broker;
  const accountCtx = {
    account: rawAccount,
    accountId:
      history?.accountId ??
      positions?.accountId ??
      (rawAccount !== undefined && rawAccount !== null ? String(rawAccount) : undefined),
    server: rawServer,
    broker: rawBroker ?? rawServer,
    currency: history?.currency ?? positions?.currency,
  };

  logger.debug(
    `MT5 — ${deals.length} deals, ${positionsList.length} positions ouvertes`,
  );

  // ── Résoudre ou créer le compte trading lié à cette sync ─────
  let resolvedTradingAccountId: number | null = null;
  let resolvedBrokerId: number | null = null;
  const resolvedAccountNumber = accountCtx.accountId ??
    (accountCtx.account ? String(accountCtx.account) : null);
  if (resolvedAccountNumber) {
    try {
      const inferredAccountType = inferTradingAccountTypeFromText(
        accountCtx.server,
        accountCtx.broker,
        resolvedAccountNumber,
      );
      const account = await resolveTradingAccount({
        broker: accountCtx.broker ?? accountCtx.server ?? "MT5",
        platform: "mt5",
        accountNumber: resolvedAccountNumber,
        accountType: inferredAccountType,
        currency: accountCtx.currency ?? null,
      });
      resolvedTradingAccountId = account.id;
      resolvedBrokerId = account.brokerId ?? null;
      logger.debug(`Compte trading résolu : id=${account.id} "${account.name}"`);
    } catch (err) {
      logger.warn(`Impossible de résoudre le compte trading MT5 : ${String(err)}`);
    }
  }

  // ── Étape 3 : Mapper les deals MT5 → trades fermés ───────────
  const tradesFromHistory = mapDealsToTrades(deals, accountCtx);

  // ── Étape 4 : Mapper les positions ouvertes → trades ouverts ─
  const tradesFromPositions = mapPositionsToTrades(positionsList, accountCtx);

  // ── Étape 5 : Fusionner les candidats ─────────────────────────
  // Les positions ouvertes ont priorité sur les deals ouverts du même positionId.
  // Stratégie : garder les candidats de positions ouvertes et enlever les doublons
  // d'historique pour les trades status="open" (les "closed" de l'historique sont gardés).

  const openExternalIds = new Set(tradesFromPositions.map((t) => t.externalId));
  const filteredFromHistory = tradesFromHistory.filter(
    (t) => t.status === "closed" || !openExternalIds.has(t.externalId),
  );

  const allCandidates = [...filteredFromHistory, ...tradesFromPositions];

  logger.debug(
    `Candidats : ${filteredFromHistory.length} depuis historique + ${tradesFromPositions.length} positions = ${allCandidates.length} total`,
  );

  // ── Étape 6 : Détection fine avant toute écriture SQLite ───────
  let detectionResult;
  try {
    detectionResult = await detectMT5Trades(allCandidates);
  } catch (err) {
    const mt5Error = buildMT5ResultError({
      code: "MT5_DATA_INVALID",
      message: String(err),
      technicalDetails: err,
      context: "sync-detection",
    });
    logger.error(`Erreur de détection MT5 : ${mt5Error.message}`);
    // Erreur critique : on ne peut pas écrire sans classification fiable.
    const errorMsg = mt5Error.message;
    const finishedAt = new Date().toISOString();
    await safeFinishLog(logId, {
      status: "failed",
      finishedAt,
      accountId: accountCtx.accountId,
      tradingAccountId: resolvedTradingAccountId,
      broker: accountCtx.broker,
      brokerId: resolvedBrokerId,
      server: accountCtx.server,
      tradesRead: allCandidates.length,
      tradesAdded: 0,
      tradesUpdated: 0,
      duplicatesIgnored: 0,
      probableDuplicates: 0,
      invalidTrades: 0,
      errorMessage: errorMsg,
    });
    return buildReport({
      success: false,
      period,
      dealsRead: deals.length,
      positionsRead: positionsList.length,
      candidatesFromHistory: tradesFromHistory.length,
      candidatesFromPositions: tradesFromPositions.length,
      detectedNew: 0,
      detectedExisting: 0,
      detectedUpdates: 0,
      detectedProbableDuplicates: 0,
      detectedInvalid: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      errorMessages: [errorMsg],
      detectionMessages: [],
      accountCtx,
      message: errorMsg,
      syncedAt: finishedAt,
      logId,
    });
  }

  const { toInsert, toUpdate, alreadyExisting, probableDuplicates, invalid } =
    detectionResult;
  const errorMessages: string[] = [];
  const skipped = alreadyExisting.length + probableDuplicates.length + invalid.length;

  // ── Étape 7 : Insérer les nouveaux trades ─────────────────────
  let inserted = 0;
  let insertErrors = 0;
  let recoveredAsUpdate = 0;

  for (const candidate of toInsert) {
    try {
      // Injecter le compte trading résolu dans chaque trade
      const data = resolvedTradingAccountId
        ? {
            ...candidate.data,
            tradingAccountId: resolvedTradingAccountId,
            brokerId: resolvedBrokerId,
          }
        : candidate.data;
      await insertTrade(data);
      inserted++;
    } catch (err) {
      const data = resolvedTradingAccountId
        ? {
            ...candidate.data,
            tradingAccountId: resolvedTradingAccountId,
            brokerId: resolvedBrokerId,
          }
        : candidate.data;

      // Récupération robuste : si conflit unique, on tente une mise à jour
      // du trade déjà présent au lieu de compter une erreur partielle.
      if (isUniqueConstraintError(err) && data.externalId) {
        try {
          const existingByExternalId = await findTradesByExternalIds([
            data.externalId,
          ]);
          const existing = existingByExternalId.find((trade) => {
            if (trade.externalId !== data.externalId) return false;
            if ((trade.platform ?? "mt5") !== (data.platform ?? "mt5")) return false;
            if ((trade.source ?? "mt5") !== (data.source ?? "mt5")) return false;
            const tradeAccountId = trade.accountId ?? null;
            const dataAccountId = data.accountId ?? null;
            return tradeAccountId === dataAccountId;
          });

          if (existing) {
            await updateTradeById(existing.id, data);
            recoveredAsUpdate++;
            logger.warn(
              `Conflit unique resolu via update trade id=${existing.id} (${data.externalId})`,
            );
            continue;
          }
        } catch (recoveryErr) {
          logger.warn(
            `Echec recuperation conflit unique ${data.externalId}: ${String(recoveryErr)}`,
          );
        }
      }

      insertErrors++;
      const msg = `Erreur insertion ${candidate.data.externalId ?? "?"} : ${String(err)}`;
      logger.error(msg);
      if (errorMessages.length < MAX_ERROR_MESSAGES) {
        errorMessages.push(msg);
      }
    }
  }

  // ── Étape 8 : Mettre à jour les trades existants ──────────────
  let updated = recoveredAsUpdate;
  let updateErrors = 0;

  for (const candidate of toUpdate) {
    try {
      const data = resolvedTradingAccountId
        ? {
            ...candidate.data,
            tradingAccountId: resolvedTradingAccountId,
            brokerId: resolvedBrokerId,
          }
        : candidate.data;
      await updateTradeById(candidate.id, data);
      updated++;
      logger.debug(
        `Trade ${candidate.externalId} mis à jour (raison: ${candidate.reason})`,
      );
    } catch (err) {
      updateErrors++;
      const msg = `Erreur mise à jour ${candidate.externalId} (id=${candidate.id}) : ${String(err)}`;
      logger.error(msg);
      if (errorMessages.length < MAX_ERROR_MESSAGES) {
        errorMessages.push(msg);
      }
    }
  }

  const totalErrors = insertErrors + updateErrors;
  if (inserted > 0 || updated > 0) {
    // Le cache local reste tres court, mais la sync MT5 ecrit en direct
    // dans SQLite : on invalide aussitot les lectures derivees.
    invalidateTradeRelatedCaches();
  }
  // Note : success = true même si 0 trades (MT5 connecté, sync propre, rien de nouveau)

  // Vérifier si MT5 était inaccessible
  const historyFailed = !history?.success;
  const positionsFailed = !positions?.success;

  if (historyFailed && positionsFailed) {
    // Rien de récupéré du tout — erreur critique
    const msg = [
      history?.message ?? "Historique MT5 inaccessible",
      positions?.message ?? "Positions MT5 inaccessibles",
    ].join(" | ");
    logger.error(`Sync échouée : MT5 complètement inaccessible — ${msg}`);
    const finishedAt = new Date().toISOString();
    await safeFinishLog(logId, {
      status: "failed",
      finishedAt,
      accountId: accountCtx.accountId,
      tradingAccountId: resolvedTradingAccountId,
      broker: accountCtx.broker,
      brokerId: resolvedBrokerId,
      server: accountCtx.server,
      tradesRead: 0,
      tradesAdded: 0,
      tradesUpdated: 0,
      duplicatesIgnored: 0,
      probableDuplicates: 0,
      invalidTrades: 0,
      errorMessage: msg,
    });
    return buildReport({
      success: false,
      period,
      dealsRead: 0,
      positionsRead: 0,
      candidatesFromHistory: 0,
      candidatesFromPositions: 0,
      detectedNew: 0,
      detectedExisting: 0,
      detectedUpdates: 0,
      detectedProbableDuplicates: 0,
      detectedInvalid: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      errorMessages: [msg],
      detectionMessages: [],
      accountCtx,
      message: `Synchronisation échouée : impossible de contacter MT5. ${msg}`,
      syncedAt: finishedAt,
      logId,
    });
  }

  // ── Étape 9 : Mettre à jour le log ────────────────────────────
  const finishedAt = new Date().toISOString();
  const logStatus: MT5SyncLogStatus =
    totalErrors > 0 || historyFailed || positionsFailed
      ? "partial_success"
      : "success";
  const sourceMessages = [
    historyFailed ? (history?.message ?? "Historique MT5 inaccessible") : null,
    positionsFailed ? (positions?.message ?? "Positions MT5 inaccessibles") : null,
  ].filter((message): message is string => Boolean(message));
  const summaryMsg = buildSummaryMessage({
    inserted,
    updated,
    existing: alreadyExisting.length,
    probableDuplicates: probableDuplicates.length,
    invalid: invalid.length,
    errors: totalErrors,
    historyFailed,
    positionsFailed,
  });

  // ── Étape 9.5 : Sync OHLC locale replay (non bloquante) ─────────────
  if (syncReplayMarketData && (!historyFailed || !positionsFailed)) {
    const replayRange = resolveReplayMarketDataRange({
      period,
      fromDate,
      toDate,
      historyFromIso: history?.range?.from,
      historyToIso: history?.range?.to,
    });

    try {
      const marketSync = await syncMT5MarketDataForReplay({
        deals,
        positions: positionsList,
        broker: accountCtx.broker,
        accountId: accountCtx.accountId,
        fromIso: replayRange.fromIso,
        toIso: replayRange.toIso,
        platform: "mt5",
        timeframes: options.replayMarketDataTimeframes,
      });

      logger.info(
        `OHLC replay sync: ${marketSync.rowsUpserted} upsert(s), ${marketSync.candlesFetched} candle(s), ${marketSync.errors.length} erreur(s).`,
      );

      if (marketSync.errors.length > 0 && errorMessages.length < MAX_ERROR_MESSAGES) {
        errorMessages.push(`Sync OHLC partielle: ${marketSync.errors[0]}`);
      }

      const retention = await runMarketDataRetention(
        options.replayMarketDataRetentionDays ?? 120,
      );
      if (retention.deletedRows > 0) {
        logger.info(`Retention OHLC: ${retention.deletedRows} ligne(s) supprimée(s).`);
      }
    } catch (err) {
      const msg = `Echec sync OHLC replay: ${String(err)}`;
      logger.warn(msg);
      if (errorMessages.length < MAX_ERROR_MESSAGES) {
        errorMessages.push(msg);
      }
    }
  }

  await safeFinishLog(logId, {
    status: logStatus,
    finishedAt,
    accountId: accountCtx.accountId,
    tradingAccountId: resolvedTradingAccountId,
    broker: accountCtx.broker,
    brokerId: resolvedBrokerId,
    server: accountCtx.server,
    tradesRead: allCandidates.length,
    tradesAdded: inserted,
    tradesUpdated: updated,
    duplicatesIgnored: alreadyExisting.length,
    probableDuplicates: probableDuplicates.length,
    invalidTrades: invalid.length,
    errorMessage: buildLogMessage(
      [...sourceMessages, ...detectionResult.messages],
      errorMessages,
    ),
  });

  logger.info(
    `Sync terminée — ${inserted} insérés, ${updated} MàJ, ${skipped} ignorés, ${totalErrors} erreurs`,
  );

  return buildReport({
    success: true,
    period,
    dealsRead: deals.length,
    positionsRead: positionsList.length,
    candidatesFromHistory: tradesFromHistory.length,
    candidatesFromPositions: tradesFromPositions.length,
    detectedNew: toInsert.length,
    detectedExisting: alreadyExisting.length,
    detectedUpdates: toUpdate.length,
    detectedProbableDuplicates: probableDuplicates.length,
    detectedInvalid: invalid.length,
    inserted,
    updated,
    skipped,
    errors: totalErrors,
    errorMessages,
    detectionMessages: detectionResult.messages,
    accountCtx,
    message: summaryMsg,
    syncedAt: finishedAt,
    logId,
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes("unique constraint failed");
}

function resolveReplayMarketDataRange(params: {
  period: MT5HistoryPeriod;
  fromDate: string | null;
  toDate: string | null;
  historyFromIso?: string;
  historyToIso?: string;
}): { fromIso: string; toIso: string } {
  if (params.historyFromIso && params.historyToIso) {
    return {
      fromIso: params.historyFromIso,
      toIso: params.historyToIso,
    };
  }

  const now = new Date();
  const to = params.toDate ? new Date(params.toDate) : now;
  const toIso = Number.isFinite(to.getTime()) ? to.toISOString() : now.toISOString();

  if (params.period === "custom" && params.fromDate) {
    const from = new Date(params.fromDate);
    if (Number.isFinite(from.getTime())) {
      return {
        fromIso: from.toISOString(),
        toIso,
      };
    }
  }

  const lookbackDays = params.period === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  return {
    fromIso: from.toISOString(),
    toIso,
  };
}

// ─── Helpers internes ──────────────────────────────────────

/** Met à jour le log de sync sans jamais lever d'exception. */
async function safeFinishLog(
  logId: number | undefined,
  data: {
    status: MT5SyncLogStatus;
    finishedAt: string;
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
  },
): Promise<void> {
  if (!logId) return;
  try {
    await finishMT5SyncLog(logId, data);
  } catch (err) {
    logger.warn(`Impossible de mettre à jour le log ${logId} : ${String(err)}`);
  }
}

/** Construit un message de résumé lisible pour l'utilisateur. */
function buildSummaryMessage(params: {
  inserted: number;
  updated: number;
  existing: number;
  probableDuplicates: number;
  invalid: number;
  errors: number;
  historyFailed: boolean;
  positionsFailed: boolean;
}): string {
  const {
    inserted,
    updated,
    existing,
    probableDuplicates,
    invalid,
    errors,
    historyFailed,
    positionsFailed,
  } = params;

  const parts: string[] = [];

  if (historyFailed) parts.push("Historique MT5 inaccessible.");
  if (positionsFailed) parts.push("Positions MT5 inaccessibles.");

  if (
    inserted === 0 &&
    updated === 0 &&
    existing === 0 &&
    probableDuplicates === 0 &&
    invalid === 0 &&
    errors === 0
  ) {
    parts.push("Aucun nouveau trade à importer.");
  } else {
    if (inserted > 0) parts.push(`${inserted} trade${inserted > 1 ? "s" : ""} importé${inserted > 1 ? "s" : ""}.`);
    if (updated > 0) parts.push(`${updated} trade${updated > 1 ? "s" : ""} mis à jour.`);
    if (existing > 0) parts.push(`${existing} trade${existing > 1 ? "s" : ""} déjà existant${existing > 1 ? "s" : ""}.`);
    if (probableDuplicates > 0) parts.push(`${probableDuplicates} doublon${probableDuplicates > 1 ? "s" : ""} probable${probableDuplicates > 1 ? "s" : ""} non importé${probableDuplicates > 1 ? "s" : ""}.`);
    if (invalid > 0) parts.push(`${invalid} trade${invalid > 1 ? "s" : ""} invalide${invalid > 1 ? "s" : ""} ignoré${invalid > 1 ? "s" : ""}.`);
    if (errors > 0) parts.push(`${errors} erreur${errors > 1 ? "s" : ""}.`);
  }

  return parts.join(" ");
}

/** Prepare un resume compact pour mt5_sync_logs. */
function buildLogMessage(
  detectionMessages: string[],
  errorMessages: string[],
): string | null {
  const messages = [...errorMessages, ...detectionMessages].slice(
    0,
    MAX_ERROR_MESSAGES,
  );

  return messages.length > 0 ? messages.join("\n") : null;
}

/** Construit le MT5SyncReport final. */
function buildReport(params: {
  success: boolean;
  period: MT5HistoryPeriod;
  dealsRead: number;
  positionsRead: number;
  candidatesFromHistory: number;
  candidatesFromPositions: number;
  detectedNew: number;
  detectedExisting: number;
  detectedUpdates: number;
  detectedProbableDuplicates: number;
  detectedInvalid: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
  detectionMessages: string[];
  accountCtx: {
    account?: number;
    accountId?: string;
    server?: string;
    broker?: string;
    currency?: string;
  };
  message: string;
  syncedAt: string;
  logId?: number;
}): MT5SyncReport {
  return {
    success: params.success,
    period: params.period,
    dealsRead: params.dealsRead,
    positionsRead: params.positionsRead,
    candidatesFromHistory: params.candidatesFromHistory,
    candidatesFromPositions: params.candidatesFromPositions,
    detectedNew: params.detectedNew,
    detectedExisting: params.detectedExisting,
    detectedUpdates: params.detectedUpdates,
    detectedProbableDuplicates: params.detectedProbableDuplicates,
    detectedInvalid: params.detectedInvalid,
    inserted: params.inserted,
    updated: params.updated,
    skipped: params.skipped,
    errors: params.errors,
    errorMessages: params.errorMessages,
    detectionMessages: params.detectionMessages,
    account: params.accountCtx.account,
    accountId: params.accountCtx.accountId,
    server: params.accountCtx.server,
    broker: params.accountCtx.broker,
    currency: params.accountCtx.currency,
    message: params.message,
    syncedAt: params.syncedAt,
    logId: params.logId,
  };
}
