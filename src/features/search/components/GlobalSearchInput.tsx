// ============================================================
// Composant - GlobalSearchInput
// ============================================================
// Champ de recherche global place dans la Topbar.
// Les requetes passent par globalSearchService, jamais directement par SQLite.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { globalSearch } from "../../../services/search";
import type { GlobalSearchGroup } from "../../../types";
import GlobalSearchResults from "./GlobalSearchResults";

export default function GlobalSearchInput() {
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setGroups([]);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const handle = window.setTimeout(() => {
      void globalSearch(trimmed)
        .then((response) => {
          if (cancelled) return;
          setGroups(response.groups);
          setHasSearched(true);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error("[GlobalSearchInput] Recherche globale impossible", error);
          setGroups([]);
          setHasSearched(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  useEffect(() => {
    function handleDocumentPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentPointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentPointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function clearSearch() {
    setQuery("");
    setGroups([]);
    setHasSearched(false);
  }

  return (
    <div className="global-search" ref={rootRef}>
      <div className="global-search__field">
        <Search size={15} aria-hidden />
        <input
          type="search"
          value={query}
          placeholder="Rechercher…"
          aria-label="Recherche globale"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button
            type="button"
            className="global-search__clear"
            onClick={clearSearch}
            aria-label="Effacer la recherche"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <GlobalSearchResults
          groups={groups}
          query={query}
          loading={loading}
          hasSearched={hasSearched}
          onResultClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
