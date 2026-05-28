// ============================================================
// Validation — Backtesting
// ============================================================

import { z } from "zod";

const RuleConditionSchema = z.object({
  type: z.enum([
    "close_above_open",
    "close_below_open",
    "close_above_prev_high",
    "close_below_prev_low",
    "body_percent_above",
    "body_percent_below",
  ]),
  value: z.number().finite().optional(),
});

const RuleSetSchema = z.object({
  operator: z.enum(["all", "any"]),
  conditions: z.array(RuleConditionSchema).min(1, "Au moins une condition est requise"),
});

const BacktestStrategyInputBaseSchema = z.object({
    name: z.string().min(1, "Nom requis").max(120, "Nom trop long"),
    symbol: z.string().min(1, "Symbole requis").max(30, "Symbole trop long"),
    timeframe: z.enum(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]),
    entryRules: RuleSetSchema,
    exitRules: RuleSetSchema,
    stopLossPercent: z.number().positive("SL doit etre > 0").max(100, "SL trop grand"),
    takeProfitPercent: z.number().nonnegative().max(300).optional(),
    riskRewardRatio: z.number().positive().max(20).optional(),
    session: z.string().max(32).optional(),
    testPeriodStart: z.string().min(1, "Date debut requise"),
    testPeriodEnd: z.string().min(1, "Date fin requise"),
    initialCapital: z.number().positive("Capital initial doit etre > 0"),
    riskPerTradePercent: z.number().positive().max(20),
    commissionPerTrade: z.number().nonnegative().max(10000).optional(),
    spreadPoints: z.number().nonnegative().max(10000).optional(),
    direction: z.enum(["long", "short", "both"]).optional(),
    notes: z.string().max(2000).nullable().optional(),
  });

export const BacktestStrategyInputSchema = BacktestStrategyInputBaseSchema
  .refine((value) => new Date(value.testPeriodStart) <= new Date(value.testPeriodEnd), {
    message: "Periode invalide: date de debut > date de fin",
    path: ["testPeriodEnd"],
  });

export const UpdateBacktestStrategyInputSchema = BacktestStrategyInputBaseSchema.partial();
