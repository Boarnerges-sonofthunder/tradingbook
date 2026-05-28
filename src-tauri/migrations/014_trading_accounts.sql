-- ============================================================
-- Migration 014 : support multi-comptes trading
-- ============================================================
-- Objectif :
--   - table de reference `trading_accounts`
--   - liaison optionnelle via `trading_account_id` sur trades/imports/mt5_sync_logs
--   - retro-compatibilite : backfill depuis broker/platform/account_id existants
-- ============================================================

CREATE TABLE IF NOT EXISTS trading_accounts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    broker          TEXT    NOT NULL,
    platform        TEXT    NOT NULL CHECK (platform IN ('mt5', 'mt4', 'csv', 'manual')),
    account_number  TEXT    NOT NULL,
    account_type    TEXT    NOT NULL DEFAULT 'other',
    currency        TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_accounts_unique
    ON trading_accounts (broker, platform, account_number);

CREATE INDEX IF NOT EXISTS idx_trading_accounts_active
    ON trading_accounts (is_active, name);

ALTER TABLE trades ADD COLUMN trading_account_id INTEGER;
ALTER TABLE imports ADD COLUMN trading_account_id INTEGER;
ALTER TABLE mt5_sync_logs ADD COLUMN trading_account_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_trades_trading_account
    ON trades (trading_account_id);
CREATE INDEX IF NOT EXISTS idx_imports_trading_account
    ON imports (trading_account_id);
CREATE INDEX IF NOT EXISTS idx_mt5_sync_logs_trading_account
    ON mt5_sync_logs (trading_account_id);

-- Backfill table comptes depuis donnees existantes (trades/imports/logs)
INSERT OR IGNORE INTO trading_accounts (
    name,
    broker,
    platform,
    account_number,
    account_type,
    currency,
    is_active
)
SELECT
    TRIM(COALESCE(broker, 'Broker inconnu') || ' ' || UPPER(COALESCE(platform, 'manual')) || ' ' || COALESCE(account_id, 'compte-inconnu')),
    COALESCE(broker, 'Broker inconnu'),
    COALESCE(platform, 'manual'),
    COALESCE(account_id, 'compte-inconnu'),
    CASE
      WHEN LOWER(COALESCE(account_id, '')) LIKE '%demo%' THEN 'demo'
      ELSE 'other'
    END,
    NULL,
    1
FROM trades
WHERE (broker IS NOT NULL AND broker <> '')
   OR (account_id IS NOT NULL AND account_id <> '');

INSERT OR IGNORE INTO trading_accounts (
    name,
    broker,
    platform,
    account_number,
    account_type,
    currency,
    is_active
)
SELECT
    TRIM(COALESCE(broker, 'Broker inconnu') || ' ' || UPPER(COALESCE(source, 'csv')) || ' ' || COALESCE(account_id, 'compte-inconnu')),
    COALESCE(broker, 'Broker inconnu'),
    COALESCE(source, 'csv'),
    COALESCE(account_id, 'compte-inconnu'),
    CASE
      WHEN LOWER(COALESCE(account_id, '')) LIKE '%demo%' THEN 'demo'
      ELSE 'other'
    END,
    NULL,
    1
FROM imports
WHERE (broker IS NOT NULL AND broker <> '')
   OR (account_id IS NOT NULL AND account_id <> '');

-- Lier trades/imports/logs vers compte normalise
UPDATE trades
SET trading_account_id = (
  SELECT ta.id
  FROM trading_accounts ta
  WHERE ta.broker = COALESCE(trades.broker, 'Broker inconnu')
    AND ta.platform = COALESCE(trades.platform, 'manual')
    AND ta.account_number = COALESCE(trades.account_id, 'compte-inconnu')
)
WHERE trading_account_id IS NULL;

UPDATE imports
SET trading_account_id = (
  SELECT ta.id
  FROM trading_accounts ta
  WHERE ta.broker = COALESCE(imports.broker, 'Broker inconnu')
    AND ta.platform = COALESCE(imports.source, 'csv')
    AND ta.account_number = COALESCE(imports.account_id, 'compte-inconnu')
)
WHERE trading_account_id IS NULL;

UPDATE mt5_sync_logs
SET trading_account_id = (
  SELECT ta.id
  FROM trading_accounts ta
  WHERE ta.platform = 'mt5'
    AND ta.broker = COALESCE(mt5_sync_logs.broker, 'Broker inconnu')
    AND ta.account_number = COALESCE(mt5_sync_logs.account_id, 'compte-inconnu')
)
WHERE trading_account_id IS NULL;

UPDATE app_metadata
SET value = '14', updated_at = datetime('now')
WHERE key = 'schema_version';
