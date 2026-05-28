// ============================================================
// CsvValidationSummary — Résumé de la validation CSV
// ============================================================
// Affiche une synthèse des lignes valides / invalides / avertissements
// après la validation du fichier CSV.
//
// Props :
//   summary — CsvValidationSummary produit par validateRows()
//
// Composant purement affichant — pas d'effets de bord.
// ============================================================

import { CheckCircle, XCircle, AlertTriangle, FileText } from "lucide-react";
import type { CsvValidationSummary } from "../../../types/csvImport";

// ─── Props ─────────────────────────────────────────────────

interface CsvValidationSummaryProps {
  /** Résumé produit par validateRows(). */
  summary: CsvValidationSummary;
}

// ─── Composant ─────────────────────────────────────────────

export default function CsvValidationSummaryPanel({
  summary,
}: CsvValidationSummaryProps) {
  const {
    totalRows,
    validCount,
    warningCount,
    invalidCount,
    importableCount,
    topErrors,
  } = summary;

  return (
    <div className="csv-val-summary">
      {/* ── Compteurs ────────────────────────────────────── */}
      <div className="csv-val-summary__counters">
        {/* Total */}
        <div className="csv-val-summary__counter csv-val-summary__counter--total">
          <FileText size={16} aria-hidden />
          <span className="csv-val-summary__count">{totalRows}</span>
          <span className="csv-val-summary__label">Lignes totales</span>
        </div>

        {/* Valides */}
        <div className="csv-val-summary__counter csv-val-summary__counter--valid">
          <CheckCircle size={16} aria-hidden />
          <span className="csv-val-summary__count">{validCount}</span>
          <span className="csv-val-summary__label">
            {validCount === 1 ? "Valide" : "Valides"}
          </span>
        </div>

        {/* Avertissements */}
        <div className="csv-val-summary__counter csv-val-summary__counter--warning">
          <AlertTriangle size={16} aria-hidden />
          <span className="csv-val-summary__count">{warningCount}</span>
          <span className="csv-val-summary__label">
            {warningCount === 1 ? "Avertissement" : "Avertissements"}
          </span>
        </div>

        {/* Invalides */}
        <div className="csv-val-summary__counter csv-val-summary__counter--invalid">
          <XCircle size={16} aria-hidden />
          <span className="csv-val-summary__count">{invalidCount}</span>
          <span className="csv-val-summary__label">
            {invalidCount === 1 ? "Invalide" : "Invalides"}
          </span>
        </div>
      </div>

      {/* ── Barre de progression ─────────────────────────── */}
      {totalRows > 0 && (
        <div
          className="csv-val-summary__bar"
          role="img"
          aria-label={`${importableCount} lignes importables sur ${totalRows}`}
        >
          {validCount > 0 && (
            <div
              className="csv-val-summary__bar-segment csv-val-summary__bar-segment--valid"
              style={{ width: `${(validCount / totalRows) * 100}%` }}
            />
          )}
          {warningCount > 0 && (
            <div
              className="csv-val-summary__bar-segment csv-val-summary__bar-segment--warning"
              style={{ width: `${(warningCount / totalRows) * 100}%` }}
            />
          )}
          {invalidCount > 0 && (
            <div
              className="csv-val-summary__bar-segment csv-val-summary__bar-segment--invalid"
              style={{ width: `${(invalidCount / totalRows) * 100}%` }}
            />
          )}
        </div>
      )}

      {/* ── Message importable ───────────────────────────── */}
      <p className="csv-val-summary__importable">
        {invalidCount === 0 ? (
          <>
            <CheckCircle size={13} aria-hidden />
            <strong>{importableCount}</strong>{" "}
            {importableCount === 1
              ? "ligne sera importée"
              : "lignes seront importées"}
          </>
        ) : (
          <>
            <AlertTriangle size={13} aria-hidden />
            <strong>{importableCount}</strong> ligne(s) importable(s) sur{" "}
            {totalRows} —{" "}
            <strong className="csv-val-summary__invalid-count">
              {invalidCount}
            </strong>{" "}
            ligne(s) seront ignorées
          </>
        )}
      </p>

      {/* ── Erreurs fréquentes ───────────────────────────── */}
      {topErrors.length > 0 && (
        <div className="csv-val-summary__top-errors">
          <span className="csv-val-summary__top-errors-label">
            Erreurs fréquentes :
          </span>
          <ul className="csv-val-summary__top-errors-list">
            {topErrors.map(({ message, count }) => (
              <li key={message} className="csv-val-summary__top-error-item">
                <XCircle size={12} aria-hidden />
                <span>{message}</span>
                {count > 1 && (
                  <span className="csv-val-summary__top-error-count">
                    ×{count}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
