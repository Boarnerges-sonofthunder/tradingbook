// ============================================================
// Service - Recherche globale
// ============================================================
// Point d'entree applicatif pour la recherche. Il orchestre le repository
// dedie et prepare des resultats groupables par l'UI.
// ============================================================

import { searchGlobalRows } from "../../repositories";
import { ROUTES } from "../../constants/routes";
import type {
  GlobalSearchCategory,
  GlobalSearchGroup,
  GlobalSearchResponse,
  GlobalSearchResult,
} from "../../types";
import type { GlobalSearchRow } from "../../repositories";

const CATEGORY_LABELS: Record<GlobalSearchCategory, string> = {
  trades: "Trades",
  notes: "Notes",
  tags: "Tags",
  strategies: "Strategies",
  mistakes: "Erreurs",
  emotions: "Emotions",
  imports: "Imports",
};

const CATEGORY_ORDER: GlobalSearchCategory[] = [
  "trades",
  "notes",
  "tags",
  "strategies",
  "mistakes",
  "emotions",
  "imports",
];

function tradeHref(tradeId: number): string {
  return ROUTES.TRADE_DETAILS.replace(":id", String(tradeId));
}

function hrefFor(row: GlobalSearchRow): string {
  if (row.tradeId !== null) return tradeHref(row.tradeId);
  if (row.category === "strategies") return ROUTES.STRATEGIES;
  if (row.category === "imports") return ROUTES.IMPORTS;
  return ROUTES.TRADES;
}

function cleanSnippet(value: string | null): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

function mapRow(row: GlobalSearchRow): GlobalSearchResult {
  const ownerId = row.tradeId ?? row.entityId;
  return {
    id: `${row.category}-${row.entityId}-${ownerId}`,
    category: row.category,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    detail: cleanSnippet(row.detail),
    href: hrefFor(row),
  };
}

export async function globalSearch(
  rawQuery: string,
): Promise<GlobalSearchResponse> {
  const query = rawQuery.trim();
  if (query.length < 2) {
    return { query, total: 0, groups: [] };
  }

  const rowsByCategory = await searchGlobalRows(query);
  const groups: GlobalSearchGroup[] = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    results: rowsByCategory[category].map(mapRow),
  })).filter((group) => group.results.length > 0);

  const total = groups.reduce((sum, group) => sum + group.results.length, 0);
  return { query, total, groups };
}
