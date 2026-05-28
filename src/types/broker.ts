// ============================================================
// Types — Broker
// ============================================================
// Entite locale de broker multi-plateforme.
// Le stockage reste local SQLite (pas de cloud).
// ============================================================

import type { TradePlatform } from "./trade";

export type BrokerType = "retail" | "prop" | "institutional" | "csv" | "other";

export interface Broker {
  id: number;
  name: string;
  brokerType: BrokerType;
  platformSupported: TradePlatform[];
  website: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BrokerFormData {
  name: string;
  brokerType?: BrokerType;
  platformSupported?: TradePlatform[];
  website?: string | null;
  isActive?: boolean;
}
