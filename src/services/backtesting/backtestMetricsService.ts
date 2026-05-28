// ============================================================
// Service — Backtest Metrics
// ============================================================
// Calcul metriques a partir des trades simules et equity points.
// ============================================================

import type { BacktestEquityPoint } from "../../types";

export interface SimulatedTradeMetricsInput {
  netPnl: number;
  result: "win" | "loss" | "breakeven";
}

export interface BacktestComputedMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  totalPnl: number;
  maxDrawdown: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Calcule metriques standards de backtesting a partir des trades executes.
 */
export function computeBacktestMetrics(
  trades: SimulatedTradeMetricsInput[],
  equityPoints: Array<Pick<BacktestEquityPoint, "drawdown">>,
): BacktestComputedMetrics {
  const totalTrades = trades.length;
  const wins = trades.filter((trade) => trade.result === "win").length;
  const losses = trades.filter((trade) => trade.result === "loss").length;
  const breakevens = totalTrades - wins - losses;

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  let grossWin = 0;
  let grossLoss = 0;
  let averageWin = 0;
  let averageLoss = 0;
  let totalPnl = 0;

  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;

  for (const trade of trades) {
    totalPnl += trade.netPnl;

    if (trade.netPnl > 0) {
      grossWin += trade.netPnl;
      currentWinStreak += 1;
      currentLossStreak = 0;
      if (currentWinStreak > maxConsecutiveWins) {
        maxConsecutiveWins = currentWinStreak;
      }
    } else if (trade.netPnl < 0) {
      grossLoss += Math.abs(trade.netPnl);
      currentLossStreak += 1;
      currentWinStreak = 0;
      if (currentLossStreak > maxConsecutiveLosses) {
        maxConsecutiveLosses = currentLossStreak;
      }
    } else {
      currentWinStreak = 0;
      currentLossStreak = 0;
    }
  }

  if (wins > 0) {
    averageWin = grossWin / wins;
  }
  if (losses > 0) {
    averageLoss = grossLoss / losses;
  }

  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;

  const maxDrawdown = equityPoints.reduce((worst, point) => {
    const absolute = Math.abs(point.drawdown);
    return absolute > worst ? absolute : worst;
  }, 0);

  return {
    totalTrades,
    wins,
    losses,
    breakevens,
    winRate: round2(winRate),
    profitFactor: round2(profitFactor),
    averageWin: round2(averageWin),
    averageLoss: round2(averageLoss),
    totalPnl: round2(totalPnl),
    maxDrawdown: round2(maxDrawdown),
    maxConsecutiveWins,
    maxConsecutiveLosses,
  };
}
