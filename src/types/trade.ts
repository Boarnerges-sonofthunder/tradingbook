// ============================================================
// Types — Trade
// ============================================================
// Correspond exactement au schéma SQLite (table `trades`).
// camelCase côté TypeScript ↔ snake_case colonnes SQLite.
// ============================================================

/**
 * Côté du trade tel que stocké en SQLite.
 * Colonne `side` : CHECK(side IN ('buy', 'sell'))
 */
export type TradeSide = "buy" | "sell";

/** Statut du cycle de vie d'un trade. */
export type TradeStatus = "open" | "closed" | "cancelled";

/** Résultat final d'un trade fermé (calculé côté applicatif). */
export type TradeOutcome = "win" | "loss" | "breakeven";

/**
 * Source / plateforme — colonnes `platform` et `source`.
 *
 * Valeurs SQLite autorisées :
 *   migration 002 (actuelle) : 'mt5' | 'csv' | 'manual'
 *   migration 005 (MT4)      : ajoute 'mt4' aux CHECK constraints
 *
 * @see src-tauri/migrations/005_mt4_support.sql
 * @see src/constants/tradingPlatforms.ts
 */
export type TradePlatform = "mt5" | "mt4" | "csv" | "manual";

/**
 * Entité Trade — miroir exact de la table `trades` SQLite.
 * Tous les champs dates sont des chaînes ISO 8601.
 */
export interface Trade {
  id: number;

  // ---- Déduplication import ------------------------------
  externalId: string | null;       // external_id

  // ---- Contexte compte -----------------------------------
  broker: string | null;
  brokerId?: number | null;
  accountId: string | null;        // account_id
  tradingAccountId?: number | null; // trading_account_id
  platform: TradePlatform;
  source: TradePlatform;
  importId: number | null;         // import_id → imports(id)

  // ---- Instrument ----------------------------------------
  symbol: string;
  side: TradeSide;

  // ---- Cycle de vie --------------------------------------
  status: TradeStatus;
  openedAt: string;                // opened_at ISO 8601
  closedAt: string | null;         // closed_at

  // ---- Prix ----------------------------------------------
  entryPrice: number;              // entry_price
  exitPrice: number | null;        // exit_price
  stopLoss: number | null;         // stop_loss
  takeProfit: number | null;       // take_profit

  // ---- Volume --------------------------------------------
  volume: number;                  // en lots

  // ---- Frais ---------------------------------------------
  commission: number;
  swap: number;
  fees: number;

  // ---- P&L -----------------------------------------------
  grossPnl: number | null;         // gross_pnl — avant frais
  netPnl: number | null;           // net_pnl   — après frais
  currency: string;

  // ---- Gestion du risque ---------------------------------
  riskAmount: number | null;       // risk_amount
  rewardAmount: number | null;     // reward_amount
  riskRewardRatio: number | null;  // risk_reward_ratio

  // ---- Stratégie -----------------------------------------
  strategyId: number | null;       // strategy_id → strategies(id)

  // ---- Horodatage SQLite ---------------------------------
  createdAt: string;
  updatedAt: string;
}

/** Données requises pour créer un nouveau trade. */
export interface CreateTradeInput {
  symbol: string;
  side: TradeSide;
  openedAt: string;
  entryPrice: number;
  volume: number;
  // Optionnels
  externalId?: string | null;
  broker?: string | null;
  brokerId?: number | null;
  accountId?: string | null;
  tradingAccountId?: number | null;
  platform?: TradePlatform;
  source?: TradePlatform;
  importId?: number | null;
  closedAt?: string | null;
  exitPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  commission?: number;
  swap?: number;
  fees?: number;
  grossPnl?: number | null;
  netPnl?: number | null;
  currency?: string;
  riskAmount?: number | null;
  rewardAmount?: number | null;
  riskRewardRatio?: number | null;
  strategyId?: number | null;
  status?: TradeStatus;
  outcome?: TradeOutcome | null;
}

/** Données pour mettre à jour un trade (tous champs optionnels). */
export type UpdateTradeInput = Partial<CreateTradeInput>;

/**
 * @deprecated Utiliser CreateTradeInput.
 * Conservé pour compatibilité avec les formulaires Phase 1.
 */
export interface TradeFormData {
  symbol: string;
  side: TradeSide;
  openedAt: string;
  entryPrice: number;
  volume: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  strategyId?: number | null;
}
