// ============================================================
// Constantes — Trading
// ============================================================
// Valeurs de référence pour le trading : instruments, timeframes…
// Ces constantes évitent les chaînes magiques dispersées dans le code.
// ============================================================

// ------------------------------------------------------------
// Instruments
// ------------------------------------------------------------

export const FOREX_PAIRS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
  "USDCHF", "NZDUSD", "EURGBP", "EURJPY", "GBPJPY",
  "AUDCAD", "AUDCHF", "CADJPY", "CHFJPY", "EURCHF",
] as const;

export const INDICES = [
  "US30", "US500", "NAS100", "GER40", "UK100", "JPN225", "FRA40",
] as const;

export const COMMODITIES = [
  "XAUUSD", "XAGUSD", "USOIL", "UKOIL",
] as const;

export const CRYPTO_PAIRS = [
  "BTCUSD", "ETHUSD", "XRPUSD", "BNBUSD",
] as const;

/** Tous les instruments supportés (union des 4 catégories). */
export const ALL_INSTRUMENTS = [
  ...FOREX_PAIRS,
  ...INDICES,
  ...COMMODITIES,
  ...CRYPTO_PAIRS,
] as const;

// ------------------------------------------------------------
// Timeframes
// ------------------------------------------------------------

export const TIMEFRAMES = [
  "M1", "M5", "M15", "M30",
  "H1", "H4",
  "D1", "W1", "MN",
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

// ------------------------------------------------------------
// Sessions de trading
// ------------------------------------------------------------

export const TRADING_SESSIONS = {
  ASIAN: "asian",
  LONDON: "london",
  NEW_YORK: "new_york",
  OVERLAP: "london_ny_overlap",
} as const;

// ------------------------------------------------------------
// Tailles de lot standard
// ------------------------------------------------------------

export const LOT_SIZES = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0,
] as const;
