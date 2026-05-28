-- ============================================================
-- Migration 013 : unicite robuste market_ohlc (NULL-safe)
-- ============================================================
-- SQLite traite NULL comme distinct dans index UNIQUE.
-- On normalise broker/account_id via COALESCE pour garantir upsert stable.
-- ============================================================

DROP INDEX IF EXISTS idx_market_ohlc_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_ohlc_unique_norm
    ON market_ohlc(
      platform,
      COALESCE(broker, ''),
      COALESCE(account_id, ''),
      symbol,
      timeframe,
      candle_time
    );

UPDATE app_metadata
SET value = '13', updated_at = datetime('now')
WHERE key = 'schema_version';
