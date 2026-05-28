// ============================================================
// Types — Historique d'activité des trades
// ============================================================
// Correspond à la table SQLite : trade_activity_logs
// ============================================================

// ------------------------------------------------------------
// Actions enregistrées dans l'historique
// ------------------------------------------------------------

/**
 * Liste exhaustive des actions pouvant être enregistrées.
 * Utilisée comme type discriminant pour les icônes et couleurs de l'UI.
 */
export type TradeActivityAction =
  // ── Cycle de vie du trade ──────────────────────
  | "trade_created"
  | "trade_updated"
  | "trade_deleted"
  | "status_changed"
  | "strategy_changed"
  // ── Notes ──────────────────────────────────────
  | "note_added"
  | "note_updated"
  | "note_deleted"
  // ── Tags ───────────────────────────────────────
  | "tag_added"
  | "tag_removed"
  // ── Émotions ───────────────────────────────────
  | "emotion_added"
  | "emotion_removed"
  // ── Erreurs ────────────────────────────────────
  | "mistake_added"
  | "mistake_removed"
  // ── Captures d'écran ───────────────────────────
  | "screenshot_added"
  | "screenshot_removed";

// ------------------------------------------------------------
// Entité
// ------------------------------------------------------------

/** Une entrée dans l'historique — table `trade_activity_logs`. */
export interface TradeActivityLog {
  id: number;
  tradeId: number;
  /** Identifiant de l'action (ex : "tag_added"). */
  action: TradeActivityAction;
  /** Champ modifié (uniquement pour trade_updated / status_changed). */
  fieldName: string | null;
  /** Ancienne valeur textuelle (avant modification). */
  oldValue: string | null;
  /** Nouvelle valeur textuelle (après modification). */
  newValue: string | null;
  /** Libellé lisible affiché dans l'interface. */
  description: string;
  createdAt: string;
}

// ------------------------------------------------------------
// Input de création
// ------------------------------------------------------------

/**
 * Paramètres pour enregistrer une nouvelle entrée d'historique.
 * Le service `logActivity()` accepte ce type.
 */
export interface LogActivityInput {
  tradeId: number;
  action: TradeActivityAction;
  /** Optionnel : champ modifié (ex : "status", "exit_price"). */
  fieldName?: string | null;
  /** Optionnel : ancienne valeur textuelle. */
  oldValue?: string | null;
  /** Optionnel : nouvelle valeur textuelle. */
  newValue?: string | null;
  /** Libellé lisible pour l'UI — requis. */
  description: string;
}
