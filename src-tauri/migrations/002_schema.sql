-- ============================================================
-- Migration 002 : Schéma complet TradingBook
-- ============================================================
-- Cette migration crée toutes les tables métier de l'application :
--   • strategies      — playbooks et stratégies de trading
--   • tags            — étiquettes libres
--   • mistakes        — catalogue d'erreurs de trading
--   • emotions        — catalogue d'émotions
--   • imports         — sessions d'importation CSV / MT5
--   • trades          — table centrale des trades (source de vérité)
--   • trade_entries   — points d'entrée multiples (scaling in)
--   • trade_exits     — sorties partielles (scaling out)
--   • trade_notes     — notes textuelles
--   • trade_screenshots — captures d'écran (métadonnées uniquement)
--   • trade_tags      — liaison trades ↔ tags  (M:N)
--   • trade_mistakes  — liaison trades ↔ erreurs (M:N)
--   • trade_emotions  — liaison trades ↔ émotions (M:N)
--   • import_rows     — lignes brutes d'une session d'import
--   • mt5_sync_logs   — historique des synchronisations MT5
--   • backups         — historique des sauvegardes locales
--
-- Rappel : ne jamais modifier une migration déjà appliquée.
-- Pour toute évolution, créer une nouvelle migration (003, 004…).
-- ============================================================

-- NOTE : PRAGMA foreign_keys = ON doit être activé au niveau de la
-- connexion (pas ici, car les PRAGMAs ne fonctionnent pas dans une
-- transaction sqlx). Les FK sont définies pour la documentation et
-- la cohérence du schéma.

-- ============================================================
-- STRATEGIES — Playbooks et stratégies de trading
-- ============================================================
-- Une stratégie regroupe les règles, conditions d'entrée/sortie,
-- et contexte de marché utilisés pour prendre un trade.
-- Un trade peut être associé à au plus une stratégie.
-- ============================================================
CREATE TABLE IF NOT EXISTS strategies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT,
    -- Texte libre décrivant les règles de la stratégie (markdown accepté)
    rules       TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_strategies_updated_at
    AFTER UPDATE ON strategies
    FOR EACH ROW
BEGIN
    UPDATE strategies SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- ============================================================
-- TAGS — Étiquettes libres pour catégoriser les trades
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    color      TEXT    NOT NULL DEFAULT '#6366f1',  -- Couleur HEX pour l'UI
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- MISTAKES — Catalogue d'erreurs de trading
-- ============================================================
-- Prérempli avec les erreurs les plus courantes.
-- L'utilisateur peut en ajouter librement.
-- ============================================================
CREATE TABLE IF NOT EXISTS mistakes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO mistakes (name, description) VALUES
    ('Pas de stop loss',            'Trade ouvert sans stop loss défini'),
    ('Overtrading',                 'Trop de trades pris en peu de temps'),
    ('FOMO',                        'Entrée impulsive par peur de rater une opportunité'),
    ('Stop loss déplacé',           'Stop loss déplacé dans le mauvais sens pendant le trade'),
    ('Taille de lot trop grande',   'Risque pris supérieur au plan de gestion du capital'),
    ('Entrée trop tôt',             'Entrée avant la confirmation du signal'),
    ('Entrée trop tard',            'Entrée après que le signal principal soit passé'),
    ('Non-respect du plan',         'Trade pris hors de la stratégie définie'),
    ('Sortie prématurée',           'Clôture du trade avant l''objectif sans raison valable'),
    ('Revenge trading',             'Trade pris pour récupérer immédiatement une perte');

-- ============================================================
-- EMOTIONS — Catalogue d'émotions liées au trading
-- ============================================================
CREATE TABLE IF NOT EXISTS emotions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO emotions (name, description) VALUES
    ('calme',       'État mental équilibré, sans stress ni excitation excessive'),
    ('confiant',    'Confiance solide dans l''analyse et le plan de trade'),
    ('anxieux',     'Inquiétude ou stress avant ou pendant le trade'),
    ('impatient',   'Difficulté à attendre la confirmation du signal d''entrée'),
    ('euphorique',  'Excitation excessive généralement après un gain important'),
    ('frustré',     'Frustration après une perte ou un trade manqué'),
    ('focalisé',    'Pleine attention sur l''analyse, sans distraction'),
    ('hésitant',    'Doute sur la validité du signal ou du plan');

-- ============================================================
-- IMPORTS — Sessions d'importation (fichier CSV ou MT5 direct)
-- ============================================================
-- Chaque import est une session traçable : source, résultat, erreurs.
-- Les lignes brutes sont conservées dans import_rows pour audit.
-- ============================================================
CREATE TABLE IF NOT EXISTS imports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Source de l'import
    source          TEXT    NOT NULL CHECK (source IN ('mt5', 'csv', 'manual')),
    filename        TEXT,               -- Nom du fichier source (NULL si MT5 direct)
    -- Broker / compte détectés automatiquement depuis le fichier
    broker          TEXT,
    account_id      TEXT,
    -- Résultats du traitement
    status          TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    total_rows      INTEGER NOT NULL DEFAULT 0,
    imported_rows   INTEGER NOT NULL DEFAULT 0,
    skipped_rows    INTEGER NOT NULL DEFAULT 0,
    error_rows      INTEGER NOT NULL DEFAULT 0,
    -- Dates
    imported_at     TEXT,               -- Horodatage de fin d'import réussie
    error_message   TEXT,               -- Message d'erreur si status = 'failed'
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- TRADES — Table centrale (source de vérité locale)
-- ============================================================
-- Un trade représente une position complète (ou en cours) sur un instrument.
--
-- Déduplication lors des imports :
--   Un UNIQUE INDEX sur (external_id, account_id) empêche les doublons
--   pour les imports MT5/CSV. external_id = ticket MT5 ou identifiant CSV.
--
-- P&L :
--   gross_pnl = P&L brut avant commission/swap/fees
--   net_pnl   = gross_pnl - commission - swap - fees
-- ============================================================
CREATE TABLE IF NOT EXISTS trades (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identifiant externe pour la déduplication (ticket MT5, ID CSV…)
    external_id       TEXT,
    -- Contexte du compte
    broker            TEXT,               -- Ex : "FTMO", "IC Markets"
    account_id        TEXT,               -- Numéro / nom du compte trading
    platform          TEXT    NOT NULL DEFAULT 'manual'
                              CHECK (platform IN ('mt5', 'csv', 'manual')),
    source            TEXT    NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('mt5', 'csv', 'manual')),
    -- Référence à la session d'import ayant créé ce trade (NULL si manuel)
    import_id         INTEGER REFERENCES imports(id) ON DELETE SET NULL,

    -- Instrument financier
    symbol            TEXT    NOT NULL,
    side              TEXT    NOT NULL CHECK (side IN ('buy', 'sell')),

    -- Cycle de vie
    status            TEXT    NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'closed', 'cancelled')),
    opened_at         TEXT    NOT NULL,   -- ISO 8601 (ex : "2024-01-15T09:30:00")
    closed_at         TEXT,               -- NULL tant que le trade est ouvert

    -- Prix
    entry_price       REAL    NOT NULL,
    exit_price        REAL,               -- NULL si trade encore ouvert
    stop_loss         REAL,
    take_profit       REAL,

    -- Volume
    volume            REAL    NOT NULL,   -- Taille de la position en lots

    -- Frais (tous en devise du compte)
    commission        REAL    NOT NULL DEFAULT 0,
    swap              REAL    NOT NULL DEFAULT 0,
    fees              REAL    NOT NULL DEFAULT 0,   -- Autres frais divers

    -- P&L (en devise du compte)
    gross_pnl         REAL,               -- Avant frais
    net_pnl           REAL,               -- Après frais (= gross_pnl - commission - swap - fees)
    currency          TEXT    NOT NULL DEFAULT 'USD',

    -- Gestion du risque
    risk_amount       REAL,               -- Montant risqué (en devise compte)
    reward_amount     REAL,               -- Gain potentiel (en devise compte)
    risk_reward_ratio REAL,               -- reward_amount / risk_amount

    -- Stratégie utilisée
    strategy_id       INTEGER REFERENCES strategies(id) ON DELETE SET NULL,

    -- Métadonnées
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Index pour les filtres et tris les plus fréquents
CREATE INDEX IF NOT EXISTS idx_trades_symbol      ON trades (symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status      ON trades (status);
CREATE INDEX IF NOT EXISTS idx_trades_side        ON trades (side);
CREATE INDEX IF NOT EXISTS idx_trades_opened_at   ON trades (opened_at);
CREATE INDEX IF NOT EXISTS idx_trades_closed_at   ON trades (closed_at);
CREATE INDEX IF NOT EXISTS idx_trades_strategy_id ON trades (strategy_id);
CREATE INDEX IF NOT EXISTS idx_trades_import_id   ON trades (import_id);
CREATE INDEX IF NOT EXISTS idx_trades_account     ON trades (broker, account_id);
-- Index composite pour l'analytics par période
CREATE INDEX IF NOT EXISTS idx_trades_period      ON trades (status, opened_at, closed_at);

-- Index unique pour la déduplication import MT5/CSV
-- (external_id + account_id) doit être unique quand les deux sont renseignés
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_dedup
    ON trades (external_id, account_id)
    WHERE external_id IS NOT NULL AND account_id IS NOT NULL;

-- Trigger : met à jour updated_at automatiquement à chaque modification
CREATE TRIGGER IF NOT EXISTS trg_trades_updated_at
    AFTER UPDATE ON trades
    FOR EACH ROW
BEGIN
    UPDATE trades SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- ============================================================
-- TRADE_ENTRIES — Points d'entrée multiples (scaling in)
-- ============================================================
-- Pour les traders qui entrent sur plusieurs niveaux de prix.
-- Le trade principal garde entry_price = prix de la première entrée
-- (ou prix moyen pondéré calculé côté applicatif).
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id     INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    price        REAL    NOT NULL,
    volume       REAL    NOT NULL,   -- Lots pour cette entrée partielle
    executed_at  TEXT    NOT NULL,   -- ISO 8601
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trade_entries_trade_id ON trade_entries (trade_id);

-- ============================================================
-- TRADE_EXITS — Sorties partielles (scaling out / partial close)
-- ============================================================
-- Pour les traders qui ferment la position en plusieurs fois.
-- La somme des volumes doit correspondre au volume total du trade.
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_exits (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id     INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    price        REAL    NOT NULL,
    volume       REAL    NOT NULL,   -- Lots fermés sur cette sortie
    pnl          REAL,               -- P&L réalisé sur cette sortie partielle
    executed_at  TEXT    NOT NULL,   -- ISO 8601
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trade_exits_trade_id ON trade_exits (trade_id);

-- ============================================================
-- TRADE_NOTES — Notes textuelles attachées à un trade
-- ============================================================
-- Supporte plusieurs notes par trade (journal de bord, analyse post-trade…).
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    content    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trade_notes_trade_id ON trade_notes (trade_id);

-- ============================================================
-- TRADE_SCREENSHOTS — Captures d'écran associées à un trade
-- ============================================================
-- SQLite stocke uniquement les métadonnées.
-- Le fichier physique est dans le dossier screenshots local
-- (chemin absolu reconstruit via getFilePath('screenshots', filename)).
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_screenshots (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    -- Nom de fichier relatif dans le dossier screenshots
    -- (ex : "2024-01-15_EURUSD_entry.png")
    filename   TEXT    NOT NULL,
    timeframe  TEXT,                  -- Ex : "H1", "M15", "D1"
    label      TEXT,                  -- Libellé libre : "Entrée", "Sortie", "Contexte"
    notes      TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trade_screenshots_trade_id ON trade_screenshots (trade_id);

-- ============================================================
-- TRADE_TAGS — Liaison many-to-many : trades ↔ tags
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_tags (
    trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (trade_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_tags_tag_id ON trade_tags (tag_id);

-- ============================================================
-- TRADE_MISTAKES — Liaison many-to-many : trades ↔ erreurs
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_mistakes (
    trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    mistake_id INTEGER NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
    notes      TEXT,                  -- Contexte spécifique à ce trade
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (trade_id, mistake_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_mistakes_mistake_id ON trade_mistakes (mistake_id);

-- ============================================================
-- TRADE_EMOTIONS — Liaison many-to-many : trades ↔ émotions
-- ============================================================
-- phase : moment auquel l'émotion a été ressentie (avant/pendant/après)
-- intensity : niveau d'intensité de 1 (faible) à 5 (très forte)
-- La clé primaire composite inclut phase pour permettre de noter
-- la même émotion à différents moments du trade.
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_emotions (
    trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    emotion_id INTEGER NOT NULL REFERENCES emotions(id) ON DELETE CASCADE,
    intensity  INTEGER NOT NULL DEFAULT 3 CHECK (intensity BETWEEN 1 AND 5),
    phase      TEXT    NOT NULL DEFAULT 'during'
                       CHECK (phase IN ('before', 'during', 'after')),
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (trade_id, emotion_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_trade_emotions_emotion_id ON trade_emotions (emotion_id);

-- ============================================================
-- IMPORT_ROWS — Lignes brutes d'une session d'import
-- ============================================================
-- Chaque ligne du fichier source est conservée pour :
--   - traçabilité complète de l'import
--   - rejeu en cas d'erreur
--   - audit des données importées
-- raw_data : contenu JSON de la ligne originale (toutes colonnes)
-- ============================================================
CREATE TABLE IF NOT EXISTS import_rows (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id     INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    row_index     INTEGER NOT NULL,     -- Numéro de ligne dans le fichier source
    raw_data      TEXT    NOT NULL,     -- JSON : toutes les colonnes de la ligne
    status        TEXT    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'imported', 'skipped', 'error')),
    trade_id      INTEGER REFERENCES trades(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_import_rows_import_id ON import_rows (import_id);
CREATE INDEX IF NOT EXISTS idx_import_rows_trade_id  ON import_rows (trade_id);

-- ============================================================
-- MT5_SYNC_LOGS — Historique des synchronisations MetaTrader 5
-- ============================================================
-- Trace chaque tentative de synchronisation avec MT5 (succès ou échec).
-- data_path : chemin du dossier ou fichier MT5 utilisé comme source.
-- ============================================================
CREATE TABLE IF NOT EXISTS mt5_sync_logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    data_path      TEXT,               -- Chemin utilisé (dossier MT5 ou fichier)
    status         TEXT    NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'in_progress', 'success', 'failed')),
    total_trades   INTEGER NOT NULL DEFAULT 0,
    new_trades     INTEGER NOT NULL DEFAULT 0,
    updated_trades INTEGER NOT NULL DEFAULT 0,
    skipped_trades INTEGER NOT NULL DEFAULT 0,  -- Doublons détectés et ignorés
    error_message  TEXT,
    synced_at      TEXT,               -- Horodatage de fin de synchronisation
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- BACKUPS — Historique des sauvegardes locales
-- ============================================================
-- SQLite stocke uniquement les métadonnées du backup.
-- Le fichier .db est dans le dossier backups local
-- (chemin absolu reconstruit via getFilePath('backups', filename)).
-- ============================================================
CREATE TABLE IF NOT EXISTS backups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT    NOT NULL,     -- Nom du fichier (ex : "backup_2024-01-15T14-30-00.db")
    size_bytes INTEGER,              -- Taille du fichier en octets (NULL si inconnu)
    -- Déclencheur du backup
    trigger    TEXT    NOT NULL DEFAULT 'manual'
                       CHECK (trigger IN ('manual', 'auto', 'pre_import', 'pre_migration')),
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Mise à jour des paramètres par défaut supplémentaires
-- ============================================================
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_currency',     'USD');
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_risk_percent', '1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_broker',       '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_account_id',   '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_backup',          'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('backup_interval_days', '7');

-- ============================================================
-- Mise à jour de la version du schéma
-- ============================================================
INSERT OR REPLACE INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '2', datetime('now'));
