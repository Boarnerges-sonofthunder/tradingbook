// ============================================================
// Repositories — Point d'entrée centralisé
// ============================================================
// Importer depuis ce module pour accéder à n'importe quel repository.
//
// Usage :
//   import { insertTrade, findTradeById } from "../repositories";
//   import type { TradeFilters } from "../repositories";
// ============================================================

export * from "./tradesRepository";
export * from "./tradesFilterRepository";
export * from "./strategiesRepository";
export * from "./tradingAccountsRepository";
export * from "./brokersRepository";
export * from "./tagsRepository";
export * from "./notesRepository";
export * from "./screenshotsRepository";
export * from "./mistakesRepository";
export * from "./emotionsRepository";
export * from "./importsRepository";
export * from "./globalSearchRepository";
export * from "./backupsRepository";
export * from "./settingsRepository";
export * from "./activityRepository";
export * from "./mt5SyncLogsRepository";
export * from "./marketDataRepository";
export * from "./backtestStrategiesRepository";
export * from "./backtestRunsRepository";
export * from "./backtestTradesRepository";
