// ============================================================
// Service — Backtesting Engine
// ============================================================
// Moteur simulation historique (offline, local SQLite only).
// Ne place jamais ordre reel. Aucun lien execution MT5/MT4.
// ============================================================

import {
  findMarketDataCandles,
} from "../../repositories";
import {
  getBacktestStrategyById,
} from "./backtestStrategyService";
import {
  saveBacktestRun,
  type SaveBacktestRunResult,
} from "./backtestResultsService";
import {
  computeBacktestMetrics,
} from "./backtestMetricsService";
import type {
  BacktestRuleCondition,
  BacktestRuleSet,
  BacktestStrategy,
  MarketDataCandle,
} from "../../types";

interface OpenPosition {
  side: "buy" | "sell";
  openedAt: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
}

export interface RunBacktestOptions {
  strategyId: number;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function inferPointSize(symbol: string): number {
  return symbol.endsWith("JPY") ? 0.01 : 0.0001;
}

function evaluateCondition(
  condition: BacktestRuleCondition,
  candle: MarketDataCandle,
  previous: MarketDataCandle,
): boolean {
  const body = candle.open === 0 ? 0 : ((candle.close - candle.open) / candle.open) * 100;

  switch (condition.type) {
    case "close_above_open":
      return candle.close > candle.open;
    case "close_below_open":
      return candle.close < candle.open;
    case "close_above_prev_high":
      return candle.close > previous.high;
    case "close_below_prev_low":
      return candle.close < previous.low;
    case "body_percent_above":
      return body >= (condition.value ?? 0);
    case "body_percent_below":
      return body <= -(condition.value ?? 0);
    default:
      return false;
  }
}

function evaluateRuleSet(
  ruleSet: BacktestRuleSet,
  candle: MarketDataCandle,
  previous: MarketDataCandle,
): boolean {
  const evaluations = ruleSet.conditions.map((condition) =>
    evaluateCondition(condition, candle, previous),
  );

  if (ruleSet.operator === "any") {
    return evaluations.some(Boolean);
  }

  return evaluations.every(Boolean);
}

function isInSession(candleIso: string, session: string): boolean {
  if (!session || session === "all") {
    return true;
  }

  const hour = new Date(candleIso).getUTCHours();

  if (session === "asian") {
    return hour >= 0 && hour < 8;
  }
  if (session === "london") {
    return hour >= 7 && hour < 16;
  }
  if (session === "new_york") {
    return hour >= 13 && hour < 22;
  }

  return true;
}

function buildPosition(
  strategy: BacktestStrategy,
  candle: MarketDataCandle,
  side: "buy" | "sell",
  equity: number,
): OpenPosition | null {
  const entryPrice = candle.close;
  const riskAmount = equity * (strategy.riskPerTradePercent / 100);
  const stopDistance = entryPrice * (strategy.stopLossPercent / 100);

  if (!Number.isFinite(stopDistance) || stopDistance <= 0) {
    return null;
  }

  const tpDistanceByRatio = stopDistance * strategy.riskRewardRatio;
  const tpDistanceByPercent =
    strategy.takeProfitPercent > 0
      ? entryPrice * (strategy.takeProfitPercent / 100)
      : 0;
  const tpDistance = Math.max(tpDistanceByRatio, tpDistanceByPercent, stopDistance);
  const positionSize = riskAmount / stopDistance;

  if (!Number.isFinite(positionSize) || positionSize <= 0) {
    return null;
  }

  if (side === "buy") {
    return {
      side,
      openedAt: candle.timestamp,
      entryPrice,
      stopLoss: entryPrice - stopDistance,
      takeProfit: entryPrice + tpDistance,
      positionSize,
    };
  }

  return {
    side,
    openedAt: candle.timestamp,
    entryPrice,
    stopLoss: entryPrice + stopDistance,
    takeProfit: entryPrice - tpDistance,
    positionSize,
  };
}

function pickEntrySide(
  strategy: BacktestStrategy,
  candle: MarketDataCandle,
): "buy" | "sell" {
  if (strategy.direction === "long") {
    return "buy";
  }
  if (strategy.direction === "short") {
    return "sell";
  }
  return candle.close >= candle.open ? "buy" : "sell";
}

/**
 * Lance simulation historique complete puis persiste run+trades+equity.
 */
export async function runBacktest(
  options: RunBacktestOptions,
): Promise<SaveBacktestRunResult> {
  const strategy = await getBacktestStrategyById(options.strategyId);
  if (!strategy) {
    throw new Error("Strategie backtest introuvable");
  }

  const candles = await findMarketDataCandles({
    symbol: strategy.symbol,
    timeframe: strategy.timeframe,
    fromIso: strategy.testPeriodStart,
    toIso: strategy.testPeriodEnd,
  });

  if (candles.length < 3) {
    throw new Error("Pas assez de donnees OHLCV pour lancer backtest");
  }

  const startedAt = new Date().toISOString();
  let balance = strategy.initialCapital;
  let peak = strategy.initialCapital;
  let position: OpenPosition | null = null;
  const pointSize = inferPointSize(strategy.symbol);

  const trades: Array<{
    strategyId: number;
    symbol: string;
    timeframe: string;
    side: "buy" | "sell";
    openedAt: string;
    closedAt: string;
    entryPrice: number;
    exitPrice: number;
    stopLoss: number;
    takeProfit: number;
    positionSize: number;
    grossPnl: number;
    netPnl: number;
    commission: number;
    spreadCost: number;
    result: "win" | "loss" | "breakeven";
    exitReason: "stop_loss" | "take_profit" | "rule_exit" | "end_of_period";
  }> = [];

  const equityPoints: Array<{ timestamp: string; equity: number; drawdown: number }> = [];

  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const candle = candles[index];

    let equity = balance;

    if (position) {
      const floatingPnl =
        position.side === "buy"
          ? (candle.close - position.entryPrice) * position.positionSize
          : (position.entryPrice - candle.close) * position.positionSize;
      equity = balance + floatingPnl;
    }

    if (equity > peak) {
      peak = equity;
    }

    const drawdown = Math.min(0, equity - peak);
    equityPoints.push({
      timestamp: candle.timestamp,
      equity: round2(equity),
      drawdown: round2(drawdown),
    });

    if (position) {
      let exitPrice: number | null = null;
      let exitReason: "stop_loss" | "take_profit" | "rule_exit" | "end_of_period" | null = null;

      if (position.side === "buy") {
        if (candle.low <= position.stopLoss) {
          exitPrice = position.stopLoss;
          exitReason = "stop_loss";
        } else if (candle.high >= position.takeProfit) {
          exitPrice = position.takeProfit;
          exitReason = "take_profit";
        }
      } else {
        if (candle.high >= position.stopLoss) {
          exitPrice = position.stopLoss;
          exitReason = "stop_loss";
        } else if (candle.low <= position.takeProfit) {
          exitPrice = position.takeProfit;
          exitReason = "take_profit";
        }
      }

      if (!exitPrice && evaluateRuleSet(strategy.exitRules, candle, previous)) {
        exitPrice = candle.close;
        exitReason = "rule_exit";
      }

      if (!exitPrice && index === candles.length - 1) {
        exitPrice = candle.close;
        exitReason = "end_of_period";
      }

      if (exitPrice !== null && exitReason !== null) {
        const grossPnl =
          position.side === "buy"
            ? (exitPrice - position.entryPrice) * position.positionSize
            : (position.entryPrice - exitPrice) * position.positionSize;

        const commission = strategy.commissionPerTrade * 2;
        const spreadCost = strategy.spreadPoints * pointSize * position.positionSize;
        const netPnl = grossPnl - commission - spreadCost;

        balance += netPnl;

        const result: "win" | "loss" | "breakeven" =
          netPnl > 0 ? "win" : netPnl < 0 ? "loss" : "breakeven";

        trades.push({
          strategyId: strategy.id,
          symbol: strategy.symbol,
          timeframe: strategy.timeframe,
          side: position.side,
          openedAt: position.openedAt,
          closedAt: candle.timestamp,
          entryPrice: round2(position.entryPrice),
          exitPrice: round2(exitPrice),
          stopLoss: round2(position.stopLoss),
          takeProfit: round2(position.takeProfit),
          positionSize: round2(position.positionSize),
          grossPnl: round2(grossPnl),
          netPnl: round2(netPnl),
          commission: round2(commission),
          spreadCost: round2(spreadCost),
          result,
          exitReason,
        });

        position = null;
      }
    }

    if (!position) {
      const inSession = isInSession(candle.timestamp, strategy.session);
      const canEnter = inSession && evaluateRuleSet(strategy.entryRules, candle, previous);

      if (canEnter) {
        const side = pickEntrySide(strategy, candle);
        position = buildPosition(strategy, candle, side, balance);
      }
    }
  }

  const metrics = computeBacktestMetrics(
    trades.map((trade) => ({ netPnl: trade.netPnl, result: trade.result })),
    equityPoints,
  );

  const finishedAt = new Date().toISOString();

  return saveBacktestRun({
    run: {
      strategyId: strategy.id,
      strategyName: strategy.name,
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      startedAt,
      finishedAt,
      periodStart: strategy.testPeriodStart,
      periodEnd: strategy.testPeriodEnd,
      initialCapital: strategy.initialCapital,
      finalCapital: round2(strategy.initialCapital + metrics.totalPnl),
      totalTrades: metrics.totalTrades,
      wins: metrics.wins,
      losses: metrics.losses,
      breakevens: metrics.breakevens,
      winRate: metrics.winRate,
      profitFactor: metrics.profitFactor,
      averageWin: metrics.averageWin,
      averageLoss: metrics.averageLoss,
      totalPnl: metrics.totalPnl,
      maxDrawdown: metrics.maxDrawdown,
      commissionTotal: round2(trades.reduce((sum, trade) => sum + trade.commission, 0)),
      spreadTotal: round2(trades.reduce((sum, trade) => sum + trade.spreadCost, 0)),
      maxConsecutiveWins: metrics.maxConsecutiveWins,
      maxConsecutiveLosses: metrics.maxConsecutiveLosses,
      metadataJson: JSON.stringify({
        safety: "simulation_only",
        candles: candles.length,
      }),
    },
    trades,
    equityPoints,
  });
}
