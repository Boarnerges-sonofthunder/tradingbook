// ============================================================
// Repository — Backtest Strategies (CRUD)
// ============================================================

import { getDb, withDatabaseBusyRetry } from "../services/database";
import type { BacktestRuleSet, BacktestStrategy, BacktestStrategyInput } from "../types";

interface BacktestStrategyRow {
  id: number;
  name: string;
  symbol: string;
  timeframe: string;
  entry_rules_json: string;
  exit_rules_json: string;
  stop_loss_percent: number;
  take_profit_percent: number;
  risk_reward_ratio: number;
  session: string;
  test_period_start: string;
  test_period_end: string;
  initial_capital: number;
  risk_per_trade_percent: number;
  commission_per_trade: number;
  spread_points: number;
  direction: "long" | "short" | "both";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function parseRuleSet(raw: string): BacktestRuleSet {
  try {
    return JSON.parse(raw) as BacktestRuleSet;
  } catch {
    return { operator: "all", conditions: [] };
  }
}

function rowToEntity(row: BacktestStrategyRow): BacktestStrategy {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    timeframe: row.timeframe as BacktestStrategy["timeframe"],
    entryRules: parseRuleSet(row.entry_rules_json),
    exitRules: parseRuleSet(row.exit_rules_json),
    stopLossPercent: row.stop_loss_percent,
    takeProfitPercent: row.take_profit_percent,
    riskRewardRatio: row.risk_reward_ratio,
    session: row.session,
    testPeriodStart: row.test_period_start,
    testPeriodEnd: row.test_period_end,
    initialCapital: row.initial_capital,
    riskPerTradePercent: row.risk_per_trade_percent,
    commissionPerTrade: row.commission_per_trade,
    spreadPoints: row.spread_points,
    direction: row.direction,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertBacktestStrategy(
  input: BacktestStrategyInput,
): Promise<BacktestStrategy> {
  const db = await getDb();
  const result = await withDatabaseBusyRetry(() =>
    db.execute(
      `INSERT INTO backtest_strategies (
        name, symbol, timeframe, entry_rules_json, exit_rules_json,
        stop_loss_percent, take_profit_percent, risk_reward_ratio,
        session, test_period_start, test_period_end,
        initial_capital, risk_per_trade_percent,
        commission_per_trade, spread_points, direction, notes
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13,
        $14, $15, $16, $17
      )`,
      [
        input.name,
        input.symbol,
        input.timeframe,
        JSON.stringify(input.entryRules),
        JSON.stringify(input.exitRules),
        input.stopLossPercent,
        input.takeProfitPercent ?? 0,
        input.riskRewardRatio ?? 2,
        input.session ?? "all",
        input.testPeriodStart,
        input.testPeriodEnd,
        input.initialCapital,
        input.riskPerTradePercent,
        input.commissionPerTrade ?? 0,
        input.spreadPoints ?? 0,
        input.direction ?? "both",
        input.notes ?? null,
      ],
    ),
  );

  const created = await findBacktestStrategyById(result.lastInsertId ?? 0);
  if (!created) {
    throw new Error("Strategie backtest introuvable apres creation");
  }

  return created;
}

export async function findBacktestStrategies(): Promise<BacktestStrategy[]> {
  const db = await getDb();
  const rows = await withDatabaseBusyRetry(() =>
    db.select<BacktestStrategyRow[]>(
      `SELECT * FROM backtest_strategies ORDER BY updated_at DESC, id DESC`,
    ),
  );
  return rows.map(rowToEntity);
}

export async function findBacktestStrategyById(
  id: number,
): Promise<BacktestStrategy | null> {
  const db = await getDb();
  const rows = await withDatabaseBusyRetry(() =>
    db.select<BacktestStrategyRow[]>(
      `SELECT * FROM backtest_strategies WHERE id = $1 LIMIT 1`,
      [id],
    ),
  );

  return rows[0] ? rowToEntity(rows[0]) : null;
}

export async function updateBacktestStrategyById(
  id: number,
  input: Partial<BacktestStrategyInput>,
): Promise<BacktestStrategy | null> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(input.name);
  }
  if (input.symbol !== undefined) {
    fields.push(`symbol = $${idx++}`);
    values.push(input.symbol);
  }
  if (input.timeframe !== undefined) {
    fields.push(`timeframe = $${idx++}`);
    values.push(input.timeframe);
  }
  if (input.entryRules !== undefined) {
    fields.push(`entry_rules_json = $${idx++}`);
    values.push(JSON.stringify(input.entryRules));
  }
  if (input.exitRules !== undefined) {
    fields.push(`exit_rules_json = $${idx++}`);
    values.push(JSON.stringify(input.exitRules));
  }
  if (input.stopLossPercent !== undefined) {
    fields.push(`stop_loss_percent = $${idx++}`);
    values.push(input.stopLossPercent);
  }
  if (input.takeProfitPercent !== undefined) {
    fields.push(`take_profit_percent = $${idx++}`);
    values.push(input.takeProfitPercent);
  }
  if (input.riskRewardRatio !== undefined) {
    fields.push(`risk_reward_ratio = $${idx++}`);
    values.push(input.riskRewardRatio);
  }
  if (input.session !== undefined) {
    fields.push(`session = $${idx++}`);
    values.push(input.session);
  }
  if (input.testPeriodStart !== undefined) {
    fields.push(`test_period_start = $${idx++}`);
    values.push(input.testPeriodStart);
  }
  if (input.testPeriodEnd !== undefined) {
    fields.push(`test_period_end = $${idx++}`);
    values.push(input.testPeriodEnd);
  }
  if (input.initialCapital !== undefined) {
    fields.push(`initial_capital = $${idx++}`);
    values.push(input.initialCapital);
  }
  if (input.riskPerTradePercent !== undefined) {
    fields.push(`risk_per_trade_percent = $${idx++}`);
    values.push(input.riskPerTradePercent);
  }
  if (input.commissionPerTrade !== undefined) {
    fields.push(`commission_per_trade = $${idx++}`);
    values.push(input.commissionPerTrade);
  }
  if (input.spreadPoints !== undefined) {
    fields.push(`spread_points = $${idx++}`);
    values.push(input.spreadPoints);
  }
  if (input.direction !== undefined) {
    fields.push(`direction = $${idx++}`);
    values.push(input.direction);
  }
  if (input.notes !== undefined) {
    fields.push(`notes = $${idx++}`);
    values.push(input.notes ?? null);
  }

  if (fields.length === 0) {
    return findBacktestStrategyById(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await withDatabaseBusyRetry(() =>
    db.execute(
      `UPDATE backtest_strategies
       SET ${fields.join(", ")}
       WHERE id = $${idx}`,
      values,
    ),
  );

  return findBacktestStrategyById(id);
}

export async function deleteBacktestStrategyById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await withDatabaseBusyRetry(() =>
    db.execute(`DELETE FROM backtest_strategies WHERE id = $1`, [id]),
  );
  return result.rowsAffected > 0;
}
