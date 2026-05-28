// ============================================================
// Types — Raccourcis clavier
// ============================================================
// Définit les types utilisés par le système de raccourcis.
//
// ── ShortcutKey ───────────────────────────────────────────
// Décrit la combinaison de touches d'un raccourci.
// `key` correspond à event.key (ex : "n", "s", ",", "Escape").
// Les modificateurs sont tous optionnels et valent false par défaut.
//
// ── ShortcutAction ────────────────────────────────────────
// Identifiant sémantique unique de chaque raccourci.
// Utiliser une union littérale permet à TypeScript de valider
// les identifiants partout (constants/shortcuts.ts, hooks, tests).
//
// ── ShortcutDefinition ────────────────────────────────────
// Entrée complète d'un raccourci : clé de déclenchement,
// libellé lisible (ex : affiché dans une aide), groupe,
// et indicateur d'activation à l'enregistrement.
//
// ── ShortcutHandler ───────────────────────────────────────
// Signature du callback à fournir à useKeyboardShortcuts.
// Reçoit l'événement clavier d'origine pour les cas avancés.
//
// ── ShortcutGroup ─────────────────────────────────────────
// Catégories pour organiser les raccourcis dans une éventuelle
// page d'aide ou une palette de commandes.
//
// ── Utilisation dans un composant ────────────────────────
//   import { useKeyboardShortcuts } from "../hooks";
//   useKeyboardShortcuts({
//     TRADE_NEW:   () => navigate(ROUTES.TRADE_NEW),
//     OPEN_SEARCH: () => setSearchOpen(true),
//     SETTINGS:    () => navigate(ROUTES.SETTINGS),
//   });
// ============================================================

// ─── Groupes de raccourcis ─────────────────────────────────

/**
 * Catégories pour organiser les raccourcis dans une aide contextuelle.
 * Chaque ShortcutDefinition appartient à un groupe.
 */
export type ShortcutGroup =
  | "navigation"  // Déplacement entre les pages
  | "trade"       // Actions sur les trades
  | "data"        // Import / Export / Backup
  | "global";     // Actions transverses (recherche, modale, etc.)

// ─── Identifiants des raccourcis ──────────────────────────

/**
 * Identifiant sémantique unique de chaque raccourci.
 *
 * Convention : DOMAINE_ACTION en SCREAMING_SNAKE_CASE.
 * Préfixer par le domaine évite les collisions et facilite
 * la lecture dans les logs de debug.
 *
 * Ajouter un identifiant ici pour le rendre disponible
 * dans constants/shortcuts.ts et useKeyboardShortcuts.
 */
export type ShortcutAction =
  // Navigation entre les pages
  | "NAV_DASHBOARD"
  | "NAV_TRADES"
  | "NAV_ANALYTICS"
  | "NAV_CALENDAR"
  | "NAV_STRATEGIES"
  | "NAV_SETTINGS"

  // Actions sur les trades
  | "TRADE_NEW"

  // Données
  | "DATA_IMPORT"
  | "DATA_BACKUP"
  | "DATA_MT5_SYNC"

  // Global
  | "OPEN_SEARCH"
  | "CLOSE_MODAL";

// ─── Combinaison de touches ────────────────────────────────

/**
 * Description d'une combinaison de touches.
 *
 * `key` doit correspondre à `event.key` (sensible à la casse pour
 * les caractères spéciaux, insensible pour les lettres).
 *
 * Exemples valides :
 *   { key: "n",      ctrl: true }          → Ctrl + N
 *   { key: "Escape"               }        → Échap
 *   { key: ",",      ctrl: true }          → Ctrl + ,
 *   { key: "s",      ctrl: true }          → Ctrl + S
 */
export interface ShortcutKey {
  /** Valeur de event.key. Lettres en minuscule par convention. */
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** Meta = Cmd sur macOS, Win sur Windows. Rarement utilisé. */
  meta?: boolean;
}

// ─── Définition complète d'un raccourci ───────────────────

/**
 * Définition complète d'un raccourci clavier.
 *
 * Utilisé dans constants/shortcuts.ts pour déclarer tous les
 * raccourcis disponibles et leurs métadonnées.
 */
export interface ShortcutDefinition {
  /** Identifiant sémantique du raccourci. */
  action: ShortcutAction;

  /** Combinaison de touches qui déclenche le raccourci. */
  key: ShortcutKey;

  /**
   * Libellé court affiché à l'utilisateur (tooltips, aide, palette).
   * Doit être en français, 2–5 mots.
   */
  label: string;

  /**
   * Description optionnelle plus longue pour la page d'aide.
   * Peut décrire le contexte ou les conditions d'activation.
   */
  description?: string;

  /** Groupe d'appartenance pour l'organisation dans l'aide. */
  group: ShortcutGroup;

  /**
   * Activer ce raccourci à l'enregistrement dans le hook.
   * Mettre `false` pour les raccourcis en préparation (pas encore
   * implémentés) — ils sont déclarés mais n'ont aucun effet.
   *
   * @default true
   */
  enabled?: boolean;
}

// ─── Callbacks des raccourcis ─────────────────────────────

/**
 * Callback à exécuter quand un raccourci est déclenché.
 * Reçoit l'événement d'origine pour les cas avancés
 * (ex : vérifier event.target avant d'agir).
 */
export type ShortcutHandler = (event: KeyboardEvent) => void;

/**
 * Map action → callback fournie à useKeyboardShortcuts.
 *
 * Seules les actions nécessaires dans le composant courant
 * doivent être passées. Les autres sont ignorées.
 *
 * Exemple :
 *   { TRADE_NEW: () => navigate("/trades/new"), CLOSE_MODAL: onClose }
 */
export type ShortcutHandlerMap = Partial<Record<ShortcutAction, ShortcutHandler>>;
