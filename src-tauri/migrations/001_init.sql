-- ============================================================
-- Migration 001 : tables initiales de TradingBook
-- ============================================================
-- Cette migration crée le socle minimal de la base de données :
--   - app_metadata : métadonnées internes et suivi de version
--   - settings     : préférences utilisateur (clé-valeur)
--
-- RÈGLE : ne jamais modifier une migration déjà appliquée en production.
-- Pour toute évolution future, créer une nouvelle migration (002, 003…).
-- ============================================================

-- app_metadata : key-value store interne pour les métadonnées
-- et la version du schéma. Sert aussi à vérifier la connexion.
CREATE TABLE IF NOT EXISTS app_metadata (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Initialisation des métadonnées de base
INSERT OR IGNORE INTO app_metadata (key, value)
VALUES ('schema_version', '1');

INSERT OR IGNORE INTO app_metadata (key, value)
VALUES ('created_at', datetime('now'));

-- ============================================================
-- settings : préférences utilisateur stockées en clé-valeur.
-- Permet d'ajouter de nouvelles préférences sans modifier le schéma.
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT    NOT NULL UNIQUE,
    value      TEXT,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Préférences par défaut
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme',    'dark');
INSERT OR IGNORE INTO settings (key, value) VALUES ('language', 'fr');
