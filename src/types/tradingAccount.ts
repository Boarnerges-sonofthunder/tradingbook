// ============================================================
// Types — Trading Account
// ============================================================
// Entite locale de compte de trading multi-broker/multi-plateforme.
// ============================================================

import type { TradePlatform } from "./trade";

export type TradingAccountType = "live" | "demo" | "prop" | "other";

export interface TradingAccount {
  id: number;
  name: string;
  broker: string;
  brokerId?: number | null;
  platform: TradePlatform;
  accountNumber: string;
  accountType: TradingAccountType;
  currency: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TradingAccountFormData {
  name: string;
  broker: string;
  brokerId?: number | null;
  platform: TradePlatform;
  accountNumber: string;
  accountType?: TradingAccountType;
  currency?: string | null;
  isActive?: boolean;
}

export interface ResolveTradingAccountInput {
  broker: string;
  brokerId?: number | null;
  platform: TradePlatform;
  accountNumber: string;
  nameHint?: string | null;
  accountType?: TradingAccountType;
  currency?: string | null;
}
