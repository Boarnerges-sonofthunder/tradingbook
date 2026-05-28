// ============================================================
// MT5 Trade Detection Service - TradingBook
// ============================================================
// Phase 6 Etape 6 - Detection fine avant synchronisation SQLite.
//
// Role:
//   - Classer chaque candidat MT5 avant toute ecriture.
//   - Bloquer les doublons exacts et les doublons probables.
//   - Produire uniquement les insertions nouvelles et les mises a jour utiles.
//
// Regle de securite:
//   Ce service ne lit que SQLite et ne touche jamais a MT5. Les mises a jour
//   produites ne contiennent que des champs techniques MT5, jamais les donnees
//   enrichies manuellement par l'utilisateur.
// ============================================================

import { findTradesForDeduplication } from "../../repositories/tradesRepository";
import type { CreateTradeInput, Trade, UpdateTradeInput } from "../../types";
import { createLogger } from "../logging";

const logger = createLogger("mt5-trade-detection");

const EXACT_TIME_TOLERANCE_SECONDS = 60;
const PROBABLE_TIME_TOLERANCE_SECONDS = 300;
const EXACT_REL_TOLERANCE = 0.0001;
const PROBABLE_PRICE_REL_TOLERANCE = 0.0005;
const MONEY_TOLERANCE = 0.01;
const PRICE_CHANGE_TOLERANCE = 0.0000001;
const MAX_TIME_OFFSET_CORRECTION_SECONDS = 14 * 60 * 60;
const TIME_OFFSET_CORRECTION_TOLERANCE_SECONDS = 120;
const MAX_DETECTION_MESSAGES = 20;
const RECENT_CLOSED_REFRESH_LIMIT = 10;
const MT5_ATTACH_PROBABLE_SCORE = 0.85;

export type MT5DetectedTradeStatus =
  | "new"
  | "already_existing"
  | "needs_update"
  | "probable_duplicate"
  | "invalid";

export type MT5TradeUpdateReason =
  | "close_trade"
  | "refresh_open_trade"
  | "refresh_recent_closed_trade"
  | "backfill_missing_mt5_fields";

export interface MT5TradeToInsert {
  data: CreateTradeInput;
}

export interface MT5TradeToUpdate {
  id: number;
  externalId: string;
  data: UpdateTradeInput;
  reason: MT5TradeUpdateReason;
  changedFields: string[];
}

export interface MT5DetectedTrade {
  status: MT5DetectedTradeStatus;
  candidate: CreateTradeInput;
  existingTradeId?: number;
  reason: string;
  score?: number;
  changedFields?: string[];
  issues?: string[];
}

export interface MT5TradeDetectionResult {
  toInsert: MT5TradeToInsert[];
  toUpdate: MT5TradeToUpdate[];
  alreadyExisting: MT5DetectedTrade[];
  probableDuplicates: MT5DetectedTrade[];
  invalid: MT5DetectedTrade[];
  messages: string[];
}

interface ProbableMatch {
  trade: Trade;
  score: number;
  reason: string;
}

/**
 * Classe les candidats MT5 en nouveaux, existants, updates, doublons probables
 * et invalides. Les doublons probables sont seulement signales: ils ne sont
 * jamais importes automatiquement.
 */
export async function detectMT5Trades(
  candidates: CreateTradeInput[],
): Promise<MT5TradeDetectionResult> {
  const result: MT5TradeDetectionResult = {
    toInsert: [],
    toUpdate: [],
    alreadyExisting: [],
    probableDuplicates: [],
    invalid: [],
    messages: [],
  };

  if (candidates.length === 0) {
    logger.debug("detectMT5Trades : aucun candidat MT5");
    return result;
  }

  const symbols = uniqueStrings(candidates.map((candidate) => candidate.symbol));
  const externalIds = uniqueStrings(
    candidates.map((candidate) => candidate.externalId ?? null),
  );

  let existingTrades: Trade[] = [];
  try {
    existingTrades = await findTradesForDeduplication(symbols, externalIds);
  } catch (err) {
    const message = `Detection MT5: lecture dedup indisponible (${String(err)})`;
    logger.error(message);
    pushMessage(result, message);
  }
  const acceptedBatchKeys = new Set<string>();
  const recentClosedExternalIds = buildRecentClosedExternalIdSet(
    candidates,
    RECENT_CLOSED_REFRESH_LIMIT,
  );

  logger.debug(
    `Detection MT5 : ${candidates.length} candidats, ${existingTrades.length} trades locaux charges`,
  );

  for (const candidate of candidates) {
    try {
    const validationIssues = validateCandidate(candidate);

    if (validationIssues.length > 0) {
      const detected = buildDetectedTrade(
        "invalid",
        candidate,
        `Candidat MT5 invalide : ${validationIssues.join(", ")}`,
        { issues: validationIssues },
      );
      result.invalid.push(detected);
      pushMessage(result, detected.reason);
      continue;
    }

    const exactExternal = findExactExternalMatch(candidate, existingTrades);
    if (exactExternal) {
      classifyExistingExternalMatch(
        candidate,
        exactExternal,
        result,
        recentClosedExternalIds,
      );
      continue;
    }

    const externalConflict = findExternalContextConflict(candidate, existingTrades);
    if (externalConflict) {
      const conflictUpdate = buildRefreshForExternalContextConflict(
        externalConflict,
        candidate,
      );
      if (conflictUpdate) {
        result.toUpdate.push({
          id: externalConflict.id,
          externalId: candidate.externalId ?? externalConflict.externalId ?? "(none)",
          data: conflictUpdate.data,
          reason: conflictUpdate.reason,
          changedFields: conflictUpdate.changedFields,
        });
        pushMessage(
          result,
          `Trade #${externalConflict.id} rattache a MT5 malgre un contexte different`,
        );
        continue;
      }

      const detected = buildDetectedTrade(
        "probable_duplicate",
        candidate,
        `Identifiant externe deja present avec un contexte different (#${externalConflict.id})`,
        { existingTradeId: externalConflict.id, score: 0.95 },
      );
      result.probableDuplicates.push(detected);
      pushMessage(result, detected.reason);
      logger.warn(detected.reason);
      continue;
    }

    const exactFingerprint = findExactFingerprintMatch(candidate, existingTrades);
    if (exactFingerprint) {
      const fingerprintUpdate = buildRefreshForExactFingerprintExisting(
        exactFingerprint,
        candidate,
        recentClosedExternalIds,
      );
      if (fingerprintUpdate) {
        result.toUpdate.push({
          id: exactFingerprint.id,
          externalId: candidate.externalId ?? exactFingerprint.externalId ?? "(none)",
          data: fingerprintUpdate.data,
          reason: fingerprintUpdate.reason,
          changedFields: fingerprintUpdate.changedFields,
        });
        continue;
      }

      result.alreadyExisting.push(
        buildDetectedTrade(
          "already_existing",
          candidate,
          `Empreinte exacte deja presente (#${exactFingerprint.id})`,
          { existingTradeId: exactFingerprint.id },
        ),
      );
      continue;
    }

    const probable = findProbableDuplicate(candidate, existingTrades);
    if (probable) {
      const probableUpdate = buildRefreshForProbableManualMatch(
        probable.trade,
        candidate,
        probable.score,
        recentClosedExternalIds,
      );
      if (probableUpdate) {
        result.toUpdate.push({
          id: probable.trade.id,
          externalId: candidate.externalId ?? probable.trade.externalId ?? "(none)",
          data: probableUpdate.data,
          reason: probableUpdate.reason,
          changedFields: probableUpdate.changedFields,
        });
        pushMessage(
          result,
          `Trade #${probable.trade.id} rattache a MT5 : ${probable.reason}`,
        );
        continue;
      }

      const detected = buildDetectedTrade(
        "probable_duplicate",
        candidate,
        `Doublon probable avec #${probable.trade.id} : ${probable.reason}`,
        { existingTradeId: probable.trade.id, score: probable.score },
      );
      result.probableDuplicates.push(detected);
      pushMessage(result, detected.reason);
      logger.warn(detected.reason);
      continue;
    }

    const batchKey = buildBatchKey(candidate);
    if (acceptedBatchKeys.has(batchKey)) {
      const detected = buildDetectedTrade(
        "probable_duplicate",
        candidate,
        "Doublon probable dans le lot MT5 courant",
        { score: 0.9 },
      );
      result.probableDuplicates.push(detected);
      pushMessage(result, detected.reason);
      logger.warn(detected.reason);
      continue;
    }

    acceptedBatchKeys.add(batchKey);
    result.toInsert.push({ data: candidate });
    } catch (err) {
      const message = `Candidat MT5 ignore (erreur detection): ${String(err)}`;
      logger.error(message);
      const detected = buildDetectedTrade(
        "invalid",
        candidate,
        message,
        { issues: [String(err)] },
      );
      result.invalid.push(detected);
      pushMessage(result, detected.reason);
    }
  }

  logger.info(
    "Detection MT5 terminee : " +
      `${result.toInsert.length} nouveaux, ` +
      `${result.alreadyExisting.length} existants, ` +
      `${result.toUpdate.length} a mettre a jour, ` +
      `${result.probableDuplicates.length} doublons probables, ` +
      `${result.invalid.length} invalides`,
  );

  return result;
}

function buildRefreshForProbableManualMatch(
  existing: Trade,
  candidate: CreateTradeInput,
  score: number,
  recentClosedExternalIds: Set<string>,
): { data: UpdateTradeInput; reason: MT5TradeUpdateReason; changedFields: string[] } | null {
  if (score < MT5_ATTACH_PROBABLE_SCORE) return null;
  if (existing.platform === "mt5" && existing.source === "mt5") return null;

  return buildRefreshForExactFingerprintExisting(
    existing,
    candidate,
    recentClosedExternalIds,
  );
}

function classifyExistingExternalMatch(
  candidate: CreateTradeInput,
  existing: Trade,
  result: MT5TradeDetectionResult,
  recentClosedExternalIds: Set<string>,
): void {
  const update = buildUpdateForOpenExisting(existing, candidate);

  if (update) {
    result.toUpdate.push({
      id: existing.id,
      externalId: existing.externalId ?? candidate.externalId ?? "(none)",
      data: update.data,
      reason: update.reason,
      changedFields: update.changedFields,
    });
    return;
  }

  const refreshClosed = buildRefreshForRecentClosedExisting(
    existing,
    candidate,
    recentClosedExternalIds,
  );
  if (refreshClosed) {
    result.toUpdate.push({
      id: existing.id,
      externalId: existing.externalId ?? candidate.externalId ?? "(none)",
      data: refreshClosed.data,
      reason: refreshClosed.reason,
      changedFields: refreshClosed.changedFields,
    });
    return;
  }

  const backfill = buildBackfillForClosedExisting(existing, candidate);
  if (backfill) {
    result.toUpdate.push({
      id: existing.id,
      externalId: existing.externalId ?? candidate.externalId ?? "(none)",
      data: backfill.data,
      reason: backfill.reason,
      changedFields: backfill.changedFields,
    });
    return;
  }

  result.alreadyExisting.push(
    buildDetectedTrade(
      "already_existing",
      candidate,
      `Trade MT5 deja existant (#${existing.id})`,
      { existingTradeId: existing.id },
    ),
  );
}

function buildRefreshForExternalContextConflict(
  existing: Trade,
  candidate: CreateTradeInput,
): { data: UpdateTradeInput; reason: MT5TradeUpdateReason; changedFields: string[] } | null {
  if (!candidate.externalId) return null;
  if (existing.externalId !== candidate.externalId) return null;
  if (!candidate.externalId.startsWith("mt5_pos_")) return null;

  const data: UpdateTradeInput = {};
  const changedFields: string[] = [];

  if (existing.platform !== "mt5") {
    data.platform = "mt5";
    changedFields.push("platform");
  }
  if (existing.source !== "mt5") {
    data.source = "mt5";
    changedFields.push("source");
  }
  if (candidate.broker && existing.broker !== candidate.broker) {
    data.broker = candidate.broker;
    changedFields.push("broker");
  }
  if (candidate.accountId && existing.accountId !== candidate.accountId) {
    data.accountId = candidate.accountId;
    changedFields.push("accountId");
  }

  setStringIfChanged(data, changedFields, "closedAt", existing.closedAt, candidate.closedAt ?? null);
  setNumberIfChanged(data, changedFields, "entryPrice", existing.entryPrice, candidate.entryPrice, PRICE_CHANGE_TOLERANCE);
  setNumberIfChanged(data, changedFields, "exitPrice", existing.exitPrice, candidate.exitPrice ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfChanged(data, changedFields, "volume", existing.volume, candidate.volume, PRICE_CHANGE_TOLERANCE);
  setNumberIfChanged(data, changedFields, "grossPnl", existing.grossPnl, candidate.grossPnl ?? null, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "netPnl", existing.netPnl, candidate.netPnl ?? null, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "commission", existing.commission, candidate.commission ?? 0, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "swap", existing.swap, candidate.swap ?? 0, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "fees", existing.fees, candidate.fees ?? 0, MONEY_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "stopLoss", existing.stopLoss, candidate.stopLoss ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "takeProfit", existing.takeProfit, candidate.takeProfit ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "riskAmount", existing.riskAmount, candidate.riskAmount ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "rewardAmount", existing.rewardAmount, candidate.rewardAmount ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "riskRewardRatio", existing.riskRewardRatio, candidate.riskRewardRatio ?? null, MONEY_TOLERANCE);

  if (candidate.currency && existing.currency !== candidate.currency) {
    data.currency = candidate.currency;
    changedFields.push("currency");
  }

  return changedFields.length > 0
    ? { data, reason: "refresh_recent_closed_trade", changedFields }
    : null;
}

function buildRefreshForExactFingerprintExisting(
  existing: Trade,
  candidate: CreateTradeInput,
  recentClosedExternalIds: Set<string>,
): { data: UpdateTradeInput; reason: MT5TradeUpdateReason; changedFields: string[] } | null {
  const refresh = buildRefreshForRecentClosedExisting(
    existing,
    candidate,
    recentClosedExternalIds,
  );

  const data: UpdateTradeInput = { ...(refresh?.data ?? {}) };
  const changedFields = [...(refresh?.changedFields ?? [])];

  if (candidate.externalId && existing.externalId !== candidate.externalId) {
    data.externalId = candidate.externalId;
    changedFields.push("externalId");
  }
  if (existing.platform !== "mt5") {
    data.platform = "mt5";
    changedFields.push("platform");
  }
  if (existing.source !== "mt5") {
    data.source = "mt5";
    changedFields.push("source");
  }
  if (candidate.broker && existing.broker !== candidate.broker) {
    data.broker = candidate.broker;
    changedFields.push("broker");
  }
  if (candidate.accountId && existing.accountId !== candidate.accountId) {
    data.accountId = candidate.accountId;
    changedFields.push("accountId");
  }

  return changedFields.length > 0
    ? { data, reason: "refresh_recent_closed_trade", changedFields }
    : null;
}

function buildRefreshForRecentClosedExisting(
  existing: Trade,
  candidate: CreateTradeInput,
  recentClosedExternalIds: Set<string>,
): { data: UpdateTradeInput; reason: MT5TradeUpdateReason; changedFields: string[] } | null {
  if (existing.status !== "closed") return null;
  if ((candidate.status ?? "open") !== "closed") return null;
  if (!candidate.externalId || !recentClosedExternalIds.has(candidate.externalId)) {
    return null;
  }

  const data: UpdateTradeInput = {};
  const changedFields: string[] = [];

  setMt5TimeOffsetCorrectionIfNeeded(data, changedFields, existing, candidate);
  setStringIfChanged(data, changedFields, "closedAt", existing.closedAt, candidate.closedAt ?? null);
  setNumberIfChanged(data, changedFields, "entryPrice", existing.entryPrice, candidate.entryPrice, PRICE_CHANGE_TOLERANCE);
  setNumberIfChanged(data, changedFields, "exitPrice", existing.exitPrice, candidate.exitPrice ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfChanged(data, changedFields, "volume", existing.volume, candidate.volume, PRICE_CHANGE_TOLERANCE);
  setNumberIfChanged(data, changedFields, "grossPnl", existing.grossPnl, candidate.grossPnl ?? null, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "netPnl", existing.netPnl, candidate.netPnl ?? null, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "commission", existing.commission, candidate.commission ?? 0, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "swap", existing.swap, candidate.swap ?? 0, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "fees", existing.fees, candidate.fees ?? 0, MONEY_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "stopLoss", existing.stopLoss, candidate.stopLoss ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "takeProfit", existing.takeProfit, candidate.takeProfit ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "riskAmount", existing.riskAmount, candidate.riskAmount ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "rewardAmount", existing.rewardAmount, candidate.rewardAmount ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "riskRewardRatio", existing.riskRewardRatio, candidate.riskRewardRatio ?? null, MONEY_TOLERANCE);

  if (candidate.currency && existing.currency !== candidate.currency) {
    data.currency = candidate.currency;
    changedFields.push("currency");
  }

  return changedFields.length > 0
    ? { data, reason: "refresh_recent_closed_trade", changedFields }
    : null;
}

function buildBackfillForClosedExisting(
  existing: Trade,
  candidate: CreateTradeInput,
): { data: UpdateTradeInput; reason: MT5TradeUpdateReason; changedFields: string[] } | null {
  if (existing.status !== "closed") return null;
  if ((candidate.status ?? "open") !== "closed") return null;

  const data: UpdateTradeInput = {};
  const changedFields: string[] = [];

  setNumberIfMissing(data, changedFields, "stopLoss", existing.stopLoss, candidate.stopLoss ?? null);
  setNumberIfMissing(data, changedFields, "takeProfit", existing.takeProfit, candidate.takeProfit ?? null);
  setNumberIfMissing(data, changedFields, "riskAmount", existing.riskAmount, candidate.riskAmount ?? null);
  setNumberIfMissing(data, changedFields, "rewardAmount", existing.rewardAmount, candidate.rewardAmount ?? null);
  setNumberIfMissing(data, changedFields, "riskRewardRatio", existing.riskRewardRatio, candidate.riskRewardRatio ?? null);

  return changedFields.length > 0
    ? { data, reason: "backfill_missing_mt5_fields", changedFields }
    : null;
}

/**
 * Construit une update uniquement pour un trade local encore ouvert.
 * Un trade deja ferme dans SQLite reste la source de verite locale et n'est
 * jamais reecrit par une synchronisation ulterieure.
 */
function buildUpdateForOpenExisting(
  existing: Trade,
  candidate: CreateTradeInput,
): { data: UpdateTradeInput; reason: MT5TradeUpdateReason; changedFields: string[] } | null {
  if (existing.status !== "open") return null;

  const candidateStatus = candidate.status ?? "open";
  const data: UpdateTradeInput = {};
  const changedFields: string[] = [];

  setMt5TimeOffsetCorrectionIfNeeded(data, changedFields, existing, candidate);

  if (candidateStatus === "closed") {
    setStringIfChanged(data, changedFields, "status", existing.status, "closed");
    setStringIfChanged(data, changedFields, "closedAt", existing.closedAt, candidate.closedAt ?? null);
    setNumberIfChanged(data, changedFields, "exitPrice", existing.exitPrice, candidate.exitPrice ?? null, PRICE_CHANGE_TOLERANCE);
    setNumberIfChanged(data, changedFields, "grossPnl", existing.grossPnl, candidate.grossPnl ?? null, MONEY_TOLERANCE);
    setNumberIfChanged(data, changedFields, "netPnl", existing.netPnl, candidate.netPnl ?? null, MONEY_TOLERANCE);
    setNumberIfChanged(data, changedFields, "commission", existing.commission, candidate.commission ?? 0, MONEY_TOLERANCE);
    setNumberIfChanged(data, changedFields, "swap", existing.swap, candidate.swap ?? 0, MONEY_TOLERANCE);
    setNumberIfChanged(data, changedFields, "fees", existing.fees, candidate.fees ?? 0, MONEY_TOLERANCE);
    setNumberIfKnownChanged(data, changedFields, "stopLoss", existing.stopLoss, candidate.stopLoss ?? null, PRICE_CHANGE_TOLERANCE);
    setNumberIfKnownChanged(data, changedFields, "takeProfit", existing.takeProfit, candidate.takeProfit ?? null, PRICE_CHANGE_TOLERANCE);
    setNumberIfKnownChanged(data, changedFields, "riskAmount", existing.riskAmount, candidate.riskAmount ?? null, PRICE_CHANGE_TOLERANCE);
    setNumberIfKnownChanged(data, changedFields, "rewardAmount", existing.rewardAmount, candidate.rewardAmount ?? null, PRICE_CHANGE_TOLERANCE);
    setNumberIfKnownChanged(data, changedFields, "riskRewardRatio", existing.riskRewardRatio, candidate.riskRewardRatio ?? null, MONEY_TOLERANCE);

    return changedFields.length > 0
      ? { data, reason: "close_trade", changedFields }
      : null;
  }

  setNumberIfChanged(data, changedFields, "grossPnl", existing.grossPnl, candidate.grossPnl ?? null, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "netPnl", existing.netPnl, candidate.netPnl ?? null, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "commission", existing.commission, candidate.commission ?? 0, MONEY_TOLERANCE);
  setNumberIfChanged(data, changedFields, "swap", existing.swap, candidate.swap ?? 0, MONEY_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "stopLoss", existing.stopLoss, candidate.stopLoss ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "takeProfit", existing.takeProfit, candidate.takeProfit ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "riskAmount", existing.riskAmount, candidate.riskAmount ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "rewardAmount", existing.rewardAmount, candidate.rewardAmount ?? null, PRICE_CHANGE_TOLERANCE);
  setNumberIfKnownChanged(data, changedFields, "riskRewardRatio", existing.riskRewardRatio, candidate.riskRewardRatio ?? null, MONEY_TOLERANCE);

  return changedFields.length > 0
    ? { data, reason: "refresh_open_trade", changedFields }
    : null;
}

function validateCandidate(candidate: CreateTradeInput): string[] {
  const issues: string[] = [];
  const status = candidate.status ?? "open";

  if (!candidate.symbol || candidate.symbol.trim().length === 0) {
    issues.push("symbole manquant");
  }

  if (candidate.side !== "buy" && candidate.side !== "sell") {
    issues.push("type buy/sell invalide");
  }

  if (!isPositiveFinite(candidate.volume)) {
    issues.push("volume invalide");
  }

  if (!isPositiveFinite(candidate.entryPrice)) {
    issues.push("prix d'entree manquant ou invalide");
  }

  if (!isValidDate(candidate.openedAt)) {
    issues.push("date d'ouverture invalide");
  }

  if (status !== "open" && status !== "closed" && status !== "cancelled") {
    issues.push("statut invalide");
  }

  if (status === "closed") {
    if (!isValidDate(candidate.closedAt ?? null)) {
      issues.push("date de cloture invalide");
    }
    if (!isPositiveFinite(candidate.exitPrice ?? null)) {
      issues.push("prix de sortie manquant ou invalide");
    }
  }

  return issues;
}

function findExactExternalMatch(
  candidate: CreateTradeInput,
  existingTrades: Trade[],
): Trade | null {
  if (!candidate.externalId) return null;

  return (
    existingTrades.find(
      (trade) =>
        trade.externalId === candidate.externalId &&
        trade.platform === (candidate.platform ?? "mt5") &&
        trade.source === (candidate.source ?? "mt5") &&
        contextCompatible(candidate, trade),
    ) ?? null
  );
}

function findExternalContextConflict(
  candidate: CreateTradeInput,
  existingTrades: Trade[],
): Trade | null {
  if (!candidate.externalId) return null;

  return (
    existingTrades.find((trade) => {
      if (trade.externalId !== candidate.externalId) return false;
      if (!accountCompatible(candidate.accountId ?? null, trade.accountId)) return false;

      const platformDiffers = trade.platform !== (candidate.platform ?? "mt5");
      const sourceDiffers = trade.source !== (candidate.source ?? "mt5");
      const brokerDiffers = !brokerCompatible(candidate.broker ?? null, trade.broker);

      return platformDiffers || sourceDiffers || brokerDiffers;
    }) ?? null
  );
}

function findExactFingerprintMatch(
  candidate: CreateTradeInput,
  existingTrades: Trade[],
): Trade | null {
  const candidateStatus = candidate.status ?? "open";

  return (
    existingTrades.find((trade) => {
      if (isDistinctMT5Trade(candidate, trade)) return false;
      if (!contextCompatible(candidate, trade)) return false;
      if (normalizeText(trade.symbol) !== normalizeText(candidate.symbol)) return false;
      if (trade.side !== candidate.side) return false;
      if (trade.status !== candidateStatus) return false;
      if (secondsDiff(trade.openedAt, candidate.openedAt) > EXACT_TIME_TOLERANCE_SECONDS) return false;
      if (!approxEqualRel(trade.entryPrice, candidate.entryPrice, EXACT_REL_TOLERANCE)) return false;
      if (!approxEqualRel(trade.volume, candidate.volume, EXACT_REL_TOLERANCE)) return false;

      if (candidateStatus === "closed") {
        if (!candidate.closedAt || !trade.closedAt) return false;
        if (secondsDiff(trade.closedAt, candidate.closedAt) > EXACT_TIME_TOLERANCE_SECONDS) return false;
        if (!numbersCompatible(trade.exitPrice, candidate.exitPrice ?? null, PRICE_CHANGE_TOLERANCE)) return false;
      }

      if (
        candidate.netPnl !== null &&
        candidate.netPnl !== undefined &&
        trade.netPnl !== null &&
        !approxEqualAbs(trade.netPnl, candidate.netPnl, MONEY_TOLERANCE)
      ) {
        return false;
      }

      return true;
    }) ?? null
  );
}

function findProbableDuplicate(
  candidate: CreateTradeInput,
  existingTrades: Trade[],
): ProbableMatch | null {
  let best: ProbableMatch | null = null;

  for (const trade of existingTrades) {
    if (isDistinctMT5Trade(candidate, trade)) continue;
    if (!contextCompatible(candidate, trade)) continue;
    if (normalizeText(trade.symbol) !== normalizeText(candidate.symbol)) continue;
    if (trade.side !== candidate.side) continue;

    const openedDiff = secondsDiff(trade.openedAt, candidate.openedAt);
    if (openedDiff > PROBABLE_TIME_TOLERANCE_SECONDS) continue;
    if (!approxEqualRel(trade.volume, candidate.volume, EXACT_REL_TOLERANCE)) continue;
    if (!approxEqualRel(trade.entryPrice, candidate.entryPrice, PROBABLE_PRICE_REL_TOLERANCE)) continue;

    let score = 0.55;
    const reasons: string[] = ["meme symbole", "meme sens", "volume identique"];

    score += 0.2 * (1 - openedDiff / PROBABLE_TIME_TOLERANCE_SECONDS);
    reasons.push(
      openedDiff < 60
        ? `heure proche (${Math.round(openedDiff)}s)`
        : `heure proche (${Math.round(openedDiff / 60)}min)`,
    );

    score += 0.15;
    reasons.push("prix d'entree proche");

    if (
      candidate.netPnl !== null &&
      candidate.netPnl !== undefined &&
      trade.netPnl !== null &&
      approxEqualAbs(trade.netPnl, candidate.netPnl, Math.max(MONEY_TOLERANCE, Math.abs(candidate.netPnl) * 0.02))
    ) {
      score += 0.1;
      reasons.push("PnL proche");
    }

    if (score >= 0.7 && (!best || score > best.score)) {
      best = {
        trade,
        score: Math.min(score, 1),
        reason: reasons.join(", "),
      };
    }
  }

  return best;
}

/**
 * Deux trades MT5 portant deja des externalId differents doivent etre
 * consideres comme distincts, meme s'ils se ressemblent fortement
 * (meme symbole, meme sens, heure proche, volume identique, etc.).
 *
 * C'est important pour les comptes hedge, ou plusieurs positions ouvertes
 * peuvent exister en parallele sur le meme instrument.
 */
function isDistinctMT5Trade(candidate: CreateTradeInput, trade: Trade): boolean {
  if (!candidate.externalId || !trade.externalId) return false;
  if (candidate.externalId === trade.externalId) return false;

  return (
    (candidate.platform ?? "mt5") === "mt5" &&
    (candidate.source ?? "mt5") === "mt5" &&
    trade.platform === "mt5" &&
    trade.source === "mt5"
  );
}

function contextCompatible(candidate: CreateTradeInput, trade: Trade): boolean {
  return (
    accountCompatible(candidate.accountId ?? null, trade.accountId) &&
    brokerCompatible(candidate.broker ?? null, trade.broker)
  );
}

function accountCompatible(candidateAccountId: string | null, tradeAccountId: string | null): boolean {
  if (!candidateAccountId || !tradeAccountId) return true;
  return normalizeText(candidateAccountId) === normalizeText(tradeAccountId);
}

function brokerCompatible(candidateBroker: string | null, tradeBroker: string | null): boolean {
  if (!candidateBroker || !tradeBroker) return true;
  return normalizeText(candidateBroker) === normalizeText(tradeBroker);
}

function buildDetectedTrade(
  status: MT5DetectedTradeStatus,
  candidate: CreateTradeInput,
  reason: string,
  extra: {
    existingTradeId?: number;
    score?: number;
    changedFields?: string[];
    issues?: string[];
  } = {},
): MT5DetectedTrade {
  return {
    status,
    candidate,
    reason,
    existingTradeId: extra.existingTradeId,
    score: extra.score,
    changedFields: extra.changedFields,
    issues: extra.issues,
  };
}

function pushMessage(result: MT5TradeDetectionResult, message: string): void {
  if (result.messages.length < MAX_DETECTION_MESSAGES) {
    result.messages.push(message);
  }
}

function buildRecentClosedExternalIdSet(
  candidates: CreateTradeInput[],
  limit: number,
): Set<string> {
  return new Set(
    candidates
      .filter(
        (candidate) =>
          (candidate.status ?? "open") === "closed" && Boolean(candidate.externalId),
      )
      .sort((a, b) => tradeTimestamp(b) - tradeTimestamp(a))
      .slice(0, limit)
      .map((candidate) => candidate.externalId as string),
  );
}

function tradeTimestamp(candidate: CreateTradeInput): number {
  const closedAt = candidate.closedAt
    ? new Date(candidate.closedAt).getTime()
    : NaN;
  if (Number.isFinite(closedAt)) return closedAt;

  const openedAt = new Date(candidate.openedAt).getTime();
  return Number.isFinite(openedAt) ? openedAt : 0;
}

function setStringIfChanged<K extends keyof UpdateTradeInput>(
  data: UpdateTradeInput,
  changedFields: string[],
  field: K,
  currentValue: string | null,
  nextValue: string | null,
): void {
  if (currentValue !== nextValue) {
    data[field] = nextValue as UpdateTradeInput[K];
    changedFields.push(String(field));
  }
}

function setNumberIfChanged<K extends keyof UpdateTradeInput>(
  data: UpdateTradeInput,
  changedFields: string[],
  field: K,
  currentValue: number | null,
  nextValue: number | null,
  tolerance: number,
): void {
  if (!numbersCompatible(currentValue, nextValue, tolerance)) {
    data[field] = nextValue as UpdateTradeInput[K];
    changedFields.push(String(field));
  }
}

function setNumberIfKnownChanged<K extends keyof UpdateTradeInput>(
  data: UpdateTradeInput,
  changedFields: string[],
  field: K,
  currentValue: number | null,
  nextValue: number | null,
  tolerance: number,
): void {
  if (nextValue === null) return;
  setNumberIfChanged(data, changedFields, field, currentValue, nextValue, tolerance);
}

function setNumberIfMissing<K extends keyof UpdateTradeInput>(
  data: UpdateTradeInput,
  changedFields: string[],
  field: K,
  currentValue: number | null,
  nextValue: number | null,
): void {
  if (currentValue === null && nextValue !== null) {
    data[field] = nextValue as UpdateTradeInput[K];
    changedFields.push(String(field));
  }
}

function setMt5TimeOffsetCorrectionIfNeeded(
  data: UpdateTradeInput,
  changedFields: string[],
  existing: Trade,
  candidate: CreateTradeInput,
): void {
  if (!candidate.externalId || existing.externalId !== candidate.externalId) return;
  if (!candidate.externalId.startsWith("mt5_pos_")) return;
  if (existing.platform !== "mt5" || existing.source !== "mt5") return;
  if (!isPlausibleWholeHourOffset(existing.openedAt, candidate.openedAt)) return;

  data.openedAt = candidate.openedAt;
  changedFields.push("openedAt");
}

function numbersCompatible(
  currentValue: number | null,
  nextValue: number | null,
  tolerance: number,
): boolean {
  if (currentValue === null && nextValue === null) return true;
  if (currentValue === null || nextValue === null) return false;
  return Math.abs(currentValue - nextValue) <= tolerance;
}

function approxEqualRel(a: number, b: number, relTol: number): boolean {
  const maxAbs = Math.max(Math.abs(a), Math.abs(b), 0.0000001);
  return Math.abs(a - b) / maxAbs <= relTol;
}

function approxEqualAbs(a: number, b: number, absTol: number): boolean {
  return Math.abs(a - b) <= absTol;
}

function secondsDiff(a: string, b: string): number {
  const tsA = new Date(a).getTime();
  const tsB = new Date(b).getTime();
  if (!Number.isFinite(tsA) || !Number.isFinite(tsB)) return Infinity;
  return Math.abs(tsA - tsB) / 1000;
}

function isPlausibleWholeHourOffset(a: string, b: string): boolean {
  const diff = secondsDiff(a, b);
  if (!Number.isFinite(diff)) return false;
  if (diff <= EXACT_TIME_TOLERANCE_SECONDS) return false;
  if (diff > MAX_TIME_OFFSET_CORRECTION_SECONDS) return false;

  const roundedHours = Math.round(diff / 3600);
  if (roundedHours < 1 || roundedHours > 14) return false;

  return Math.abs(diff - roundedHours * 3600) <= TIME_OFFSET_CORRECTION_TOLERANCE_SECONDS;
}

function isPositiveFinite(value: number | null): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidDate(value: string | null): boolean {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildBatchKey(candidate: CreateTradeInput): string {
  if (candidate.externalId) {
    return [
      "external",
      normalizeText(candidate.externalId),
      normalizeText(candidate.accountId),
      normalizeText(candidate.platform ?? "mt5"),
    ].join("|");
  }

  return [
    "fingerprint",
    normalizeText(candidate.symbol),
    candidate.side,
    new Date(candidate.openedAt).getTime(),
    candidate.entryPrice.toFixed(8),
    candidate.volume.toFixed(8),
    candidate.netPnl ?? "",
  ].join("|");
}
