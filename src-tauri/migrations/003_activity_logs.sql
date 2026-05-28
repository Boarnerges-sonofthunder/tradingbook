-- ============================================================
-- Migration 003 : Historique des modifications des trades
-- ============================================================
-- Ajoute la table trade_activity_logs pour conserver une trace
-- des actions importantes réalisées sur chaque trade.
--
-- Exemples d'actions enregistrées :
--   trade_created, trade_updated, trade_deleted
--   note_added, note_updated, note_deleted
--   tag_added, tag_removed
--   emotion_added, emotion_removed
--   mistake_added, mistake_removed
--   screenshot_added, screenshot_removed
--   status_changed, strategy_changed
--
-- Règles :
--   • L'historique est local et ne quitte jamais l'appareil.
--   • ON DELETE CASCADE : supprimer un trade supprime ses logs.
--   • Les logs techniques (erreurs Rust/TS) restent dans le fichier
--     .log ; ici on ne stocke que les actions métier lisibles.
--   • Ne jamais stocker de grosses données JSON — juste du texte court.
-- ============================================================

CREATE TABLE IF NOT EXISTS trade_activity_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Référence vers le trade concerné.
    -- ON DELETE CASCADE : si le trade est supprimé, ses logs sont supprimés.
    trade_id    INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,

    -- Identifiant de l'action (ex : "tag_added", "status_changed").
    action      TEXT    NOT NULL,

    -- Champ modifié (utilisé surtout pour trade_updated / status_changed).
    -- NULL si l'action ne concerne pas un champ précis.
    field_name  TEXT,

    -- Ancienne valeur textuelle du champ (avant modification).
    -- NULL si non applicable.
    old_value   TEXT,

    -- Nouvelle valeur textuelle du champ (après modification).
    -- NULL si non applicable.
    new_value   TEXT,

    -- Libellé lisible affiché dans l'historique de l'interface.
    -- Exemples : "Tag ajouté : FOMO", "Statut → closed", "Note modifiée"
    description TEXT    NOT NULL,

    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Index principal : toutes les requêtes filtrent sur trade_id
CREATE INDEX IF NOT EXISTS idx_trade_activity_trade_id
    ON trade_activity_logs (trade_id);

-- Index secondaire pour les tris et fenêtres temporelles
CREATE INDEX IF NOT EXISTS idx_trade_activity_created_at
    ON trade_activity_logs (created_at DESC);
