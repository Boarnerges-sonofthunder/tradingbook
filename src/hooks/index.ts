// ============================================================
// Hooks React — Point d'entrée
// ============================================================
// Les hooks React personnalisés sont exportés depuis ce fichier.
// Un hook encapsule une logique stateful réutilisable dans plusieurs
// composants, en s'appuyant sur les services et stores existants.
//
// Règles de nommage et d'organisation :
//   - Chaque hook commence par "use" (convention React)
//   - Un hook par fichier (ex : useTradeFilters.ts, useDatabase.ts)
//   - Les hooks NE contiennent PAS de logique SQLite directe
//     → déléguer aux services (src/services/)
//   - Les hooks NE contiennent PAS d'appels API réseau
//     → cette app est hors ligne
//
// Exemples à créer dans les prochaines étapes :
//   - useTradeFilters   → lit/modifie useFiltersStore
//   - useTheme          → lit/modifie theme dans uiStore + settings SQLite
//   - useNotification   → raccourci pour addNotification de uiStore
//   - useTrades         → charge les trades depuis SQLite avec les filtres actifs
//   - useSettings       → lit/écrit les settings depuis SQLite
// ============================================================

export { useNotification } from "./useNotification";
export { useUserSettings } from "./useUserSettings";
export { useKeyboardShortcuts } from "./useKeyboardShortcuts";
export { useVirtualList } from "./useVirtualList";
export type { UseKeyboardShortcutsOptions } from "./useKeyboardShortcuts";
export {
  useMT5AutoRefresh,
  MT5_REFRESH_INTERVAL_OPTIONS,
} from "./useMT5AutoRefresh";
export type {
  UseMT5AutoRefreshOptions,
  UseMT5AutoRefreshReturn,
} from "./useMT5AutoRefresh";
