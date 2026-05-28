-- ============================================================
-- Migration 016 : broker_id sur tables metier
-- ============================================================
-- Objectif :
--   - ajouter broker_id sur trades/imports/mt5_sync_logs
--   - backfill depuis trading_accounts puis broker texte legacy
--   - conserver compatibilite (broker texte garde)
-- ============================================================

ALTER TABLE trades ADD COLUMN broker_id INTEGER;
ALTER TABLE imports ADD COLUMN broker_id INTEGER;
ALTER TABLE mt5_sync_logs ADD COLUMN broker_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_trades_broker_id
  ON trades (broker_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_imports_broker_id
  ON imports (broker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mt5_sync_logs_broker_id
  ON mt5_sync_logs (broker_id, started_at DESC);

-- 1) Backfill depuis compte normalise si disponible
UPDATE trades
SET broker_id = (
  SELECT ta.broker_id
  FROM trading_accounts ta
  WHERE ta.id = trades.trading_account_id
)
WHERE broker_id IS NULL
  AND trading_account_id IS NOT NULL;

UPDATE imports
SET broker_id = (
  SELECT ta.broker_id
  FROM trading_accounts ta
  WHERE ta.id = imports.trading_account_id
)
WHERE broker_id IS NULL
  AND trading_account_id IS NOT NULL;

UPDATE mt5_sync_logs
SET broker_id = (
  SELECT ta.broker_id
  FROM trading_accounts ta
  WHERE ta.id = mt5_sync_logs.trading_account_id
)
WHERE broker_id IS NULL
  AND trading_account_id IS NOT NULL;

-- 2) Fallback depuis broker texte legacy
UPDATE trades
SET broker_id = (
  SELECT b.id
  FROM brokers b
  WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(trades.broker))
  LIMIT 1
)
WHERE broker_id IS NULL
  AND broker IS NOT NULL
  AND TRIM(broker) <> '';

UPDATE imports
SET broker_id = (
  SELECT b.id
  FROM brokers b
  WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(imports.broker))
  LIMIT 1
)
WHERE broker_id IS NULL
  AND broker IS NOT NULL
  AND TRIM(broker) <> '';

UPDATE mt5_sync_logs
SET broker_id = (
  SELECT b.id
  FROM brokers b
  WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(mt5_sync_logs.broker))
  LIMIT 1
)
WHERE broker_id IS NULL
  AND broker IS NOT NULL
  AND TRIM(broker) <> '';

UPDATE app_metadata
SET value = '16', updated_at = datetime('now')
WHERE key = 'schema_version';
