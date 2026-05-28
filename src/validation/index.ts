// ============================================================
// Validation — Point d'entrée central
// ============================================================
// Importer depuis ce fichier dans les services et pages :
//   import { validate, ValidationError, CreateTradeInputSchema } from "../../validation";
// ============================================================

// Utilitaires communs
export { validate, ValidationError, isoDateString, hexColor, positiveId } from "./common";

// Trades
export {
  TradeSideSchema,
  TradeStatusSchema,
  TradeOutcomeSchema,
  TradePlatformSchema,
  CreateTradeInputSchema,
  UpdateTradeInputSchema,
} from "./tradeSchemas";

// Strategies
export { StrategyFormDataSchema, UpdateStrategySchema } from "./strategySchemas";

// Trading accounts
export {
  TradingAccountTypeSchema,
  TradingAccountFormDataSchema,
  UpdateTradingAccountSchema,
} from "./tradingAccountSchemas";

// Brokers
export {
  BrokerTypeSchema,
  BrokerPlatformSchema,
  BrokerFormDataSchema,
  UpdateBrokerSchema,
} from "./brokerSchemas";
// Tags
export { CreateTagInputSchema, UpdateTagSchema } from "./tagSchemas";

// Notes
export { NoteContentSchema } from "./noteSchemas";

// Screenshots
export { CreateScreenshotInputSchema, UpdateScreenshotSchema } from "./screenshotSchemas";

// Emotions & Mistakes
export {
  CreateEmotionInputSchema,
  UpdateEmotionSchema,
  EmotionPhaseSchema,
  AddEmotionToTradeInputSchema,
  CreateMistakeInputSchema,
  UpdateMistakeSchema,
  AddMistakeToTradeInputSchema,
} from "./journalSchemas";

// Settings
export {
  DisplayCurrencyCodeSchema,
  ThemePreferenceSchema,
  LanguageCodeSchema,
  DateTimeFormatPreferenceSchema,
  StartupPagePreferenceSchema,
  UserSettingsSchema,
  PartialUserSettingsSchema,
} from "./settingsSchemas";

// Imports
export { ImportSourceSchema, CreateImportInputSchema } from "./importSchemas";

// Backups
export { BackupTriggerSchema, CreateBackupInputSchema } from "./backupSchemas";

// Backtesting
export {
  BacktestStrategyInputSchema,
  UpdateBacktestStrategyInputSchema,
} from "./backtestingSchemas";
