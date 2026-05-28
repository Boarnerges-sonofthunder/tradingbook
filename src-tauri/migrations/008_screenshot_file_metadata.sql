-- ============================================================
-- Migration 008 : metadonnees fichiers des screenshots
-- ============================================================
-- Objectif :
--   Conserver un chemin relatif stable, le nom original/securise,
--   le type MIME et la taille du fichier sans stocker l'image en SQLite.
--
-- Compatibilite :
--   Les anciennes lignes gardent `filename`. `file_path` est backfill avec
--   cette valeur pour continuer a retrouver les captures deja liees.
-- ============================================================

ALTER TABLE trade_screenshots ADD COLUMN file_path TEXT;
ALTER TABLE trade_screenshots ADD COLUMN file_name TEXT;
ALTER TABLE trade_screenshots ADD COLUMN mime_type TEXT;
ALTER TABLE trade_screenshots ADD COLUMN file_size INTEGER;

UPDATE trade_screenshots
SET
    file_path = COALESCE(file_path, filename),
    file_name = COALESCE(file_name, filename)
WHERE file_path IS NULL OR file_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_trade_screenshots_file_path
    ON trade_screenshots(file_path);

UPDATE app_metadata SET value = '8', updated_at = datetime('now')
WHERE key = 'schema_version';
