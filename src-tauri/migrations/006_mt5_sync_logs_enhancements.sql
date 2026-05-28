-- ============================================================
-- Migration 006 : logs de synchronisation MT5 détaillés
-- ============================================================
-- Objectif :
--   Remplacer l'ancien format minimal de `mt5_sync_logs` par un journal
--   local lisible pour chaque synchronisation MT5.
--
-- Champs ajoutés :
--   started_at, finished_at, account_id, broker, server, trades_read,
--   trades_added, trades_updated, duplicates_ignored, probable_duplicates,
--   invalid_trades.
--
-- Les anciens compteurs sont conservés par migration :
--   total_trades   -> trades_read
--   new_trades     -> trades_added
--   updated_trades -> trades_updated
--   skipped_trades -> duplicates_ignored
--
-- Les logs restent exclusivement locaux dans SQLite.
-- NOTE : La transaction est gérée implicitement par tauri-plugin-sql (sqlx).
--        Ne pas ajouter BEGIN TRANSACTION / COMMIT dans ce fichier.
-- ============================================================

CREATE TABLE mt5_sync_logs_v2 (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    data_path           TEXT,

    started_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    finished_at         TEXT,
    status              TEXT    NOT NULL DEFAULT 'running'
                                CHECK (status IN (
                                    'running',
                                    'success',
                                    'partial_success',
                                    'failed',
                                    'cancelled'
                                )),

    account_id          TEXT,
    broker              TEXT,
    server              TEXT,

    trades_read         INTEGER NOT NULL DEFAULT 0 CHECK (trades_read >= 0),
    trades_added        INTEGER NOT NULL DEFAULT 0 CHECK (trades_added >= 0),
    trades_updated      INTEGER NOT NULL DEFAULT 0 CHECK (trades_updated >= 0),
    duplicates_ignored  INTEGER NOT NULL DEFAULT 0 CHECK (duplicates_ignored >= 0),
    probable_duplicates INTEGER NOT NULL DEFAULT 0 CHECK (probable_duplicates >= 0),
    invalid_trades      INTEGER NOT NULL DEFAULT 0 CHECK (invalid_trades >= 0),

    error_message       TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO mt5_sync_logs_v2 (
    id,
    data_path,
    started_at,
    finished_at,
    status,
    trades_read,
    trades_added,
    trades_updated,
    duplicates_ignored,
    probable_duplicates,
    invalid_trades,
    error_message,
    created_at
)
SELECT
    id,
    data_path,
    COALESCE(created_at, synced_at, datetime('now')) AS started_at,
    synced_at AS finished_at,
    CASE status
        WHEN 'success' THEN 'success'
        WHEN 'failed' THEN 'failed'
        WHEN 'in_progress' THEN 'running'
        WHEN 'pending' THEN 'running'
        ELSE 'failed'
    END AS status,
    COALESCE(total_trades, 0) AS trades_read,
    COALESCE(new_trades, 0) AS trades_added,
    COALESCE(updated_trades, 0) AS trades_updated,
    COALESCE(skipped_trades, 0) AS duplicates_ignored,
    0 AS probable_duplicates,
    0 AS invalid_trades,
    error_message,
    COALESCE(created_at, datetime('now')) AS created_at
FROM mt5_sync_logs;

DROP TABLE mt5_sync_logs;
ALTER TABLE mt5_sync_logs_v2 RENAME TO mt5_sync_logs;

CREATE INDEX IF NOT EXISTS idx_mt5_sync_logs_started_at
    ON mt5_sync_logs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_mt5_sync_logs_status
    ON mt5_sync_logs(status);

UPDATE app_metadata SET value = '6', updated_at = datetime('now')
WHERE key = 'schema_version';
