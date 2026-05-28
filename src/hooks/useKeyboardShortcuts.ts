// ============================================================
// useKeyboardShortcuts — Hook de raccourcis clavier
// ============================================================
// Enregistre un listener keydown global et dispatche les
// événements clavier vers les callbacks fournis par le composant.
//
// ── Fonctionnement ────────────────────────────────────────
//
//   1. Le hook lit la liste des raccourcis depuis SHORTCUTS
//      (constants/shortcuts.ts).
//   2. À chaque keydown, il cherche un raccourci dont la
//      combinaison correspond à la touche pressée ET dont
//      l'action est présente dans `handlers`.
//   3. Si trouvé ET enabled, il appelle le handler correspondant
//      et appelle event.preventDefault() pour éviter les
//      comportements par défaut du navigateur (ex : Ctrl+S).
//
// ── Règle de focus ────────────────────────────────────────
//
//   Les raccourcis NE se déclenchent PAS si le focus est
//   dans un champ éditable :
//     <input>, <textarea>, <select>, [contenteditable]
//
//   EXCEPTION : Escape se déclenche toujours (fermeture de modale).
//   Pour ignorer la règle sur un raccourci spécifique, passer
//   l'option `ignoreInputs: false` dans le 3e paramètre.
//
// ── Utilisation basique ───────────────────────────────────
//
//   // Dans un composant ou une page :
//   import { useKeyboardShortcuts } from "../hooks";
//   import { ROUTES } from "../constants";
//   import { useNavigate } from "react-router-dom";
//
//   function AppLayout() {
//     const navigate = useNavigate();
//     useKeyboardShortcuts({
//       TRADE_NEW:    () => navigate(ROUTES.TRADE_NEW),
//       NAV_SETTINGS: () => navigate(ROUTES.SETTINGS),
//     });
//   }
//
// ── Utilisation avec CLOSE_MODAL ─────────────────────────
//
//   // Dans une modale :
//   useKeyboardShortcuts({ CLOSE_MODAL: onClose });
//
//   Plusieurs composants peuvent enregistrer CLOSE_MODAL
//   simultanément. Tous seront appelés à l'Échap (bubbling).
//   Utiliser une condition dans le handler si nécessaire.
//
// ── Options ──────────────────────────────────────────────
//
//   useKeyboardShortcuts(handlers, { enabled, ignoreInputs })
//
//   - enabled (boolean, défaut: true) : désactive l'écoute si false.
//     Pratique pour suspendre les raccourcis pendant un état
//     particulier (ex : upload en cours).
//   - ignoreInputs (boolean, défaut: true) : passe la règle de focus.
//     Mettre false uniquement si vous voulez réagir même dans
//     les champs de saisie.
//
// ── Lifecycle ────────────────────────────────────────────
//
//   Le listener est ajouté au montage et retiré au démontage.
//   Il est également recréé si handlers ou options changent
//   (useEffect avec dépendances stables via useRef).
// ============================================================

import { useEffect, useRef } from "react";
import { SHORTCUTS } from "../constants/shortcuts";
import type { ShortcutHandlerMap, ShortcutKey } from "../types/shortcut";

// ─── Types ─────────────────────────────────────────────────

export interface UseKeyboardShortcutsOptions {
  /**
   * Active ou désactive l'écoute des raccourcis.
   * Mettre `false` pour suspendre sans démonter le composant.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   * Si `true`, les raccourcis sont ignorés quand le focus est
   * dans un champ de saisie (<input>, <textarea>, etc.).
   * Exception : Escape se déclenche toujours.
   *
   * @default true
   */
  ignoreInputs?: boolean;
}

// ─── Utilitaire : vérifier si une touche correspond ────────

/**
 * Retourne true si l'événement clavier correspond à la combinaison.
 *
 * `key` est comparé en minuscule pour normaliser les lettres.
 * Les touches spéciales (Escape, Enter…) sont comparées telles quelles.
 */
function matchesShortcut(event: KeyboardEvent, shortcutKey: ShortcutKey): boolean {
  const eventKey = event.key.length === 1
    ? event.key.toLowerCase()
    : event.key; // Conserver la casse pour Escape, Enter, etc.

  const expectedKey = shortcutKey.key.length === 1
    ? shortcutKey.key.toLowerCase()
    : shortcutKey.key;

  if (eventKey !== expectedKey) return false;
  if (!!shortcutKey.ctrl  !== event.ctrlKey)  return false;
  if (!!shortcutKey.alt   !== event.altKey)   return false;
  if (!!shortcutKey.shift !== event.shiftKey) return false;
  if (!!shortcutKey.meta  !== event.metaKey)  return false;

  return true;
}

// ─── Utilitaire : détecter le focus dans un champ éditable ─

/**
 * Retourne true si l'élément actif est un champ de saisie
 * (input, textarea, select ou contenteditable).
 * Utilisé pour éviter d'intercepter les raccourcis pendant la saisie.
 */
function isFocusInInput(): boolean {
  const el = document.activeElement;
  if (!el) return false;

  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;

  return false;
}

// ─── Hook ──────────────────────────────────────────────────

/**
 * Enregistre des raccourcis clavier globaux pour la durée de vie
 * du composant appelant.
 *
 * @param handlers - Map des actions → callbacks à exécuter.
 * @param options  - Options de comportement (enabled, ignoreInputs).
 */
export function useKeyboardShortcuts(
  handlers: ShortcutHandlerMap,
  options: UseKeyboardShortcutsOptions = {},
): void {
  const { enabled = true, ignoreInputs = true } = options;

  // Stocker handlers dans un ref pour éviter de recréer le listener
  // à chaque rendu (les fonctions arrow recréées à chaque render
  // déstabiliseraient les dépendances de useEffect).
  const handlersRef = useRef<ShortcutHandlerMap>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent): void {
      // Trouver la définition du raccourci correspondant
      const definition = SHORTCUTS.find(
        (s) => s.enabled !== false && matchesShortcut(event, s.key),
      );

      if (!definition) return;

      const handler = handlersRef.current[definition.action];
      if (!handler) return;

      // Règle de focus : ignorer si le curseur est dans un champ,
      // sauf pour Escape (toujours actif pour fermer les modales).
      const isEscape = definition.key.key === "Escape";
      if (ignoreInputs && isFocusInInput() && !isEscape) return;

      // Bloquer le comportement par défaut du navigateur/WebView
      // (ex : Ctrl+S → save page, Ctrl+N → nouvelle fenêtre).
      event.preventDefault();

      handler(event);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, ignoreInputs]);
  // Note : handlersRef est intentionnellement absent des dépendances
  // pour éviter de recréer le listener à chaque render. Le ref est
  // toujours à jour grâce à handlersRef.current = handlers ci-dessus.
}
