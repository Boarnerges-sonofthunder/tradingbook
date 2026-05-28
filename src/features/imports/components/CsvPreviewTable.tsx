// ============================================================
// CsvPreviewTable — Prévisualisation des données CSV parsées
// ============================================================
// Affiche :
//   - Un résumé (nb colonnes, nb lignes, séparateur détecté)
//   - Les avertissements de parsing si présents
//   - Un tableau scrollable des premières lignes (défaut : 10)
//   - Un bouton "voir tout / réduire" si plus de 10 lignes
//
// Ne modifie aucune donnée. Composant purement présentationnel.
// ============================================================

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { CsvParseResult } from "../../../services/imports/csvParserService";

// ─── Constantes ────────────────────────────────────────────

/** Nombre de lignes affichées par défaut avant l'expansion. */
const DEFAULT_VISIBLE_ROWS = 10;

// ─── Props ─────────────────────────────────────────────────

interface CsvPreviewTableProps {
  result: CsvParseResult;
}

// ─── Composant ─────────────────────────────────────────────

export default function CsvPreviewTable({ result }: CsvPreviewTableProps) {
  const [showAll, setShowAll] = useState(false);

  const visibleRows = showAll
    ? result.rows
    : result.rows.slice(0, DEFAULT_VISIBLE_ROWS);

  const hasMore = result.totalRows > DEFAULT_VISIBLE_ROWS;
  const hiddenCount = result.totalRows - DEFAULT_VISIBLE_ROWS;

  return (
    <div className="csv-preview">
      {/* ── Résumé méta ─────────────────────────────────── */}
      <div className="csv-preview-meta">
        <span className="csv-preview-meta__item">
          <strong>{result.headers.length}</strong>{" "}
          {result.headers.length === 1 ? "colonne" : "colonnes"}
        </span>
        <span className="csv-preview-meta__dot" aria-hidden>
          ·
        </span>
        <span className="csv-preview-meta__item">
          <strong>{result.totalRows}</strong>{" "}
          {result.totalRows === 1 ? "ligne" : "lignes"} de données
        </span>
        <span className="csv-preview-meta__dot" aria-hidden>
          ·
        </span>
        <span className="csv-preview-meta__item">
          Séparateur :{" "}
          <code className="csv-preview-meta__code">
            {result.separator === "," ? "virgule (,)" : "point-virgule (;)"}
          </code>
        </span>
      </div>

      {/* ── Avertissements de parsing ────────────────────── */}
      {result.warnings.length > 0 && (
        <div className="csv-preview-warnings" role="alert">
          <AlertTriangle
            size={14}
            className="csv-preview-warnings__icon"
            aria-hidden
          />
          <ul className="csv-preview-warnings__list">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {result.warnings.length >= 10 && (
              <li className="csv-preview-warnings__more">
                D'autres avertissements ont été omis…
              </li>
            )}
          </ul>
        </div>
      )}

      {/* ── Tableau ─────────────────────────────────────── */}
      {result.totalRows === 0 ? (
        <p className="csv-preview-empty">
          Aucune ligne de données valide après le header.
        </p>
      ) : (
        <>
          <div className="csv-preview-table-wrapper">
            <table className="csv-preview-table">
              <thead>
                <tr>
                  <th className="csv-preview-table__num" aria-label="N°">
                    #
                  </th>
                  {result.headers.map((h, idx) => (
                    <th key={idx} title={h}>
                      {h || <em>(vide)</em>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    <td className="csv-preview-table__num">{rowIdx + 1}</td>
                    {result.headers.map((h, colIdx) => (
                      <td key={colIdx} title={row[h]}>
                        {row[h] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Bouton voir tout / réduire ─────────────── */}
          {hasMore && (
            <button
              className="btn-ghost csv-preview-toggle"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? (
                <>
                  <ChevronUp size={13} aria-hidden />
                  Réduire (afficher les {DEFAULT_VISIBLE_ROWS} premières lignes)
                </>
              ) : (
                <>
                  <ChevronDown size={13} aria-hidden />
                  Voir toutes les lignes ({hiddenCount} de plus)
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
