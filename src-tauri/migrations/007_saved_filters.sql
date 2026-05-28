-- ============================================================
-- Migration 007 : filtres sauvegardes
-- ============================================================
-- Objectif :
--   Permettre a l'utilisateur d'enregistrer des vues filtrees du
--   journal des trades.
--
-- Important :
--   filters_json contient uniquement les criteres de filtre.
--   Les resultats/trades filtres ne sont jamais copies ici.
--
-- NOTE : La transaction est geree implicitement par tauri-plugin-sql (sqlx).
--        Ne pas ajouter BEGIN TRANSACTION / COMMIT dans ce fichier.
-- ============================================================

CREATE TABLE IF NOT EXISTS saved_filters (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL COLLATE NOCASE UNIQUE
                         CHECK (TRIM(name) <> ''),
    filters_json TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_name
    ON saved_filters(name COLLATE NOCASE);

CREATE TRIGGER IF NOT EXISTS trg_saved_filters_updated_at
AFTER UPDATE ON saved_filters
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE saved_filters
    SET updated_at = datetime('now')
    WHERE id = OLD.id;
END;

UPDATE app_metadata SET value = '7', updated_at = datetime('now')
WHERE key = 'schema_version';
