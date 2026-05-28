// ============================================================
// Types — Point d'entrée
// ============================================================
// Tous les types partagés de TradingBook sont exportés ici.
//
// Utilisation :
//   import type { Trade, TradeSide } from "../types";
//   import type { Strategy, Tag, Emotion, Mistake } from "../types";
// ============================================================

export type {
  Trade,
  TradeSide,
  TradeStatus,
  TradeOutcome,
  TradePlatform,
  CreateTradeInput,
  UpdateTradeInput,
  TradeFormData,
} from "./trade";

export type { Strategy, StrategyFormData } from "./strategy";

export type { Broker, BrokerType, BrokerFormData } from "./broker";

export type {
  TradingAccount,
  TradingAccountType,
  TradingAccountFormData,
  ResolveTradingAccountInput,
} from "./tradingAccount";

export type {
  Emotion,
  EmotionPhase,
  TradeEmotion,
  Mistake,
  TradeMistake,
  Tag,
  TradeTag,
  CreateEmotionInput,
  CreateMistakeInput,
  CreateTagInput,
  AddEmotionToTradeInput,
  AddMistakeToTradeInput,
} from "./journal";

export type {
  ImportSource,
  ImportStatus,
  ImportRowStatus,
  ImportSession,
  ImportRow,
  ImportResult,
  CreateImportInput,
} from "./import";

export type {
  BackupTrigger,
  Backup,
  CreateBackupInput,
} from "./backup";

export type {
  DisplayCurrencyCode,
  DateTimeFormatPreference,
  LanguageCode,
  StartupPagePreference,
  ThemePreference,
  UserSettings,
  SettingKey,
} from "./settings";
export { DEFAULT_SETTINGS, SUPPORTED_DISPLAY_CURRENCIES } from "./settings";

export type { NotificationType, Notification } from "./notification";

export type {
  ShortcutGroup,
  ShortcutAction,
  ShortcutKey,
  ShortcutDefinition,
  ShortcutHandler,
  ShortcutHandlerMap,
} from "./shortcut";

export type { TradeActivityAction, TradeActivityLog, LogActivityInput } from "./activity";

export type {
  GlobalSearchCategory,
  GlobalSearchResult,
  GlobalSearchGroup,
  GlobalSearchResponse,
} from "./search";

export type {
  TradeDateFilterField,
  TradeResultFilter,
  TradeSourceFilter,
  StrategyFilterValue,
  TradesMultiFilters,
  TradesFilterOption,
  TradesFilterEntityOption,
  TradesFilterOptions,
  TradesFilterResult,
} from "./filters";

export type {
  SortDirection,
  TradeSortField,
  TradesSort,
  TradeSortOption,
} from "./sorting";

export type {
  PageSize,
  PaginationState,
  PaginationMeta,
} from "./pagination";

export type { DashboardStats, DashboardStatsResult, PnLStats, PnLPeriodEntry, PnLBreakdown, PnLResult, PerformanceChartPeriod, PerformanceChartPoint, PerformanceChartBreakdown, PerformanceChartStats, PerformanceChartResult, ProfitLossDistributionBucketKind, ProfitLossDistributionBucket, ProfitLossDistributionStats, ProfitLossDistributionResult, WinRateStats, WinRateBySymbol, WinRateByStrategy, WinRatePeriodEntry, WinRateResult, RiskRewardStats, RiskRewardBySymbol, RiskRewardByStrategy, RiskRewardResult, DrawdownPoint, DrawdownStats, DrawdownResult, EquityCurvePoint, EquityDatePoint, EquityCurveStats, EquityCurveResult, ProfitFactorStats, ProfitFactorBySymbol, ProfitFactorByStrategy, ProfitFactorByMonth, ProfitFactorResult, AvgWinLossStats, AvgWinLossBySymbol, AvgWinLossByStrategy, AvgWinLossResult, SymbolSortKey, SymbolStats, SymbolOverviewStats, SymbolResult, BrokerStats, BrokerOverviewStats, BrokerResult, StrategySortKey, StrategyStats, StrategyOverviewStats, StrategyResult, TradingSessionId, SessionStats, SessionOverviewStats, SessionResult, EmotionSortKey, EmotionStats, EmotionOverviewStats, EmotionResult, HeatmapCell, HeatmapResult, PerformanceCalendarTradeItem, PerformanceCalendarDay, PerformanceCalendarMonthSummary, PerformanceCalendarResult, HabitImportance, HabitObservationCategory, HabitObservationEvidence, HabitObservation, HabitDetectionResult } from "./analytics";

export type {
  TradeField,
  TradeFieldType,
  TradeFieldMeta,
  CsvColumnMapping,
  BrokerFormat,
  DetectionConfidence,
  BrokerDetectionResult,
  CsvValidationStatus,
  CsvFieldError,
  CsvParsedValues,
  CsvValidatedRow,
  CsvValidationSummary,
  CsvValidationResult,
  CsvImportErrorCategory,
  CsvImportSeverity,
  CsvImportIssue,
  CsvImportReport,
  CsvDeduplicationStatus,
  CsvDeduplicationMatch,
  CsvDeduplicatedRow,
  CsvDeduplicationReport,
} from "./csvImport";

export type {
  MT5ErrorCode,
  MT5ErrorSeverity,
  MT5UserAction,
  MT5UserFacingError,
  MT5ErrorInput,
} from "./mt5Errors";

export type {
  MT5CheckErrorCode,
  MT5LegacyErrorCode,
  MT5BridgeCheckResult,
  MT5CheckStatus,
  MT5CheckAction,
  MT5HistoryPeriod,
  MT5RawDeal,
  MT5HistoryRange,
  MT5HistoryResult,
  MT5HistoryStatus,
  MT5RawCandle,
  MT5CandlesResult,
  MT5RawPosition,
  MT5PositionsResult,
  MT5PositionsStatus,
  MT5SyncReport,
  MT5SyncStatus,
} from "./mt5";

export type {
  MT4OrderType,
  MT4RawOrder,
  MT4ExportFile,
  MT4ReadResult,
  MT4ReadErrorCode,
  MT4MappingResult,
  MT4SkippedOrder,
  MT4ImportStatus,
} from "./mt4";

export type {
  ReplayScreenshotItem,
  TradeReplayFrame,
  TradeReplayDataset,
  GetTradeReplayDatasetOptions,
} from "./replay";

export type {
  TradeReplayChartDataSource,
  ChartTimeframe,
  MarketOhlcCandle,
  TradeChartMarkerKind,
  TradeChartMarker,
  TradeChartPriceLevel,
  TradeReplayChartModel,
  GetTradeReplayChartModelOptions,
} from "./chart";

export type {
  MarketDataCandle,
  UpsertMarketDataCandleInput,
  MarketDataRangeFilter,
  MarketDataImportSummary,
} from "./marketData";

export type {
  BacktestConditionType,
  BacktestRuleCondition,
  BacktestRuleSet,
  BacktestDirection,
  BacktestStrategy,
  BacktestStrategyInput,
  BacktestRun,
  BacktestTrade,
  BacktestEquityPoint,
  BacktestComparisonItem,
  BacktestRunDetails,
} from "./backtesting";

export type {
  AIRole,
  AIChatMessage,
  AIAnalyticsSummary,
  AIAnalyticsExport,
  AIConversationState,
  AIInsightCard,
  AIChatRequest,
  AIChatResponse,
} from "./ai";
