// ============================================================
// Types — Backtesting
// ============================================================
// Mode simulation historique locale. Strictement hors execution live.
// ============================================================

import type { ChartTimeframe } from "./chart";

export type BacktestConditionType =
  | "close_above_open"
  | "close_below_open"
  | "close_above_prev_high"
  | "close_below_prev_low"
  | "body_percent_above"
  | "body_percent_below";

export interface BacktestRuleCondition {
  type: BacktestConditionType;
  value?: number;
}

export interface BacktestRuleSet {
  operator: "all" | "any";
  conditions: BacktestRuleCondition[];
}

export type BacktestDirection = "long" | "short" | "both";

export interface BacktestStrategy {
  id: number;
  name: string;
  symbol: string;
  timeframe: ChartTimeframe;
  entryRules: BacktestRuleSet;
  exitRules: BacktestRuleSet;
  stopLossPercent: number;
  takeProfitPercent: number;
  riskRewardRatio: number;
  session: string;
  testPeriodStart: string;
  testPeriodEnd: string;
  initialCapital: number;
  riskPerTradePercent: number;
  commissionPerTrade: number;
  spreadPoints: number;
  direction: BacktestDirection;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BacktestStrategyInput {
  name: string;
  symbol: string;
  timeframe: ChartTimeframe;
  entryRules: BacktestRuleSet;
  exitRules: BacktestRuleSet;
  stopLossPercent: number;
  takeProfitPercent?: number;
  riskRewardRatio?: number;
  session?: string;
  testPeriodStart: string;
  testPeriodEnd: string;
  initialCapital: number;
  riskPerTradePercent: number;
  commissionPerTrade?: number;
  spreadPoints?: number;
  direction?: BacktestDirection;
  notes?: string | null;
}

export interface BacktestRun {
  id: number;
  strategyId: number;
  strategyName: string;
  symbol: string;
  timeframe: ChartTimeframe;
  startedAt: string;
  finishedAt: string;
  periodStart: string;
  periodEnd: string;
  initialCapital: number;
  finalCapital: number;
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
  commissionTotal: number;
  spreadTotal: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  metadataJson: string | null;
}

export interface BacktestTrade {
  id: number;
  runId: number;
  strategyId: number;
  symbol: string;
  timeframe: ChartTimeframe;
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
}

export interface BacktestEquityPoint {
  id: number;
  runId: number;
  timestamp: string;
  equity: number;
  drawdown: number;
}

export interface BacktestComparisonItem {
  runId: number;
  strategyName: string;
  period: string;
  finalCapital: number;
  totalPnl: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
}

export interface BacktestRunDetails {
  run: BacktestRun;
  trades: BacktestTrade[];
  equityPoints: BacktestEquityPoint[];
}
