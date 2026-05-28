// ============================================================
// windowService — Façade pour la gestion de la fenêtre Tauri
// ============================================================
// Centralise toutes les interactions avec la fenêtre native
// (minimiser, maximiser, fermer, état).
//
// Utilise l'API Tauri v2 : @tauri-apps/api/window
//   - getCurrentWindow() : instance de la fenêtre courante ("main")
//   - Chaque méthode est async (IPC Tauri → Rust → OS)
//
// USAGE :
//   import { toggleMaximize, closeWindow } from "../services/desktop";
//
// FUTURE TITLEBAR :
//   Quand une titlebar custom sera implémentée, ces fonctions
//   seront directement branchées sur les boutons (-  □  ✕).
//   Aucune modification de cette couche ne sera nécessaire.
//
// PERMISSIONS :
//   Les opérations fenêtre sont couvertes par core:window:default
//   inclus dans core:default (capabilities/default.json).
//   Aucune permission supplémentaire n'est requise.
// ============================================================

import { getCurrentWindow } from "@tauri-apps/api/window";

// ─── Minimiser ────────────────────────────────────────────────

/**
 * Réduit la fenêtre dans la barre des tâches.
 * Idempotent : sans effet si déjà minimisée.
 */
export async function minimizeWindow(): Promise<void> {
  await getCurrentWindow().minimize();
}

// ─── Maximiser / Restaurer ────────────────────────────────────

/**
 * Maximise la fenêtre (plein écran sans chrome OS).
 * Idempotent : sans effet si déjà maximisée.
 */
export async function maximizeWindow(): Promise<void> {
  await getCurrentWindow().maximize();
}

/**
 * Restaure la fenêtre à sa taille flottante précédente.
 * Idempotent : sans effet si pas maximisée.
 */
export async function unmaximizeWindow(): Promise<void> {
  await getCurrentWindow().unmaximize();
}

/**
 * Bascule entre état maximisé et état restauré.
 * Fonction principale pour un bouton □/❐ de titlebar.
 */
export async function toggleMaximize(): Promise<void> {
  await getCurrentWindow().toggleMaximize();
}

/**
 * Retourne true si la fenêtre est actuellement maximisée.
 * Utile pour adapter l'icône d'un bouton titlebar (□ ↔ ❐).
 */
export async function isWindowMaximized(): Promise<boolean> {
  return getCurrentWindow().isMaximized();
}

// ─── Fermer ───────────────────────────────────────────────────

/**
 * Ferme la fenêtre et quitte l'application.
 * Déclenche l'événement "tauri://close-requested" avant fermeture.
 * Pour intercepter (ex: confirmation avant fermeture) :
 *   await getCurrentWindow().onCloseRequested((event) => { event.preventDefault(); … });
 */
export async function closeWindow(): Promise<void> {
  await getCurrentWindow().close();
}

// ─── Informations fenêtre ─────────────────────────────────────

/**
 * Retourne le titre courant affiché dans la barre de titre OS.
 * Utile pour mettre à jour dynamiquement le titre (ex : "TradingBook — Dashboard").
 */
export async function getWindowTitle(): Promise<string> {
  return getCurrentWindow().title();
}

/**
 * Met à jour le titre affiché dans la barre de titre OS.
 * Exemple : setWindowTitle("TradingBook — Analytics")
 */
export async function setWindowTitle(title: string): Promise<void> {
  await getCurrentWindow().setTitle(title);
}
