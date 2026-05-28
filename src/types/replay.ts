// ============================================================
// Types — Replay de trades (analyse historique locale)
// ============================================================
// Ce modèle sert uniquement à rejouer des trades passés.
// Aucune donnée temps réel ni action d'exécution d'ordres.
// ============================================================

import type { TradeSide, TradeStatus, TradePlatform } from "./trade";

/** Métadonnées screenshot affichables pendant le replay. */
export interface ReplayScreenshotItem {
  id: number;
  filename: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  label: string | null;
  timeframe: string | null;
  createdAt: string;
}

/**
 * Une frame replay représente un trade terminé et ses éléments d'analyse.
 * Le champ chartDataSource prépare intégration future de données historiques.
 */
export interface TradeReplayFrame {
  tradeId: number;
  symbol: string;
  side: TradeSide;
  status: TradeStatus;
  platform: TradePlatform;
  broker: string | null;
  accountId: string | null;
  openedAt: string;
  closedAt: string | null;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  volume: number;
  grossPnl: number | null;
  netPnl: number | null;
  currency: string;
  screenshots: ReplayScreenshotItem[];
  hasHistoricalChartData: boolean;
  chartDataSource: "pending_historical_provider" | "none";
}

/** Jeu de données replay chargé par page Replay. */
export interface TradeReplayDataset {
  generatedAt: string;
  totalTrades: number;
  frames: TradeReplayFrame[];
}

/** Options de chargement replay. */
export interface GetTradeReplayDatasetOptions {
  includeOpenTrades?: boolean;
  maxTrades?: number;
}
