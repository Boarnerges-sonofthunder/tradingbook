// ============================================================
// Services — Backtesting (point d'entree)
// ============================================================

export {
  createBacktestStrategy,
  getBacktestStrategies,
  getBacktestStrategyById,
  updateBacktestStrategy,
  deleteBacktestStrategy,
} from "./backtestStrategyService";

export {
  getBacktestRuns,
  getBacktestRunDetails,
  getBacktestComparison,
  getBacktestRunEquityPoints,
  saveBacktestRun,
} from "./backtestResultsService";

export { runBacktest } from "./backtestEngineService";
export {
  importHistoricalMarketDataCsv,
  getHistoricalMarketSymbols,
  getHistoricalCandlesForReplay,
} from "./marketDataImportService";
