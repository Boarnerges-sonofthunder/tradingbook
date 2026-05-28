// ============================================================
// Repository — Backtest Runs + Equity points
// ============================================================

import { getDb, withDatabaseBusyRetry } from "../services/database";
import type { BacktestComparisonItem, BacktestEquityPoint, BacktestRun } from "../types";

interface BacktestRunRow {
  id: number;
  strategy_id: number;
  strategy_name: string;
  symbol: string;
  timeframe: string;
  started_at: string;
  finished_at: string;
  period_start: string;
  period_end: string;
  initial_capital: number;
  final_capital: number;
  total_trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  win_rate: number;
  profit_factor: number;
  average_win: number;
  average_loss: number;
  total_pnl: number;
  max_drawdown: number;
  commission_total: number;
  spread_total: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  metadata_json: string | null;
}

interface BacktestEquityPointRow {
  id: number;
  run_id: number;
  timestamp: string;
  equity: number;
  drawdown: number;
}

export interface InsertBacktestRunInput {
  strategyId: number;
  strategyName: string;
  symbol: string;
  timeframe: string;
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
  metadataJson?: string | null;
}

export interface InsertBacktestEquityPointInput {
  runId: number;
  timestamp: string;
  equity: number;
  drawdown: number;
}

function rowToBacktestRun(row: BacktestRunRow): BacktestRun {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    strategyName: row.strategy_name,
    symbol: row.symbol,
    timeframe: row.timeframe as BacktestRun["timeframe"],
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    initialCapital: row.initial_capital,
    finalCapital: row.final_capital,
    totalTrades: row.total_trades,
    wins: row.wins,
    losses: row.losses,
    breakevens: row.breakevens,
    winRate: row.win_rate,
    profitFactor: row.profit_factor,
    averageWin: row.average_win,
    averageLoss: row.average_loss,
    totalPnl: row.total_pnl,
    maxDrawdown: row.max_drawdown,
    commissionTotal: row.commission_total,
    spreadTotal: row.spread_total,
    maxConsecutiveWins: row.max_consecutive_wins,
    maxConsecutiveLosses: row.max_consecutive_losses,
    metadataJson: row.metadata_json,
  };
}

function rowToEquityPoint(row: BacktestEquityPointRow): BacktestEquityPoint {
  return {
    id: row.id,
    runId: row.run_id,
    timestamp: row.timestamp,
    equity: row.equity,
    drawdown: row.drawdown,
  };
}

export async function insertBacktestRun(
  input: InsertBacktestRunInput,
): Promise<BacktestRun> {
  const db = await getDb();
  const result = await withDatabaseBusyRetry(() =>
    db.execute(
      `INSERT INTO backtest_runs (
        strategy_id, strategy_name, symbol, timeframe,
        started_at, finished_at, period_start, period_end,
        initial_capital, final_capital,
        total_trades, wins, losses, breakevens,
        win_rate, profit_factor, average_win, average_loss,
        total_pnl, max_drawdown, commission_total, spread_total,
        max_consecutive_wins, max_consecutive_losses, metadata_json
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25
      )`,
      [
        input.strategyId,
        input.strategyName,
        input.symbol,
        input.timeframe,
        input.startedAt,
        input.finishedAt,
        input.periodStart,
        input.periodEnd,
        input.initialCapital,
        input.finalCapital,
        input.totalTrades,
        input.wins,
        input.losses,
        input.breakevens,
        input.winRate,
        input.profitFactor,
        input.averageWin,
        input.averageLoss,
        input.totalPnl,
        input.maxDrawdown,
        input.commissionTotal,
        input.spreadTotal,
        input.maxConsecutiveWins,
        input.maxConsecutiveLosses,
        input.metadataJson ?? null,
      ],
    ),
  );

  const created = await findBacktestRunById(result.lastInsertId ?? 0);
  if (!created) {
    throw new Error("Backtest run introuvable apres insertion");
  }

  return created;
}

export async function insertBacktestEquityPoints(
  points: InsertBacktestEquityPointInput[],
): Promise<number> {
  if (points.length === 0) {
    return 0;
  }

  const db = await getDb();
  let inserted = 0;

  for (const point of points) {
    const result = await withDatabaseBusyRetry(() =>
      db.execute(
        `INSERT INTO backtest_equity_points (run_id, timestamp, equity, drawdown)
         VALUES ($1, $2, $3, $4)`,
        [point.runId, point.timestamp, point.equity, point.drawdown],
      ),
    );
    inserted += result.rowsAffected;
  }

  return inserted;
}

export async function findBacktestRuns(limit = 50): Promise<BacktestRun[]> {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(500, limit));
  const rows = await withDatabaseBusyRetry(() =>
    db.select<BacktestRunRow[]>(
      `SELECT *
       FROM backtest_runs
       ORDER BY started_at DESC, id DESC
       LIMIT $1`,
      [safeLimit],
    ),
  );
  return rows.map(rowToBacktestRun);
}

export async function findBacktestRunById(id: number): Promise<BacktestRun | null> {
  const db = await getDb();
  const rows = await withDatabaseBusyRetry(() =>
    db.select<BacktestRunRow[]>(
      `SELECT * FROM backtest_runs WHERE id = $1 LIMIT 1`,
      [id],
    ),
  );
  return rows[0] ? rowToBacktestRun(rows[0]) : null;
}

export async function findBacktestEquityPointsByRunId(
  runId: number,
): Promise<BacktestEquityPoint[]> {
  const db = await getDb();
  const rows = await withDatabaseBusyRetry(() =>
    db.select<BacktestEquityPointRow[]>(
      `SELECT *
       FROM backtest_equity_points
       WHERE run_id = $1
       ORDER BY timestamp ASC, id ASC`,
      [runId],
    ),
  );
  return rows.map(rowToEquityPoint);
}

export async function compareBacktestRuns(
  runIds: number[],
): Promise<BacktestComparisonItem[]> {
  if (runIds.length === 0) {
    return [];
  }

  const db = await getDb();
  const placeholders = runIds.map((_id, index) => `$${index + 1}`).join(", ");
  const rows = await withDatabaseBusyRetry(() =>
    db.select<BacktestRunRow[]>(
      `SELECT *
       FROM backtest_runs
       WHERE id IN (${placeholders})
       ORDER BY started_at DESC`,
      runIds,
    ),
  );

  return rows.map((row) => ({
    runId: row.id,
    strategyName: row.strategy_name,
    period: `${row.period_start} -> ${row.period_end}`,
    finalCapital: row.final_capital,
    totalPnl: row.total_pnl,
    winRate: row.win_rate,
    profitFactor: row.profit_factor,
    maxDrawdown: row.max_drawdown,
  }));
}
