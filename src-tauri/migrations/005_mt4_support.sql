-- ============================================================
-- Migration 005 : support de la plateforme MetaTrader 4
-- ============================================================
-- Phase 6 Étape 2.1 (préparation architecture MT4)
--
-- OBJECTIF :
--   Étendre les contraintes CHECK des colonnes `platform` et `source`
--   pour accepter la valeur "mt4" dans les tables `trades` et `imports`.
--
-- CONTEXTE :
--   Migration 002 définit :
--     CHECK (platform IN ('mt5', 'csv', 'manual'))
--     CHECK (source   IN ('mt5', 'csv', 'manual'))
--
--   Cette migration étend à :
--     CHECK (platform IN ('mt5', 'mt4', 'csv', 'manual'))
--     CHECK (source   IN ('mt5', 'mt4', 'csv', 'manual'))
--
-- MÉTHODE SQLite :
--   SQLite ne supporte pas ALTER TABLE ... MODIFY CONSTRAINT.
--   La seule méthode sûre est :
--     1. Créer la nouvelle table avec les contraintes mises à jour
--     2. Copier toutes les données
--     3. Supprimer l'ancienne table
--     4. Renommer la nouvelle table
--
--   Cette opération est atomique grâce au BEGIN TRANSACTION.
--
-- PRÉREQUIS :
--   - Appliquer UNIQUEMENT si l'import MT4 est activé (Phase 6 Étape MT4)
--   - Sauvegarder la base de données avant application (automatique via backups)
--
-- RÈGLE : ne jamais modifier cette migration une fois appliquée en production.
--         Pour toute évolution future, créer migration 006.
-- ============================================================

-- NOTE : La transaction est gérée implicitement par tauri-plugin-sql (sqlx).
--        Ne pas ajouter BEGIN TRANSACTION / COMMIT dans ce fichier.

-- ── Étape 1 : Recréer la table `imports` avec 'mt4' dans le CHECK ─────────
-- NOTE : La migration 004 a renommé les colonnes de imports :
--   valid_rows   → imported_rows
--   skip_rows    → skipped_rows
--   error_msg    → error_message
--   et supprimé  → metadata, updated_at
--   et ajouté    → broker, account_id, warning_rows, file_size_bytes, imported_at
-- Ce CREATE TABLE reflète le schéma post-migration 004.

CREATE TABLE imports_v2 (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source          TEXT    NOT NULL CHECK (source IN ('mt5', 'mt4', 'csv', 'manual')),
    filename        TEXT,
    broker          TEXT,
    account_id      TEXT,
    status          TEXT    NOT NULL DEFAULT 'analyzed'
                            CHECK (status IN (
                                'analyzed',
                                'pending_confirmation',
                                'imported',
                                'cancelled',
                                'pending',
                                'in_progress',
                                'completed',
                                'failed'
                            )),
    total_rows      INTEGER NOT NULL DEFAULT 0,
    imported_rows   INTEGER NOT NULL DEFAULT 0,
    skipped_rows    INTEGER NOT NULL DEFAULT 0,
    error_rows      INTEGER NOT NULL DEFAULT 0,
    warning_rows    INTEGER NOT NULL DEFAULT 0,
    file_size_bytes INTEGER,
    imported_at     TEXT,
    error_message   TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO imports_v2
SELECT id, source, filename, broker, account_id, status, total_rows,
       imported_rows, skipped_rows, error_rows, warning_rows,
       file_size_bytes, imported_at, error_message, created_at
FROM imports;

DROP TABLE imports;
ALTER TABLE imports_v2 RENAME TO imports;

-- ── Étape 2 : Recréer la table `trades` avec 'mt4' dans les CHECK ─────────
-- NOTE : Les colonnes et contraintes sont identiques à migration 002,
--        seuls les CHECK platform et source sont étendus.

CREATE TABLE trades_v2 (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Déduplication
    external_id         TEXT,

    -- Contexte compte
    broker              TEXT,
    account_id          TEXT,
    platform            TEXT    NOT NULL DEFAULT 'manual'
                                CHECK (platform IN ('mt5', 'mt4', 'csv', 'manual')),
    source              TEXT    NOT NULL DEFAULT 'manual'
                                CHECK (source IN ('mt5', 'mt4', 'csv', 'manual')),
    import_id           INTEGER REFERENCES imports(id) ON DELETE SET NULL,

    -- Instrument
    symbol              TEXT    NOT NULL,
    side                TEXT    NOT NULL CHECK (side IN ('buy', 'sell')),

    -- Cycle de vie
    status              TEXT    NOT NULL DEFAULT 'closed'
                                CHECK (status IN ('open', 'closed', 'cancelled')),
    opened_at           TEXT    NOT NULL,
    closed_at           TEXT,

    -- Prix
    entry_price         REAL    NOT NULL,
    exit_price          REAL,
    stop_loss           REAL,
    take_profit         REAL,

    -- Volume
    volume              REAL    NOT NULL DEFAULT 1.0,

    -- Frais
    commission          REAL    NOT NULL DEFAULT 0.0,
    swap                REAL    NOT NULL DEFAULT 0.0,
    fees                REAL    NOT NULL DEFAULT 0.0,

    -- P&L
    gross_pnl           REAL,
    net_pnl             REAL,
    currency            TEXT    NOT NULL DEFAULT 'USD',

    -- Gestion du risque
    risk_amount         REAL,
    reward_amount       REAL,
    risk_reward_ratio   REAL,

    -- Stratégie
    strategy_id         INTEGER REFERENCES strategies(id) ON DELETE SET NULL,

    -- Horodatage
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO trades_v2
SELECT id, external_id, broker, account_id, platform, source, import_id,
       symbol, side, status, opened_at, closed_at,
       entry_price, exit_price, stop_loss, take_profit,
       volume, commission, swap, fees,
       gross_pnl, net_pnl, currency,
       risk_amount, reward_amount, risk_reward_ratio,
       strategy_id, created_at, updated_at
FROM trades;

DROP TABLE trades;
ALTER TABLE trades_v2 RENAME TO trades;

-- ── Étape 3 : Recréer les index supprimés avec les tables ─────────────────

CREATE INDEX IF NOT EXISTS idx_trades_symbol      ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status      ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_opened_at   ON trades(opened_at);
CREATE INDEX IF NOT EXISTS idx_trades_platform    ON trades(platform);
CREATE INDEX IF NOT EXISTS idx_trades_import_id   ON trades(import_id);
CREATE INDEX IF NOT EXISTS idx_trades_external_id ON trades(external_id);
CREATE INDEX IF NOT EXISTS idx_imports_source     ON imports(source);
CREATE INDEX IF NOT EXISTS idx_imports_status     ON imports(status);

-- ── Étape 4 : Mettre à jour la version du schéma ──────────────────────────

UPDATE app_metadata SET value = '5', updated_at = datetime('now')
WHERE key = 'schema_version';
