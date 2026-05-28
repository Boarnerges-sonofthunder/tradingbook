-- ============================================================
-- Migration 011 : index composite filtre + tri du journal
-- ============================================================
-- Objectif :
--   Supprimer tri temporaire (TEMP B-TREE) sur requête fréquente
--   du journal des trades : filtres statut/symbole/sens + tri date.
--
-- Requête ciblée (forme simplifiée) :
--   SELECT ...
--   FROM trades
--   WHERE status = ? AND symbol = ? AND side = ?
--     AND opened_at BETWEEN ? AND ?
--   ORDER BY opened_at DESC, id DESC
--   LIMIT ...
--
-- Cet index respecte pattern d'accès sans modifier logique métier.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_trades_status_symbol_side_opened_at
    ON trades(status, symbol, side, opened_at DESC, id DESC);

UPDATE app_metadata
SET value = '11', updated_at = datetime('now')
WHERE key = 'schema_version';
