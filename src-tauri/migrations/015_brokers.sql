-- ============================================================
-- Migration 015 : support multi-brokers
-- ============================================================
-- Objectif :
--   - table de reference `brokers`
--   - liaison optionnelle `trading_accounts.broker_id`
--   - backfill depuis donnees historiques (trading_accounts/trades/imports/mt5_sync_logs)
--   - preservation des donnees existantes (aucune suppression)
-- ============================================================

CREATE TABLE IF NOT EXISTS brokers (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    name                 TEXT    NOT NULL,
    broker_type          TEXT    NOT NULL DEFAULT 'retail',
    platform_supported   TEXT    NOT NULL DEFAULT '["mt5","mt4","csv","manual"]',
    website              TEXT,
    is_active            INTEGER NOT NULL DEFAULT 1,
    created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brokers_name_unique
    ON brokers (name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_brokers_active_name
    ON brokers (is_active, name COLLATE NOCASE);

-- Seeds explicites demandes + profils CSV generiques
INSERT OR IGNORE INTO brokers (name, broker_type, platform_supported, website, is_active)
VALUES
    ('Fusion Markets', 'retail', '["mt5","mt4","csv"]', 'https://fusionmarkets.com', 1),
    ('IC Markets', 'retail', '["mt5","mt4","csv"]', 'https://icmarkets.com', 1),
    ('OANDA', 'retail', '["mt5","mt4","csv"]', 'https://www.oanda.com', 1),
    ('Pepperstone', 'retail', '["mt5","mt4","csv"]', 'https://pepperstone.com', 1),
    ('FTMO', 'prop', '["mt5","mt4","csv"]', 'https://ftmo.com', 1),
    ('CSV Import', 'csv', '["csv"]', NULL, 1);

-- Backfill brokers depuis donnees historiques
INSERT OR IGNORE INTO brokers (name, broker_type, platform_supported, website, is_active)
SELECT DISTINCT
    TRIM(broker) AS name,
    CASE WHEN LOWER(TRIM(broker)) LIKE '%csv%' THEN 'csv' ELSE 'retail' END,
    '["mt5","mt4","csv","manual"]',
    NULL,
    1
FROM trading_accounts
WHERE broker IS NOT NULL AND TRIM(broker) <> '';

INSERT OR IGNORE INTO brokers (name, broker_type, platform_supported, website, is_active)
SELECT DISTINCT
    TRIM(broker) AS name,
    CASE WHEN LOWER(TRIM(broker)) LIKE '%csv%' THEN 'csv' ELSE 'retail' END,
    '["mt5","mt4","csv","manual"]',
    NULL,
    1
FROM trades
WHERE broker IS NOT NULL AND TRIM(broker) <> '';

INSERT OR IGNORE INTO brokers (name, broker_type, platform_supported, website, is_active)
SELECT DISTINCT
    TRIM(broker) AS name,
    CASE WHEN LOWER(TRIM(broker)) LIKE '%csv%' THEN 'csv' ELSE 'retail' END,
    '["mt5","mt4","csv","manual"]',
    NULL,
    1
FROM imports
WHERE broker IS NOT NULL AND TRIM(broker) <> '';

INSERT OR IGNORE INTO brokers (name, broker_type, platform_supported, website, is_active)
SELECT DISTINCT
    TRIM(broker) AS name,
    CASE WHEN LOWER(TRIM(broker)) LIKE '%csv%' THEN 'csv' ELSE 'retail' END,
    '["mt5","mt4","csv","manual"]',
    NULL,
    1
FROM mt5_sync_logs
WHERE broker IS NOT NULL AND TRIM(broker) <> '';

ALTER TABLE trading_accounts ADD COLUMN broker_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_trading_accounts_broker_id
    ON trading_accounts (broker_id, is_active);

-- Lier comptes existants vers brokers normalises
UPDATE trading_accounts
SET broker_id = (
    SELECT b.id
    FROM brokers b
    WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(trading_accounts.broker))
    LIMIT 1
)
WHERE broker_id IS NULL
  AND broker IS NOT NULL
  AND TRIM(broker) <> '';

UPDATE app_metadata
SET value = '15', updated_at = datetime('now')
WHERE key = 'schema_version';
