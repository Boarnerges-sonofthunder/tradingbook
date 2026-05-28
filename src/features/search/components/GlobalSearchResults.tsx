// ============================================================
// Composant - GlobalSearchResults
// ============================================================
// Liste groupee des resultats de recherche globale.
// Chaque resultat expose deja son href via globalSearchService.
// ============================================================

import { Link } from "react-router-dom";
import { FileText, Hash, Import, NotebookText, Search, Tag } from "lucide-react";
import type { GlobalSearchGroup } from "../../../types";

interface GlobalSearchResultsProps {
  groups: GlobalSearchGroup[];
  query: string;
  loading: boolean;
  hasSearched: boolean;
  onResultClick: () => void;
}

function categoryIcon(category: GlobalSearchGroup["category"]) {
  switch (category) {
    case "trades":
      return <Search size={13} aria-hidden />;
    case "notes":
      return <NotebookText size={13} aria-hidden />;
    case "tags":
      return <Tag size={13} aria-hidden />;
    case "strategies":
      return <Hash size={13} aria-hidden />;
    case "mistakes":
      return <FileText size={13} aria-hidden />;
    case "emotions":
      return <FileText size={13} aria-hidden />;
    case "imports":
      return <Import size={13} aria-hidden />;
  }
}

export default function GlobalSearchResults({
  groups,
  query,
  loading,
  hasSearched,
  onResultClick,
}: GlobalSearchResultsProps) {
  if (query.trim().length < 2) {
    return (
      <div className="global-search-results global-search-results--empty">
        Tapez au moins 2 caractères pour rechercher.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="global-search-results global-search-results--empty">
        Recherche en cours…
      </div>
    );
  }

  if (hasSearched && groups.length === 0) {
    return (
      <div className="global-search-results global-search-results--empty">
        Aucun résultat trouvé.
      </div>
    );
  }

  return (
    <div className="global-search-results" role="listbox">
      {groups.map((group) => (
        <section key={group.category} className="global-search-results__group">
          <div className="global-search-results__heading">
            {categoryIcon(group.category)}
            <span>{group.label}</span>
            <strong>{group.results.length}</strong>
          </div>

          <div className="global-search-results__items">
            {group.results.map((result) => (
              <Link
                key={result.id}
                to={result.href}
                className="global-search-results__item"
                onClick={onResultClick}
                role="option"
              >
                <span className="global-search-results__title">
                  {result.title}
                </span>
                {result.subtitle && (
                  <span className="global-search-results__subtitle">
                    {result.subtitle}
                  </span>
                )}
                {result.detail && (
                  <span className="global-search-results__detail">
                    {result.detail}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
