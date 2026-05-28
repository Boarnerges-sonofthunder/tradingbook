// ============================================================
// Service — Backtest Results persistence + consultation
// ============================================================

import {
  compareBacktestRuns,
  findBacktestEquityPointsByRunId,
  findBacktestRunById,
  findBacktestRuns,
  findBacktestTradesByRunId,
  insertBacktestEquityPoints,
  insertBacktestRun,
  insertBacktestTrades,
} from "../../repositories";
import type {
  BacktestComparisonItem,
  BacktestEquityPoint,
  BacktestRun,
  BacktestRunDetails,
} from "../../types";
import type { InsertBacktestEquityPointInput, InsertBacktestRunInput } from "../../repositories/backtestRunsRepository";
import type { InsertBacktestTradeInput } from "../../repositories/backtestTradesRepository";

export interface SaveBacktestRunPayload {
  run: InsertBacktestRunInput;
  trades: Omit<InsertBacktestTradeInput, "runId">[];
  equityPoints: Omit<InsertBacktestEquityPointInput, "runId">[];
}

export interface SaveBacktestRunResult {
  run: BacktestRun;
  tradesInserted: number;
  equityPointsInserted: number;
}

/**
 * Sauvegarde execution complete en 3 tables (run, trades, equity).
 */
export async function saveBacktestRun(
  payload: SaveBacktestRunPayload,
): Promise<SaveBacktestRunResult> {
  const run = await insertBacktestRun(payload.run);

  const tradesInserted = await insertBacktestTrades(
    payload.trades.map((trade) => ({
      ...trade,
      runId: run.id,
    })),
  );

  const equityPointsInserted = await insertBacktestEquityPoints(
    payload.equityPoints.map((point) => ({
      ...point,
      runId: run.id,
    })),
  );

  return {
    run,
    tradesInserted,
    equityPointsInserted,
  };
}

export async function getBacktestRuns(limit = 80): Promise<BacktestRun[]> {
  return findBacktestRuns(limit);
}

export async function getBacktestRunDetails(
  runId: number,
): Promise<BacktestRunDetails | null> {
  const run = await findBacktestRunById(runId);
  if (!run) {
    return null;
  }

  const [trades, equityPoints] = await Promise.all([
    findBacktestTradesByRunId(runId),
    findBacktestEquityPointsByRunId(runId),
  ]);

  return {
    run,
    trades,
    equityPoints,
  };
}

export async function getBacktestComparison(
  runIds: number[],
): Promise<BacktestComparisonItem[]> {
  return compareBacktestRuns(runIds);
}

export async function getBacktestRunEquityPoints(
  runId: number,
): Promise<BacktestEquityPoint[]> {
  return findBacktestEquityPointsByRunId(runId);
}
