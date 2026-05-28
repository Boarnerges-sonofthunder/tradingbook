// ============================================================
// src/constants/theme.ts — Constantes et utilitaires de thème
// ============================================================
// Centralise la gestion des thèmes de l'application.
//
// Le thème est appliqué via l'attribut `data-theme` sur <html>.
// Les sélecteurs CSS [data-theme="dark"] et [data-theme="light"]
// dans src/styles/theme.css lisent cet attribut et substituent
// les tokens couleur appropriés.
//
// ── Thèmes disponibles ────────────────────────────────────
//   "dark"  : thème sombre (défaut, adapté au trading)
//   "light" : thème clair  (valeurs préparées, non finalisé)
//
// ── Persistance future (Phase 4 — Settings) ──────────────
// Quand la page Paramètres sera implémentée :
//
//   1. Charger la préférence au démarrage (App.tsx useEffect) :
//        const saved = await settingsService.getSetting(THEME_SETTINGS_KEY);
//        applyTheme((saved as Theme) ?? DEFAULT_THEME);
//
//   2. Sauvegarder quand l'utilisateur change de thème :
//        await settingsService.upsertSetting(THEME_SETTINGS_KEY, theme);
//        applyTheme(theme);
// ============================================================

// ─── Types ─────────────────────────────────────────────────

/** Thèmes supportés par l'application. */
export type Theme = "dark" | "light";

// ─── Constantes ────────────────────────────────────────────

/** Objet lookup — évite les chaînes littérales dans le code. */
export const THEMES = {
  DARK: "dark" as Theme,
  LIGHT: "light" as Theme,
} as const;

/** Thème appliqué au premier lancement, avant toute préférence sauvegardée. */
export const DEFAULT_THEME: Theme = THEMES.DARK;

/** Clé utilisée dans la table SQLite `settings` pour persister le thème. */
export const THEME_SETTINGS_KEY = "app.theme" as const;

// ─── Utilitaires DOM ───────────────────────────────────────

/**
 * Applique un thème en positionnant `data-theme` sur `<html>`.
 *
 * L'attribut est lu par les sélecteurs CSS dans theme.css :
 *   [data-theme="dark"]  → tokens couleur sombre
 *   [data-theme="light"] → tokens couleur clair
 *
 * Appeler cette fonction :
 *   - Au démarrage dans App.tsx avec la préférence sauvegardée.
 *   - Depuis la page Paramètres quand l'utilisateur change de thème.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Lit le thème actuellement actif depuis le DOM.
 * Retourne `DEFAULT_THEME` si aucun attribut n'est encore positionné.
 */
export function getCurrentTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  if (value === "dark" || value === "light") return value;
  return DEFAULT_THEME;
}
