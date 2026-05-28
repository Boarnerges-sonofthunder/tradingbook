// ============================================================
// Service — MT4 (point d'entrée)
// ============================================================
// Phase 6 Étape 2.1 — Architecture préparée (NON IMPLÉMENTÉ)
//
// Tous les services MT4 sont des stubs architecturaux.
// Aucune synchronisation MT4 n'est active à cette étape.
//
// PRÉREQUIS avant implémentation :
//   1. Créer le MQL4 EA "TradingBookExport.mq4"
//   2. Appliquer la migration SQLite 005_mt4_support.sql
//   3. Implémenter les fonctions (retirer les throws)
// ============================================================

export {
  detectMT4ExportFile,
  readMT4ExportFile,
  loadMT4Export,
} from "./mt4BridgeService";

export {
  mapMT4Orders,
  calculateMT4NetPnl,
  normalizeMT4Price,
} from "./mt4MappingService";

export {
  importFromMT4File,
  importFromMT4FilePath,
} from "./mt4ImportService";

export type { MT4ImportProgressCallback } from "./mt4ImportService";

export {
  deduplicateMT4Trades,
  buildMT4ExternalId,
} from "./mt4DeduplicationService";

export type { MT4DeduplicationResult } from "./mt4DeduplicationService";
