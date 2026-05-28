// ============================================================
// CsvValidationTable — Tableau de validation des lignes CSV
// ============================================================
// Affiche chaque ligne du CSV avec son statut de validation,
// ses erreurs et ses avertissements.
//
// Fonctionnalités :
//   - Filtre rapide par statut (toutes / valides / avertissements / invalides)
//   - Affichage des erreurs et avertissements par ligne
//   - Aperçu des valeurs parsées (symbole, sens, date, prix, volume)
//   - Pagination légère (20 lignes par page)
//
// Props :
//   rows — CsvValidatedRow[] produit par validateRows()
//
// Composant purement affichant — pas d'effets de bord.
// ============================================================

import { useState } from "react";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  CsvValidatedRow,
  CsvValidationStatus,
} from "../../../types/csvImport";

// ─── Constantes ────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Props ─────────────────────────────────────────────────

interface CsvValidationTableProps {
  /** Lignes validées produites par validateRows(). */
  rows: CsvValidatedRow[];
}

// ─── Types de filtre ───────────────────────────────────────

type FilterMode = "all" | CsvValidationStatus;

// ─── Helpers ───────────────────────────────────────────────

/** Icône de statut selon le statut de validation. */
function StatusIcon({ status }: { status: CsvValidationStatus }) {
  if (status === "valid")
    return (
      <CheckCircle
        size={14}
        className="csv-val-table__icon csv-val-table__icon--valid"
        aria-label="Valide"
      />
    );
  if (status === "warning")
    return (
      <AlertTriangle
        size={14}
        className="csv-val-table__icon csv-val-table__icon--warning"
        aria-label="Avertissement"
      />
    );
  return (
    <XCircle
      size={14}
      className="csv-val-table__icon csv-val-table__icon--invalid"
      aria-label="Invalide"
    />
  );
}

/** Formate une Date en chaîne courte lisible. */
function formatDateShort(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formate un nombre avec 2 décimales, ou "—" si null. */
function fmt(n: number | null, prefix = ""): string {
  if (n === null) return "—";
  return `${prefix}${n.toFixed(2)}`;
}

// ─── Composant ─────────────────────────────────────────────

export default function CsvValidationTable({ rows }: CsvValidationTableProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [page, setPage] = useState(0);

  // Réinitialise la page quand le filtre change
  function handleFilter(f: FilterMode) {
    setFilter(f);
    setPage(0);
  }

  // Lignes filtrées
  const filtered =
    filter === "all" ? rows : rows.filter((r) => r.status === filter);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Compteurs pour les boutons de filtre
  const counts = {
    all: rows.length,
    valid: rows.filter((r) => r.status === "valid").length,
    warning: rows.filter((r) => r.status === "warning").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
  };

  return (
    <div className="csv-val-table">
      {/* ── Barre de filtres ─────────────────────────────── */}
      <div
        className="csv-val-table__filters"
        role="group"
        aria-label="Filtrer par statut"
      >
        {(
          [
            { mode: "all" as FilterMode, label: "Toutes", count: counts.all },
            {
              mode: "valid" as FilterMode,
              label: "Valides",
              count: counts.valid,
            },
            {
              mode: "warning" as FilterMode,
              label: "Avertissements",
              count: counts.warning,
            },
            {
              mode: "invalid" as FilterMode,
              label: "Invalides",
              count: counts.invalid,
            },
          ] as { mode: FilterMode; label: string; count: number }[]
        ).map(({ mode, label, count }) => (
          <button
            key={mode}
            type="button"
            className={`csv-val-table__filter-btn csv-val-table__filter-btn--${mode}${filter === mode ? " csv-val-table__filter-btn--active" : ""}`}
            onClick={() => handleFilter(mode)}
            aria-pressed={filter === mode}
          >
            {label}
            <span className="csv-val-table__filter-count">{count}</span>
          </button>
        ))}
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="csv-val-table__empty">
          Aucune ligne correspondant au filtre.
        </p>
      ) : (
        <>
          <div
            className="csv-val-table__wrapper"
            role="region"
            aria-label="Tableau de validation"
          >
            <table className="csv-val-table__table">
              <thead>
                <tr>
                  <th
                    className="csv-val-table__th csv-val-table__th--status"
                    scope="col"
                  >
                    Statut
                  </th>
                  <th className="csv-val-table__th" scope="col">
                    Ligne
                  </th>
                  <th className="csv-val-table__th" scope="col">
                    Symbole
                  </th>
                  <th className="csv-val-table__th" scope="col">
                    Sens
                  </th>
                  <th className="csv-val-table__th" scope="col">
                    Ouverture
                  </th>
                  <th
                    className="csv-val-table__th csv-val-table__th--num"
                    scope="col"
                  >
                    Prix entrée
                  </th>
                  <th
                    className="csv-val-table__th csv-val-table__th--num"
                    scope="col"
                  >
                    Volume
                  </th>
                  <th
                    className="csv-val-table__th csv-val-table__th--num"
                    scope="col"
                  >
                    P&amp;L net
                  </th>
                  <th className="csv-val-table__th" scope="col">
                    Erreurs / Avertissements
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const { index, status, errors, warnings, parsed } = row;

                  // Classe CSS selon le statut
                  const rowClass = `csv-val-table__row csv-val-table__row--${status}`;

                  // Couleur du P&L
                  const pnlClass =
                    parsed.netPnl === null
                      ? ""
                      : parsed.netPnl > 0
                        ? "csv-val-table__pnl--positive"
                        : parsed.netPnl < 0
                          ? "csv-val-table__pnl--negative"
                          : "";

                  return (
                    <tr key={index} className={rowClass}>
                      {/* Statut */}
                      <td className="csv-val-table__td csv-val-table__td--status">
                        <StatusIcon status={status} />
                      </td>

                      {/* Numéro de ligne (index + 2 car header = ligne 1) */}
                      <td className="csv-val-table__td csv-val-table__td--num">
                        <span className="csv-val-table__line-num">
                          {index + 2}
                        </span>
                      </td>

                      {/* Symbole */}
                      <td className="csv-val-table__td">
                        {parsed.symbol ? (
                          <code className="csv-val-table__symbol">
                            {parsed.symbol}
                          </code>
                        ) : (
                          <span className="csv-val-table__missing">—</span>
                        )}
                      </td>

                      {/* Sens */}
                      <td className="csv-val-table__td">
                        {parsed.side ? (
                          <span
                            className={`csv-val-table__side csv-val-table__side--${parsed.side}`}
                          >
                            {parsed.side.toUpperCase()}
                          </span>
                        ) : (
                          <span className="csv-val-table__missing">—</span>
                        )}
                      </td>

                      {/* Date d'ouverture */}
                      <td className="csv-val-table__td">
                        <span className="csv-val-table__date">
                          {formatDateShort(parsed.openedAt)}
                        </span>
                      </td>

                      {/* Prix d'entrée */}
                      <td className="csv-val-table__td csv-val-table__td--num">
                        {fmt(parsed.entryPrice)}
                      </td>

                      {/* Volume */}
                      <td className="csv-val-table__td csv-val-table__td--num">
                        {fmt(parsed.volume)}
                      </td>

                      {/* P&L net */}
                      <td
                        className={`csv-val-table__td csv-val-table__td--num ${pnlClass}`}
                      >
                        {fmt(parsed.netPnl)}
                      </td>

                      {/* Messages d'erreur / avertissement */}
                      <td className="csv-val-table__td csv-val-table__td--messages">
                        {errors.length === 0 && warnings.length === 0 ? (
                          <span className="csv-val-table__ok">
                            Aucun problème
                          </span>
                        ) : (
                          <ul className="csv-val-table__messages">
                            {errors.map((e, i) => (
                              <li
                                key={`err-${i}`}
                                className="csv-val-table__message csv-val-table__message--error"
                              >
                                <XCircle size={11} aria-hidden />
                                {e.message}
                              </li>
                            ))}
                            {warnings.map((w, i) => (
                              <li
                                key={`warn-${i}`}
                                className="csv-val-table__message csv-val-table__message--warning"
                              >
                                <AlertTriangle size={11} aria-hidden />
                                {w.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ─────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="csv-val-table__pagination">
              <button
                type="button"
                className="btn-ghost csv-val-table__page-btn"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Page précédente"
              >
                <ChevronLeft size={14} aria-hidden />
              </button>

              <span className="csv-val-table__page-info">
                Page {page + 1} / {totalPages}
                <span className="csv-val-table__page-count">
                  ({filtered.length} lignes)
                </span>
              </span>

              <button
                type="button"
                className="btn-ghost csv-val-table__page-btn"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                aria-label="Page suivante"
              >
                <ChevronRight size={14} aria-hidden />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
