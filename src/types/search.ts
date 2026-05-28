// ============================================================
// Types - Recherche globale
// ============================================================
// Resultats applicatifs produits par globalSearchService.
// Les composants UI consomment ces objets sans connaitre SQLite.
// ============================================================

export type GlobalSearchCategory =
  | "trades"
  | "notes"
  | "tags"
  | "strategies"
  | "mistakes"
  | "emotions"
  | "imports";

export interface GlobalSearchResult {
  id: string;
  category: GlobalSearchCategory;
  title: string;
  subtitle?: string;
  detail?: string;
  href: string;
}

export interface GlobalSearchGroup {
  category: GlobalSearchCategory;
  label: string;
  results: GlobalSearchResult[];
}

export interface GlobalSearchResponse {
  query: string;
  total: number;
  groups: GlobalSearchGroup[];
}
