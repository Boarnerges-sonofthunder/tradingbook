-- ============================================================
-- Migration 018 : capital initial des comptes trading
-- ============================================================
-- Objectif :
--   - ajouter `initial_capital` sur `trading_accounts`
--   - permettre une vraie courbe d'equite basee sur le capital de depart
-- ============================================================

ALTER TABLE trading_accounts
ADD COLUMN initial_capital REAL;

UPDATE app_metadata
SET value = '18', updated_at = datetime('now')
WHERE key = 'schema_version';
