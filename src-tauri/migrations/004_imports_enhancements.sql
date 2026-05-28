-- ============================================================
-- Migration 004 : Amélioration de la table imports
-- ============================================================
-- Cette migration étend la table `imports` existante pour
-- mieux supporter le pipeline CSV de la Phase 5 :
--
--   1. Nouveaux statuts :
--        - analyzed           : fichier analysé, en attente de confirmation
--        - pending_confirmation : l'utilisateur a cliqué "Confirmer"
--        - imported           : trades écrits dans SQLite avec succès
--        - cancelled          : import abandonné par l'utilisateur
--      (Les anciens statuts pending/in_progress/completed restent valides
--       pour la rétrocompatibilité avec les sessions déjà enregistrées.)
--
--   2. Nouvelles colonnes :
--        - warning_rows    : lignes valides avec avertissements
--        - file_size_bytes : taille en octets du fichier CSV source
--
-- Technique SQLite :
--   SQLite n'autorise pas ALTER TABLE … MODIFY CHECK CONSTRAINT.
--   La modification du CHECK sur `status` requiert une recréation
--   de la table via le motif "table_new → DROP → RENAME".
--   Les données existantes sont copiées intégralement.
--
-- RÈGLE : ne jamais modifier une migration déjà appliquée.
-- Pour toute évolution future, créer la migration 005, etc.
-- ============================================================

-- ─── Étape 1 : créer la nouvelle table avec schéma étendu ───
--
-- Note : PRIMARY KEY seul (sans AUTOINCREMENT) pour la table de transition.
-- Après RENAME, AUTOINCREMENT fonctionnera normalement car SQLite
-- utilise la table sqlite_sequence par nom, et 'imports' y est déjà
-- enregistrée si des données existent.

CREATE TABLE IF NOT EXISTS imports_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Source de l'import
    source          TEXT    NOT NULL CHECK (source IN ('mt5', 'csv', 'manual')),
    filename        TEXT,                       -- Nom du fichier stocké (NULL si MT5 direct)

    -- Broker / compte détectés depuis le fichier CSV
    broker          TEXT,
    account_id      TEXT,

    -- Statut étendu (nouveaux + anciens pour rétrocompatibilité)
    status          TEXT    NOT NULL DEFAULT 'analyzed'
                            CHECK (status IN (
                                -- Nouveaux statuts Phase 5
                                'analyzed',             -- Fichier analysé, pas encore confirmé
                                'pending_confirmation', -- Confirmation en cours (Étape 8)
                                'imported',             -- Trades écrits dans SQLite
                                'cancelled',            -- Import annulé par l'utilisateur
                                -- Anciens statuts (rétrocompatibilité)
                                'pending',
                                'in_progress',
                                'completed',
                                'failed'
                            )),

    -- Compteurs de lignes
    total_rows      INTEGER NOT NULL DEFAULT 0,
    imported_rows   INTEGER NOT NULL DEFAULT 0,  -- Lignes importées (valides + warnings)
    skipped_rows    INTEGER NOT NULL DEFAULT 0,  -- Lignes ignorées (doublons…)
    error_rows      INTEGER NOT NULL DEFAULT 0,  -- Lignes invalides (exclues de l'import)
    warning_rows    INTEGER NOT NULL DEFAULT 0,  -- Lignes valides avec avertissements

    -- Taille du fichier source en octets (NULL si non disponible)
    file_size_bytes INTEGER,

    -- Dates et messages
    imported_at     TEXT,               -- Horodatage de fin d'import réussie
    error_message   TEXT,               -- Message d'erreur si status = 'failed'
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Étape 2 : copier les données existantes ────────────────
--
-- Les nouvelles colonnes reçoivent leurs valeurs par défaut :
--   warning_rows    → 0
--   file_size_bytes → NULL

INSERT OR IGNORE INTO imports_new (
    id, source, filename, broker, account_id, status,
    total_rows, imported_rows, skipped_rows, error_rows,
    warning_rows, file_size_bytes,
    imported_at, error_message, created_at
)
SELECT
    id, source, filename, broker, account_id, status,
    total_rows, imported_rows, skipped_rows, error_rows,
    0,           NULL,
    imported_at, error_message, created_at
FROM imports;

-- ─── Étape 3 : remplacer la table ───────────────────────────
--
-- Note : import_rows référence imports(id) via FK déclarée, mais
-- PRAGMA foreign_keys est OFF dans les migrations sqlx (voir 002_schema.sql).
-- La suppression + renommage est donc sûre.

DROP TABLE imports;
ALTER TABLE imports_new RENAME TO imports;

-- ─── Étape 4 : index (recréés après renommage) ───────────────
--
-- Aucun index spécifique n'existait sur imports dans la migration 002.
-- Aucune recréation nécessaire ici.

-- ─── Mise à jour de la version du schéma ─────────────────────

INSERT OR REPLACE INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '4', datetime('now'));
