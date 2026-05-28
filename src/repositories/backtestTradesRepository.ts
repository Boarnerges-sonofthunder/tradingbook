// ============================================================
// Repository — Backtest trades
// ============================================================

import { getDb, withDatabaseBusyRetry } from "../services/database";
import type { BacktestTrade } from "../types";

interface BacktestTradeRow {
  id: number;
  run_id: number;
  strategy_id: number;
  symbol: string;
  timeframe: string;
  side: "buy" | "sell";
  opened_at: string;
  closed_at: string;
  entry_price: number;
  exit_price: number;
  stop_loss: number;
  take_profit: number;
  position_size: number;
  gross_pnl: number;
  net_pnl: number;
  commission: number;
  spread_cost: number;
  result: "win" | "loss" | "breakeven";
  exit_reason: "stop_loss" | "take_profit" | "rule_exit" | "end_of_period";
}

export interface InsertBacktestTradeInput {
  runId: number;
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
}

function rowToTrade(row: BacktestTradeRow): BacktestTrade {
  return {
    id: row.id,
    runId: row.run_id,
    strategyId: row.strategy_id,
    symbol: row.symbol,
    timeframe: row.timeframe as BacktestTrade["timeframe"],
    side: row.side,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    positionSize: row.position_size,
    grossPnl: row.gross_pnl,
    netPnl: row.net_pnl,
    commission: row.commission,
    spreadCost: row.spread_cost,
    result: row.result,
    exitReason: row.exit_reason,
  };
}

export async function insertBacktestTrades(
  trades: InsertBacktestTradeInput[],
): Promise<number> {
  if (trades.length === 0) {
    return 0;
  }

  const db = await getDb();
  let inserted = 0;

  for (const trade of trades) {
    const result = await withDatabaseBusyRetry(() =>
      db.execute(
        `INSERT INTO backtest_trades (
          run_id, strategy_id, symbol, timeframe, side,
          opened_at, closed_at, entry_price, exit_price,
          stop_loss, take_profit, position_size,
          gross_pnl, net_pnl, commission, spread_cost,
          result, exit_reason
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18
        )`,
        [
          trade.runId,
          trade.strategyId,
          trade.symbol,
          trade.timeframe,
          trade.side,
          trade.openedAt,
          trade.closedAt,
          trade.entryPrice,
          trade.exitPrice,
          trade.stopLoss,
          trade.takeProfit,
          trade.positionSize,
          trade.grossPnl,
          trade.netPnl,
          trade.commission,
          trade.spreadCost,
          trade.result,
          trade.exitReason,
        ],
      ),
    );

    inserted += result.rowsAffected;
  }

  return inserted;
}

export async function findBacktestTradesByRunId(
  runId: number,
): Promise<BacktestTrade[]> {
  const db = await getDb();
  const rows = await withDatabaseBusyRetry(() =>
    db.select<BacktestTradeRow[]>(
      `SELECT *
       FROM backtest_trades
       WHERE run_id = $1
       ORDER BY opened_at ASC, id ASC`,
      [runId],
    ),
  );
  return rows.map(rowToTrade);
}
