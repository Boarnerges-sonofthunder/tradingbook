// ============================================================
// Validation — Trade
// ============================================================
// Correspond à CreateTradeInput / UpdateTradeInput dans types/trade.ts
// ============================================================

import { z } from "zod";
import { isoDateString } from "./common";

// ------------------------------------------------------------
// Énumérations
// ------------------------------------------------------------

/** Côté du trade (CHECK côté SQLite). */
export const TradeSideSchema = z.enum(["buy", "sell"], {
  error: "Le côté doit être 'buy' ou 'sell'",
});

/** Statut du cycle de vie du trade. */
export const TradeStatusSchema = z.enum(["open", "closed", "cancelled"], {
  error: "Le statut doit être 'open', 'closed' ou 'cancelled'",
});

/** Résultat final du trade (calculé). */
export const TradeOutcomeSchema = z.enum(["win", "loss", "breakeven"], {
  error: "L'issue doit être 'win', 'loss' ou 'breakeven'",
});

/** Plateforme source du trade. */
export const TradePlatformSchema = z.enum(["mt5", "csv", "manual"], {
  error: "La plateforme doit être 'mt5', 'csv' ou 'manual'",
});

// ------------------------------------------------------------
// Schéma principal — CreateTradeInput
// ------------------------------------------------------------

export const CreateTradeInputSchema = z.object({
  // Champs obligatoires
  symbol: z.string().min(1, "Le symbole est requis").max(20, "Symbole trop long (max 20 car.)"),
  side: TradeSideSchema,
  openedAt: isoDateString,
  entryPrice: z.number().positive("Le prix d'entrée doit être positif"),
  volume: z.number().positive("Le volume doit être positif"),

  // Déduplication / contexte
  externalId: z.string().max(100).nullable().optional(),
  broker: z.string().max(100).nullable().optional(),
  brokerId: z.number().int().positive().nullable().optional(),
  accountId: z.string().max(100).nullable().optional(),
  tradingAccountId: z.number().int().positive().nullable().optional(),
  platform: TradePlatformSchema.optional(),
  source: TradePlatformSchema.optional(),
  importId: z.number().int().positive().nullable().optional(),

  // Fermeture
  closedAt: isoDateString.nullable().optional(),
  exitPrice: z.number().positive("Le prix de sortie doit être positif").nullable().optional(),

  // Gestion du risque
  stopLoss: z.number().positive("Le stop-loss doit être positif").nullable().optional(),
  takeProfit: z.number().positive("Le take-profit doit être positif").nullable().optional(),

  // Frais
  commission: z.number().optional(),
  swap: z.number().optional(),
  fees: z.number().min(0, "Les frais ne peuvent pas être négatifs").optional(),

  // P&L
  grossPnl: z.number().nullable().optional(),
  netPnl: z.number().nullable().optional(),
  currency: z.string().min(1).max(10, "Code devise trop long (max 10 car.)").optional(),

  // Risque/récompense
  riskAmount: z.number().min(0).nullable().optional(),
  rewardAmount: z.number().min(0).nullable().optional(),
  riskRewardRatio: z.number().min(0).nullable().optional(),

  // Références
  strategyId: z.number().int().positive().nullable().optional(),
  status: TradeStatusSchema.optional(),
  outcome: TradeOutcomeSchema.nullable().optional(),
}).refine(
  // Si fermé, closedAt et exitPrice doivent être renseignés
  (data) => {
    if (data.status === "closed") {
      return data.closedAt != null && data.exitPrice != null;
    }
    return true;
  },
  { message: "Un trade fermé doit avoir une date de clôture et un prix de sortie" }
);

/**
 * Schéma de mise à jour — tous les champs deviennent optionnels.
 * La refinement de cohérence est omise ici car une mise à jour partielle
 * peut ne concerner qu'un seul champ à la fois.
 */
export const UpdateTradeInputSchema = z.object({
  symbol: z.string().min(1).max(20).optional(),
  side: TradeSideSchema.optional(),
  openedAt: isoDateString.optional(),
  entryPrice: z.number().positive().optional(),
  volume: z.number().positive().optional(),
  externalId: z.string().max(100).nullable().optional(),
  broker: z.string().max(100).nullable().optional(),
  brokerId: z.number().int().positive().nullable().optional(),
  accountId: z.string().max(100).nullable().optional(),
  tradingAccountId: z.number().int().positive().nullable().optional(),
  platform: TradePlatformSchema.optional(),
  source: TradePlatformSchema.optional(),
  importId: z.number().int().positive().nullable().optional(),
  closedAt: isoDateString.nullable().optional(),
  exitPrice: z.number().positive().nullable().optional(),
  stopLoss: z.number().positive().nullable().optional(),
  takeProfit: z.number().positive().nullable().optional(),
  commission: z.number().optional(),
  swap: z.number().optional(),
  fees: z.number().min(0).optional(),
  grossPnl: z.number().nullable().optional(),
  netPnl: z.number().nullable().optional(),
  currency: z.string().min(1).max(10).optional(),
  riskAmount: z.number().min(0).nullable().optional(),
  rewardAmount: z.number().min(0).nullable().optional(),
  riskRewardRatio: z.number().min(0).nullable().optional(),
  strategyId: z.number().int().positive().nullable().optional(),
  status: TradeStatusSchema.optional(),
  outcome: TradeOutcomeSchema.nullable().optional(),
});
