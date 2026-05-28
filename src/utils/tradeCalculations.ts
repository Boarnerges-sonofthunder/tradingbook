// ============================================================
// Utils — Calculs liés aux trades (SL, TP, Risk/Reward)
// ============================================================

import type { TradeSide, TradeOutcome } from "../types";

/**
 * Résultat du calcul risque/récompense.
 * riskPips   = distance entry → SL (en points de prix)
 * rewardPips = distance entry → TP (en points de prix)
 * ratio      = rewardPips / riskPips
 */
export interface RiskRewardResult {
  riskPips: number;
  rewardPips: number;
  ratio: number;
}

export function computeRiskDistance(
  entry: number,
  sl: number | null,
  side: TradeSide,
): number | null {
  if (sl === null || entry <= 0) return null;
  const riskPips = side === "buy" ? entry - sl : sl - entry;
  return riskPips > 0 ? riskPips : null;
}

export function computeRewardDistance(
  entry: number,
  tp: number | null,
  side: TradeSide,
): number | null {
  if (tp === null || entry <= 0) return null;
  const rewardPips = side === "buy" ? tp - entry : entry - tp;
  return rewardPips > 0 ? rewardPips : null;
}

/**
 * Calcule le ratio risque/récompense complet.
 * BUY  : riskPips = entry − SL,  rewardPips = TP − entry
 * SELL : riskPips = SL − entry,  rewardPips = entry − TP
 * Retourne null si SL/TP manquant, entry invalide, ou valeurs incohérentes.
 */
export function computeRiskReward(
  entry: number,
  sl: number | null,
  tp: number | null,
  side: TradeSide,
): RiskRewardResult | null {
  const riskPips = computeRiskDistance(entry, sl, side);
  const rewardPips = computeRewardDistance(entry, tp, side);
  if (riskPips === null || rewardPips === null) return null;
  const ratio = Math.round((rewardPips / riskPips) * 100) / 100;
  return { riskPips, rewardPips, ratio };
}

/**
 * Raccourci : retourne uniquement le ratio risque/récompense ou null.
 * Utilisé par TradeForm pour le champ calculé.
 */
export function computeRRR(
  entry: number,
  sl: number | null,
  tp: number | null,
  side: TradeSide,
): number | null {
  return computeRiskReward(entry, sl, tp, side)?.ratio ?? null;
}

/** Détermine le résultat d'un trade à partir du P&L net. */
export function computeOutcome(netPnl: number | null): TradeOutcome | null {
  if (netPnl === null) return null;
  if (netPnl > 0) return "win";
  if (netPnl < 0) return "loss";
  return "breakeven";
}

/**
 * Valide la cohérence directionnelle du Stop Loss.
 * BUY  : SL doit être inférieur au prix d'entrée
 * SELL : SL doit être supérieur au prix d'entrée
 * Retourne un avertissement (non bloquant) ou null si valide/non renseigné.
 */
export function validateStopLoss(
  entry: number,
  sl: number | null,
  side: TradeSide,
): string | null {
  if (sl === null || entry <= 0) return null;
  if (side === "buy" && sl >= entry) {
    return "Pour un achat, le Stop Loss doit être inférieur au prix d'entrée";
  }
  if (side === "sell" && sl <= entry) {
    return "Pour une vente, le Stop Loss doit être supérieur au prix d'entrée";
  }
  return null;
}

/**
 * Valide la cohérence directionnelle du Take Profit.
 * BUY  : TP doit être supérieur au prix d'entrée
 * SELL : TP doit être inférieur au prix d'entrée
 * Retourne un avertissement (non bloquant) ou null si valide/non renseigné.
 */
export function validateTakeProfit(
  entry: number,
  tp: number | null,
  side: TradeSide,
): string | null {
  if (tp === null || entry <= 0) return null;
  if (side === "buy" && tp <= entry) {
    return "Pour un achat, le Take Profit doit être supérieur au prix d'entrée";
  }
  if (side === "sell" && tp >= entry) {
    return "Pour une vente, le Take Profit doit être inférieur au prix d'entrée";
  }
  return null;
}
