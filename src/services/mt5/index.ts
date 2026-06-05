// ============================================================
// Service — MT5 (point d'entrée)
// ============================================================
// Phase 6 Étapes 2, 3, 4 & 5 — Bridge connexion + Historique + Positions + Sync.
//
// Utiliser createLogger("mt5") pour les logs.
// ============================================================

export { checkMT5Connection, getMT5InstallationSteps } from "./mt5BridgeService";
export {
  buildMT5ResultError,
  buildMT5UserFacingError,
  getMT5ErrorResolutionSteps,
  normalizeMT5ErrorCode,
} from "./mt5ErrorService";
export { fetchMT5History } from "./mt5HistoryService";
export { fetchMT5Candles } from "./mt5CandlesService";
export { fetchMT5Positions } from "./mt5OpenPositionsService";
export {
  startMT5PositionsTickStream,
  type MT5PositionsTickEvent,
  type MT5PositionsTickStreamController,
} from "./mt5PositionsTickService";
export { detectMT5Trades } from "./mt5TradeDetectionService";
export {
  getLastMT5SyncLog,
  getMT5SyncHistory,
  startMT5SyncLog,
  finishMT5SyncLog,
} from "./mt5SyncLogService";
export { runMT5Sync } from "./mt5SyncService";
export type { MT5SyncOptions } from "./mt5SyncService";
export {
  detectMT5Terminals,
  type MT5TerminalInfo,
  type MT5DetectTerminalsResult,
} from "./mt5TerminalDetectionService";
export {
  startAutoRefresh,
  stopAutoRefresh,
  isAutoRefreshActive,
  isSyncInProgress,
  runSyncWithLock,
} from "./mt5AutoRefreshService";
