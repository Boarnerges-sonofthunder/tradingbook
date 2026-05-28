// ============================================================
// CsvImportSummary — Résumé décisionnel avant import
// ============================================================
// Phase 5 Étape 6 — Prévisualisation avant import.
//
// Affiche un résumé orienté "décision" (distinct de
// CsvValidationSummary qui est orienté "diagnostic") :
//   - Lignes totales dans le fichier CSV
//   - Trades importables (valid + warning) → seront créés
//   - Avertissements → importés mais signalés
//   - Invalides → EXCLUS de l'import
//
// Met en avant le nombre de trades effectivement créés
// pour que l'utilisateur sache exactement ce qui va se passer.
//
// Props :
//   summary — CsvValidationSummary produit par validateRows()
//
// Composant purement affichant — pas d'effets de bord.
// Aucun appel SQLite ni I/O.
// ============================================================

import { CheckCircle, XCircle, AlertTriangle, FileText } from "lucide-react";
import type { CsvValidationSummary } from "../../../types/csvImport";

// ─── Props ─────────────────────────────────────────────────

interface Props {
  /** Résumé produit par validateRows(). */
  summary: CsvValidationSummary;
}

// ─── Composant ─────────────────────────────────────────────

export default function CsvImportSummary({ summary }: Props) {
  const { totalRows, importableCount, warningCount, invalidCount } = summary;

  return (
    <div className="csv-import-summary">
      {/* ── Grille de compteurs ─────────────────────────── */}
      <div className="csv-import-summary__grid">
        {/* Total des lignes dans le fichier */}
        <div className="csv-import-summary__card csv-import-summary__card--total">
          <FileText size={18} aria-hidden />
          <span className="csv-import-summary__count">{totalRows}</span>
          <span className="csv-import-summary__label">Lignes totales</span>
        </div>

        {/* Lignes qui seront importées (valid + warning) */}
        <div className="csv-import-summary__card csv-import-summary__card--importable">
          <CheckCircle size={18} aria-hidden />
          <span className="csv-import-summary__count">{importableCount}</span>
          <span className="csv-import-summary__label">À importer</span>
        </div>

        {/* Lignes importables mais avec des avertissements */}
        <div className="csv-import-summary__card csv-import-summary__card--warning">
          <AlertTriangle size={18} aria-hidden />
          <span className="csv-import-summary__count">{warningCount}</span>
          <span className="csv-import-summary__label">
            {warningCount === 1 ? "Avertissement" : "Avertissements"}
          </span>
        </div>

        {/* Lignes invalides — exclues */}
        <div className="csv-import-summary__card csv-import-summary__card--invalid">
          <XCircle size={18} aria-hidden />
          <span className="csv-import-summary__count">{invalidCount}</span>
          <span className="csv-import-summary__label">
            {invalidCount === 1 ? "Invalide" : "Invalides"}
          </span>
        </div>
      </div>

      {/* ── Message décisionnel ─────────────────────────── */}
      {/*
        Ce message synthétise en une phrase ce qui va se passer :
        "X trades seront créés · Y ligne(s) exclue(s)"
        Il est coloré selon si tout est OK ou s'il y a des exclusions.
      */}
      <p className="csv-import-summary__message">
        {importableCount > 0 ? (
          <>
            <span className="csv-import-summary__count-inline csv-import-summary__count-inline--importable">
              {importableCount} trade{importableCount > 1 ? "s" : ""}
            </span>{" "}
            {importableCount > 1 ? "seront créés" : "sera créé"} dans
            TradingBook.
            {invalidCount > 0 && (
              <>
                {" "}
                <span className="csv-import-summary__count-inline csv-import-summary__count-inline--invalid">
                  {invalidCount} ligne{invalidCount > 1 ? "s" : ""} exclue
                  {invalidCount > 1 ? "s" : ""}
                </span>{" "}
                (données invalides, non importées).
              </>
            )}
          </>
        ) : (
          <span className="csv-import-summary__no-trades">
            Aucun trade importable — corrigez les erreurs de validation ou
            revenez au mapping pour modifier les associations de colonnes.
          </span>
        )}
      </p>
    </div>
  );
}
