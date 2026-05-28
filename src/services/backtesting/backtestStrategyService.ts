// ============================================================
// Service — Backtest Strategies
// ============================================================

import { createLogger } from "../logging";
import {
  deleteBacktestStrategyById,
  findBacktestStrategies,
  findBacktestStrategyById,
  insertBacktestStrategy,
  updateBacktestStrategyById,
} from "../../repositories";
import type { BacktestStrategy, BacktestStrategyInput } from "../../types";
import {
  BacktestStrategyInputSchema,
  UpdateBacktestStrategyInputSchema,
  validate,
} from "../../validation";

const logger = createLogger("backtest-strategy");

export async function createBacktestStrategy(
  input: BacktestStrategyInput,
): Promise<BacktestStrategy> {
  validate(BacktestStrategyInputSchema, input);
  const strategy = await insertBacktestStrategy(input);
  logger.info(`Strategie backtest creee: id=${strategy.id} symbol=${strategy.symbol}`);
  return strategy;
}

export async function getBacktestStrategies(): Promise<BacktestStrategy[]> {
  return findBacktestStrategies();
}

export async function getBacktestStrategyById(
  id: number,
): Promise<BacktestStrategy | null> {
  return findBacktestStrategyById(id);
}

export async function updateBacktestStrategy(
  id: number,
  input: Partial<BacktestStrategyInput>,
): Promise<BacktestStrategy | null> {
  validate(UpdateBacktestStrategyInputSchema, input);
  const updated = await updateBacktestStrategyById(id, input);
  if (updated) {
    logger.info(`Strategie backtest mise a jour: id=${id}`);
  }
  return updated;
}

export async function deleteBacktestStrategy(id: number): Promise<boolean> {
  const deleted = await deleteBacktestStrategyById(id);
  if (deleted) {
    logger.info(`Strategie backtest supprimee: id=${id}`);
  }
  return deleted;
}
