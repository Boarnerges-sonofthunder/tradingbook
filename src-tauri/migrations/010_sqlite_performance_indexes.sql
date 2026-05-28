-- ============================================================
-- Migration 010 : optimisation SQLite ciblée
-- ============================================================
-- Objectif :
--   Ajouter uniquement les index qui améliorent des requêtes
--   réellement fréquentes dans TradingBook sans sur-indexer.
--
-- Zones chaudes couvertes :
--   - journal des trades filtré par source + tri chronologique
--   - filtres / tris sur date de clôture
--   - filtres résultat / analytics basés sur net_pnl des trades fermés
--   - lecture des lignes d'import CSV dans l'ordre d'origine
--
-- Important :
--   - les recherches "contains" de type LIKE '%term%' restent
--     volontairement non indexées ici ; un index B-tree classique
--     ne les accélère pas de façon fiable.
-- ============================================================

-- Filtre fréquent source = mt5/csv/manual + tri principal opened_at DESC.
CREATE INDEX IF NOT EXISTS idx_trades_source_opened_at
    ON trades(source, opened_at DESC, id DESC);

-- Accélère les vues et filtres basés sur la date de clôture.
-- Index partiel : inutile d'indexer les trades encore ouverts.
CREATE INDEX IF NOT EXISTS idx_trades_closed_at_desc
    ON trades(closed_at DESC, id DESC)
    WHERE closed_at IS NOT NULL;

-- Accélère :
--   - result = winning / losing / breakeven
--   - tri par net_pnl
--   - analytics qui ne travaillent que sur des trades fermés
-- Index partiel pour limiter le coût d'écriture.
CREATE INDEX IF NOT EXISTS idx_trades_closed_net_pnl
    ON trades(net_pnl, opened_at DESC, id DESC)
    WHERE status = 'closed' AND net_pnl IS NOT NULL;

-- Les écrans d'import lisent les lignes d'une session dans l'ordre du CSV.
CREATE INDEX IF NOT EXISTS idx_import_rows_import_id_row_index
    ON import_rows(import_id, row_index);

UPDATE app_metadata
SET value = '10', updated_at = datetime('now')
WHERE key = 'schema_version';
