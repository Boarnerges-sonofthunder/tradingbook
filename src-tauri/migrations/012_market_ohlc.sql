-- ============================================================
-- Migration 012 : stockage local OHLC pour TradeReplay
-- ============================================================
-- Objectif :
--   Ajouter table locale de chandelles marche pour relecture historique.
--   Usage strictement analytique (aucun ordre, aucun signal).
--
-- Contexte architecture :
--   broker -> platform -> bridge local/CSV -> TradingBook -> SQLite
-- ============================================================

CREATE TABLE IF NOT EXISTS market_ohlc (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    platform      TEXT NOT NULL CHECK (platform IN ('mt5', 'mt4', 'csv', 'manual')),
    broker        TEXT,
    account_id    TEXT,
    symbol        TEXT NOT NULL,
    timeframe     TEXT NOT NULL CHECK (timeframe IN ('M1','M5','M15','M30','H1','H4','D1')),
    candle_time   TEXT NOT NULL,
    open          REAL NOT NULL,
    high          REAL NOT NULL,
    low           REAL NOT NULL,
    close         REAL NOT NULL,
    volume        REAL,
    source_label  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (high >= low)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_ohlc_unique
    ON market_ohlc(platform, broker, account_id, symbol, timeframe, candle_time);

CREATE INDEX IF NOT EXISTS idx_market_ohlc_symbol_tf_time
    ON market_ohlc(symbol, timeframe, candle_time);

CREATE INDEX IF NOT EXISTS idx_market_ohlc_context
    ON market_ohlc(platform, broker, account_id, symbol, timeframe, candle_time);

CREATE TRIGGER IF NOT EXISTS trg_market_ohlc_updated_at
    AFTER UPDATE ON market_ohlc
    FOR EACH ROW
BEGIN
    UPDATE market_ohlc
    SET updated_at = datetime('now')
    WHERE id = OLD.id;
END;

UPDATE app_metadata
SET value = '12', updated_at = datetime('now')
WHERE key = 'schema_version';
