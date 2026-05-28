// ============================================================
// Raccourcis clavier — Configuration centralisée
// ============================================================
// Toutes les combinaisons de touches de l'application sont
// déclarées ici. C'est LE seul endroit à modifier pour :
//   - changer une combinaison (ex : Ctrl+N → Alt+T)
//   - activer un raccourci préparé (enabled: false → true)
//   - ajouter un nouveau raccourci
//   - désactiver temporairement un raccourci
//
// ── Architecture ──────────────────────────────────────────
//
//   shortcuts.ts          ← ici : définition des combinaisons
//       ↓
//   useKeyboardShortcuts  ← hook : écoute le DOM, dispatch
//       ↓
//   Composant / Page      ← handler : logique métier
//
// Le hook ne connaît PAS les routes ni les services.
// La logique métier reste dans les composants.
//
// ── Ajouter un raccourci ──────────────────────────────────
//
//   1. Ajouter l'identifiant dans types/shortcut.ts → ShortcutAction
//   2. Ajouter l'entrée dans SHORTCUTS ci-dessous
//   3. Passer le callback dans useKeyboardShortcuts() depuis le
//      composant qui en a besoin
//
// ── Règles de priorité ────────────────────────────────────
//
//   - Les raccourcis NE se déclenchent PAS si le focus est
//     dans un <input>, <textarea> ou [contenteditable].
//     (géré par le hook)
//   - Échap est l'exception : il se déclenche toujours
//     (pour fermer les modales actives).
//
// ── Conflits connus ───────────────────────────────────────
//
//   Ctrl+S est intercepté par le navigateur/WebView sur
//   certains systèmes. Tauri bloque ce comportement par défaut
//   en contexte desktop — vérifier si nécessaire.
//
// ── Raccourcis désactivés (enabled: false) ────────────────
//
//   Ces raccourcis sont déclarés pour réserver la combinaison
//   et documenter l'intention, mais N'AURONT AUCUN EFFET tant
//   que enabled reste false ou qu'aucun handler n'est passé.
//   Ils seront activés dans les prochaines phases.
// ============================================================

import type { ShortcutDefinition } from "../types/shortcut";

// ─── Table de définition des raccourcis ───────────────────

/**
 * Tous les raccourcis de l'application.
 *
 * Chaque entrée documente :
 *   - la combinaison de touches (clé physique + modificateurs)
 *   - un libellé court affiché dans l'aide
 *   - le groupe fonctionnel
 *   - l'état d'activation (enabled)
 *
 * Les raccourcis `enabled: false` sont préparés mais inactifs.
 */
export const SHORTCUTS: ShortcutDefinition[] = [
  // ── Navigation ──────────────────────────────────────────

  {
    action: "NAV_DASHBOARD",
    key: { key: "1", alt: true },
    label: "Tableau de bord",
    description: "Aller au tableau de bord principal",
    group: "navigation",
    enabled: true,
  },
  {
    action: "NAV_TRADES",
    key: { key: "2", alt: true },
    label: "Journal des trades",
    description: "Aller au journal des trades",
    group: "navigation",
    enabled: true,
  },
  {
    action: "NAV_ANALYTICS",
    key: { key: "3", alt: true },
    label: "Analytics",
    description: "Aller à la page d'analytics",
    group: "navigation",
    enabled: true,
  },
  {
    action: "NAV_CALENDAR",
    key: { key: "4", alt: true },
    label: "Calendrier",
    description: "Aller au calendrier des trades",
    group: "navigation",
    enabled: true,
  },
  {
    action: "NAV_STRATEGIES",
    key: { key: "5", alt: true },
    label: "Stratégies",
    description: "Aller à la gestion des stratégies",
    group: "navigation",
    enabled: true,
  },
  {
    action: "NAV_SETTINGS",
    key: { key: ",", ctrl: true },
    label: "Paramètres",
    description: "Ouvrir les paramètres de l'application",
    group: "navigation",
    enabled: true,
  },

  // ── Trades ──────────────────────────────────────────────

  {
    action: "TRADE_NEW",
    key: { key: "n", ctrl: true },
    label: "Nouveau trade",
    description: "Créer un nouveau trade",
    group: "trade",
    enabled: true,
  },

  // ── Données ─────────────────────────────────────────────

  {
    action: "DATA_IMPORT",
    key: { key: "i", ctrl: true },
    label: "Importer CSV",
    description: "Ouvrir l'assistant d'import de données",
    group: "data",
    // Activé mais le handler reste à implémenter dans ImportsPage
    enabled: true,
  },
  {
    action: "DATA_BACKUP",
    key: { key: "b", ctrl: true },
    label: "Créer un backup",
    description: "Déclencher une sauvegarde manuelle",
    group: "data",
    // Activé mais le handler reste à implémenter dans BackupsPage
    enabled: true,
  },
  {
    action: "DATA_MT5_SYNC",
    key: { key: "r", ctrl: true },
    label: "Sync MT5",
    description: "Lancer la synchronisation MT5",
    group: "data",
    enabled: true,
  },

  // ── Global ──────────────────────────────────────────────

  {
    action: "OPEN_SEARCH",
    key: { key: "f", ctrl: true },
    label: "Rechercher",
    description: "Ouvrir la barre de recherche globale",
    group: "global",
    // Préparé — en attente du composant SearchBar (phase ultérieure)
    enabled: false,
  },
  {
    action: "CLOSE_MODAL",
    key: { key: "Escape" },
    label: "Fermer / Annuler",
    description: "Fermer la modale active ou annuler l'action en cours",
    group: "global",
    // Escape déclenche toujours — handler fourni par chaque modale
    enabled: true,
  },
];

// ─── Accès rapide par action ───────────────────────────────

/**
 * Map indexée par action pour accéder à une définition en O(1).
 *
 * Utilisation :
 *   SHORTCUT_MAP["TRADE_NEW"]  → { action, key, label, … }
 */
export const SHORTCUT_MAP = Object.fromEntries(
  SHORTCUTS.map((s) => [s.action, s]),
) as Record<(typeof SHORTCUTS)[number]["action"], ShortcutDefinition>;

// ─── Utilitaire : label de la touche pour l'affichage ─────

/**
 * Formate la combinaison de touches en chaîne lisible.
 *
 * Exemples :
 *   formatShortcutKey({ key: "n", ctrl: true })   → "Ctrl + N"
 *   formatShortcutKey({ key: "Escape" })           → "Échap"
 *   formatShortcutKey({ key: ",", ctrl: true })    → "Ctrl + ,"
 *   formatShortcutKey({ key: "1", alt: true })     → "Alt + 1"
 */
export function formatShortcutKey(
  shortcutKey: ShortcutDefinition["key"],
): string {
  const parts: string[] = [];

  if (shortcutKey.ctrl)  parts.push("Ctrl");
  if (shortcutKey.alt)   parts.push("Alt");
  if (shortcutKey.shift) parts.push("Shift");
  if (shortcutKey.meta)  parts.push("Meta");

  // Noms lisibles pour les touches spéciales
  const KEY_LABELS: Record<string, string> = {
    Escape:     "Échap",
    Enter:      "Entrée",
    Tab:        "Tab",
    Backspace:  "⌫",
    Delete:     "Suppr",
    ArrowUp:    "↑",
    ArrowDown:  "↓",
    ArrowLeft:  "←",
    ArrowRight: "→",
  };

  const keyLabel = KEY_LABELS[shortcutKey.key] ?? shortcutKey.key.toUpperCase();
  parts.push(keyLabel);

  return parts.join(" + ");
}
