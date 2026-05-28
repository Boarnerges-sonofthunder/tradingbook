// ============================================================
// CsvImportErrorsPanel — Panneau d'erreurs consolidé
// ============================================================
// Phase 5 Étape 7 — Gestion des erreurs d'import CSV.
//
// Affiche un rapport consolidé de toutes les issues du pipeline
// d'import en cours : fichier, parsing, mapping, broker, validation.
//
// Ce panneau est COMPLÉMENTAIRE aux composants existants :
//   - CsvValidationTable    → diagnostic technique ligne par ligne
//   - CsvImportPreview      → décision (valeurs parsées, confirmable)
//   - CsvImportErrorsPanel  → rapport global orienté utilisateur
//
// Organisation de l'affichage :
//   - Si canProceed = false : bandeau rouge "Import bloqué" (blockers)
//   - Si canProceed = true  : bandeau orange "Import partiel possible"
//   - Section "Erreurs" (rouge)      : issues severity === "error"
//   - Section "Avertissements" (orange) : issues severity === "warning"
//
// Props :
//   report — CsvImportReport produit par buildImportReport()
//
// Composant purement affichant — pas d'effets de bord.
// Aucun appel SQLite ni I/O.
// ============================================================

import {
  AlertCircle,
  AlertTriangle,
  FileX,
  Columns,
  MapPin,
  Cpu,
  ShieldAlert,
  Database,
  CheckCircle,
} from "lucide-react";
import type {
  CsvImportReport,
  CsvImportIssue,
  CsvImportErrorCategory,
} from "../../../types/csvImport";

// ─── Props ─────────────────────────────────────────────────

interface Props {
  /** Rapport produit par buildImportReport(). */
  report: CsvImportReport;
}

// ─── Helpers ───────────────────────────────────────────────

/** Labels lisibles pour chaque catégorie d'erreur. */
const CATEGORY_LABELS: Record<CsvImportErrorCategory, string> = {
  file: "Fichier",
  parsing: "Parsing",
  mapping: "Mapping",
  broker: "Broker",
  validation: "Validation",
  data: "Données",
};

/** Icône associée à chaque catégorie. */
function CategoryIcon({
  category,
  size = 13,
}: {
  category: CsvImportErrorCategory;
  size?: number;
}) {
  const props = { size, "aria-hidden": true } as const;
  switch (category) {
    case "file":
      return <FileX {...props} />;
    case "parsing":
      return <Database {...props} />;
    case "mapping":
      return <Columns {...props} />;
    case "broker":
      return <Cpu {...props} />;
    case "validation":
      return <ShieldAlert {...props} />;
    case "data":
      return <MapPin {...props} />;
  }
}

// ─── Sous-composant : une issue ──────────────────────────

function IssueRow({ issue }: { issue: CsvImportIssue }) {
  const isError = issue.severity === "error";

  return (
    <li
      className={`csv-errors-panel__issue csv-errors-panel__issue--${issue.severity}`}
    >
      {/* Icône de sévérité */}
      <span className="csv-errors-panel__issue-icon">
        {isError ? (
          <AlertCircle size={13} aria-hidden />
        ) : (
          <AlertTriangle size={13} aria-hidden />
        )}
      </span>

      <div className="csv-errors-panel__issue-body">
        {/* Ligne principale : catégorie + message + count */}
        <div className="csv-errors-panel__issue-header">
          {/* Badge de catégorie */}
          <span className="csv-errors-panel__category-badge">
            <CategoryIcon category={issue.category} size={11} />
            {CATEGORY_LABELS[issue.category]}
          </span>

          {/* Message principal */}
          <span className="csv-errors-panel__issue-message">
            {issue.message}
          </span>

          {/* Compteur d'occurrences (si agrégé) */}
          {issue.count !== undefined && issue.count > 1 && (
            <span className="csv-errors-panel__issue-count">
              ×{issue.count}
            </span>
          )}

          {/* Badge "bloque l'import" pour les erreurs critiques */}
          {issue.blocksImport && (
            <span className="csv-errors-panel__blocks-badge">
              Bloque l'import
            </span>
          )}
        </div>

        {/* Détail technique (sous-texte) */}
        {issue.detail && (
          <p className="csv-errors-panel__issue-detail">{issue.detail}</p>
        )}
      </div>
    </li>
  );
}

// ─── Composant principal ────────────────────────────────────

export default function CsvImportErrorsPanel({ report }: Props) {
  // Si le rapport est propre, ne rien afficher
  if (report.isClean) return null;

  const errors = report.issues.filter((i) => i.severity === "error");
  const warnings = report.issues.filter((i) => i.severity === "warning");

  return (
    <div
      className={`csv-errors-panel ${report.canProceed ? "csv-errors-panel--partial" : "csv-errors-panel--blocked"}`}
      role="alert"
      aria-live="polite"
    >
      {/* ── En-tête du rapport ──────────────────────────── */}
      <div className="csv-errors-panel__header">
        <div className="csv-errors-panel__header-icon">
          {report.canProceed ? (
            <AlertTriangle size={16} aria-hidden />
          ) : (
            <AlertCircle size={16} aria-hidden />
          )}
        </div>

        <div className="csv-errors-panel__header-text">
          <span className="csv-errors-panel__header-title">
            {report.canProceed
              ? "Import partiel possible — des problèmes ont été détectés"
              : "Import bloqué — corrigez les erreurs pour continuer"}
          </span>
          <span className="csv-errors-panel__header-summary">
            {report.errorCount > 0 && (
              <>
                <span className="csv-errors-panel__count csv-errors-panel__count--error">
                  {report.errorCount} erreur
                  {report.errorCount > 1 ? "s" : ""}
                </span>
              </>
            )}
            {report.errorCount > 0 && report.warningCount > 0 && (
              <span className="csv-errors-panel__sep"> · </span>
            )}
            {report.warningCount > 0 && (
              <>
                <span className="csv-errors-panel__count csv-errors-panel__count--warning">
                  {report.warningCount} avertissement
                  {report.warningCount > 1 ? "s" : ""}
                </span>
              </>
            )}
          </span>
        </div>

        {/* Statut import possible / bloqué */}
        {report.canProceed ? (
          <span className="csv-errors-panel__status csv-errors-panel__status--proceed">
            <CheckCircle size={12} aria-hidden />
            Lignes valides importables
          </span>
        ) : (
          <span className="csv-errors-panel__status csv-errors-panel__status--blocked">
            <AlertCircle size={12} aria-hidden />
            Import impossible
          </span>
        )}
      </div>

      {/* ── Section erreurs ─────────────────────────────── */}
      {errors.length > 0 && (
        <div className="csv-errors-panel__section">
          <p className="csv-errors-panel__section-label csv-errors-panel__section-label--error">
            <AlertCircle size={12} aria-hidden />
            Erreurs bloquantes
          </p>
          <ul className="csv-errors-panel__list">
            {errors.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </ul>
        </div>
      )}

      {/* ── Section avertissements ──────────────────────── */}
      {warnings.length > 0 && (
        <div className="csv-errors-panel__section">
          <p className="csv-errors-panel__section-label csv-errors-panel__section-label--warning">
            <AlertTriangle size={12} aria-hidden />
            Avertissements
          </p>
          <ul className="csv-errors-panel__list">
            {warnings.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </ul>
        </div>
      )}

      {/*
        Note de bas de panneau — rappelle les règles de l'import partiel.
        Visible uniquement si canProceed = true (certaines lignes sont exclues
        mais d'autres peuvent être importées).
      */}
      {report.canProceed && report.errorCount > 0 && (
        <p className="csv-errors-panel__footer-note">
          Les lignes valides seront importées — les lignes invalides seront
          ignorées. Consultez la section "Aperçu avant import" pour les détails.
        </p>
      )}
    </div>
  );
}
