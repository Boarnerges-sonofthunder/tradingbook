// ============================================================
// DuplicateTradesPanel — Doublons détectés avant import
// ============================================================
// Phase 5 Étape 9 — Déduplication des trades importés.
//
// Affiche le résultat de la déduplication (tradeDeduplicationService)
// en deux sections dépliables :
//
//   1. Doublons EXACTS   — identiques à des trades déjà présents
//      → Exclus automatiquement de l'import (jamais créés)
//
//   2. Doublons PROBABLES — ressemblants mais non identiques
//      → Affichés pour vérification manuelle avant confirmation
//      → Seront importés si l'utilisateur confirme
//
// Props :
//   report        — rapport de déduplication (CsvDeduplicationReport)
//   validatedRows — lignes validées (pour afficher les valeurs parsées)
//   loading       — afficher un indicateur de chargement
//
// Retourne null si aucun doublon détecté et loading=false.
// ============================================================

import { useState } from "react";
import {
  Copy,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  XCircle,
  Search,
  Ban,
  TriangleAlert,
} from "lucide-react";
import type {
  CsvDeduplicationReport,
  CsvValidatedRow,
} from "../../../types/csvImport";

// ─── Props ─────────────────────────────────────────────────

interface Props {
  /** Rapport produit par checkDuplicates(). */
  report: CsvDeduplicationReport;
  /** Lignes validées (pour récupérer les valeurs parsées par index). */
  validatedRows: CsvValidatedRow[];
  /** Affiche un indicateur de chargement pendant l'analyse SQLite. */
  loading?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────

/** Formate un objet Date en chaîne locale courte. */
function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Génère une barre visuelle représentant un score de 0 à 1.
 * Utilisée pour afficher la similarité des doublons probables.
 */
function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls =
    pct >= 80
      ? "dedup-score--high"
      : pct >= 60
        ? "dedup-score--medium"
        : "dedup-score--low";

  return (
    <span className={`dedup-score ${cls}`}>
      <span
        className="dedup-score__bar"
        style={{ width: `${pct}%` }}
        aria-hidden
      />
      <span className="dedup-score__label">{pct} %</span>
    </span>
  );
}

// ─── Composant principal ────────────────────────────────────

export default function DuplicateTradesPanel({
  report,
  validatedRows,
  loading = false,
}: Props) {
  // État d'expansion des deux sections
  const [showExact, setShowExact] = useState(true);
  const [showProbable, setShowProbable] = useState(true);

  // Ne rien afficher si aucun doublon et pas de chargement
  if (!loading && !report.hasDuplicates) return null;

  // Index des lignes validées pour accès O(1) par index
  const rowByIndex = new Map(validatedRows.map((r) => [r.index, r]));

  // Partitionner les doublons par type
  const exactRows = report.rows.filter((r) => r.status === "exact_duplicate");
  const probableRows = report.rows.filter(
    (r) => r.status === "probable_duplicate",
  );

  return (
    <div className="dedup-panel" role="region" aria-label="Doublons détectés">
      {/* ── En-tête ────────────────────────────────────── */}
      <div className="dedup-panel__header">
        <Copy size={14} className="dedup-panel__header-icon" aria-hidden />
        <div className="dedup-panel__header-text">
          <span className="dedup-panel__title">Doublons détectés</span>
          <div className="dedup-panel__summary">
            {report.exactDuplicateCount > 0 && (
              <span className="dedup-panel__pill dedup-panel__pill--exact">
                <Ban size={10} aria-hidden />
                {report.exactDuplicateCount} exact
                {report.exactDuplicateCount > 1 ? "s ignorés" : " ignoré"}
              </span>
            )}
            {report.probableDuplicateCount > 0 && (
              <span className="dedup-panel__pill dedup-panel__pill--probable">
                <TriangleAlert size={10} aria-hidden />
                {report.probableDuplicateCount} probable
                {report.probableDuplicateCount > 1 ? "s" : ""} à vérifier
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Indicateur de chargement ─────────────────── */}
      {loading && (
        <p className="dedup-panel__loading">Analyse des doublons en cours…</p>
      )}

      {/* ── Section doublons EXACTS ───────────────────── */}
      {!loading && exactRows.length > 0 && (
        <div className="dedup-panel__section">
          {/* Toggle */}
          <button
            className="dedup-panel__toggle dedup-panel__toggle--exact"
            onClick={() => setShowExact((v) => !v)}
            aria-expanded={showExact}
          >
            <span className="dedup-panel__toggle-chevron">
              {showExact ? (
                <ChevronDown size={13} aria-hidden />
              ) : (
                <ChevronRight size={13} aria-hidden />
              )}
            </span>
            <XCircle
              size={13}
              className="dedup-panel__toggle-icon dedup-panel__toggle-icon--exact"
              aria-hidden
            />
            <span className="dedup-panel__toggle-label">
              Doublons exacts —{" "}
              <strong>
                {exactRows.length} ligne{exactRows.length > 1 ? "s" : ""} exclue
                {exactRows.length > 1 ? "s" : ""} de l'import
              </strong>
            </span>
          </button>

          {/* Contenu */}
          {showExact && (
            <div className="dedup-panel__body">
              <p className="dedup-panel__hint">
                Ces lignes sont <strong>identiques</strong> à des trades déjà
                présents dans TradingBook. Elles ne seront{" "}
                <strong>pas importées</strong>, même si vous confirmez.
              </p>

              <div className="dedup-panel__table-wrap">
                <table className="dedup-panel__table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Symbol</th>
                      <th>Sens</th>
                      <th>Ouverture</th>
                      <th>Volume</th>
                      <th>Trade existant</th>
                      <th>Critère</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exactRows.map((dedupRow) => {
                      const validated = rowByIndex.get(dedupRow.index);
                      const p = validated?.parsed;
                      return (
                        <tr
                          key={dedupRow.index}
                          className="dedup-panel__row dedup-panel__row--exact"
                        >
                          <td className="dedup-panel__cell--line">
                            L.{dedupRow.index + 2}
                          </td>
                          <td className="dedup-panel__cell--symbol">
                            {p?.symbol ?? "—"}
                          </td>
                          <td>
                            {p?.side ? (
                              <span
                                className={`dedup-panel__side dedup-panel__side--${p.side}`}
                              >
                                {p.side === "buy" ? "Achat" : "Vente"}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="dedup-panel__cell--date">
                            {formatDate(p?.openedAt ?? null)}
                          </td>
                          <td>{p?.volume ?? "—"}</td>
                          <td className="dedup-panel__cell--trade">
                            <code>{dedupRow.match?.tradeSummary ?? "—"}</code>
                          </td>
                          <td className="dedup-panel__cell--reason">
                            {dedupRow.match?.reason ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section doublons PROBABLES ────────────────── */}
      {!loading && probableRows.length > 0 && (
        <div className="dedup-panel__section">
          {/* Toggle */}
          <button
            className="dedup-panel__toggle dedup-panel__toggle--probable"
            onClick={() => setShowProbable((v) => !v)}
            aria-expanded={showProbable}
          >
            <span className="dedup-panel__toggle-chevron">
              {showProbable ? (
                <ChevronDown size={13} aria-hidden />
              ) : (
                <ChevronRight size={13} aria-hidden />
              )}
            </span>
            <Search
              size={13}
              className="dedup-panel__toggle-icon dedup-panel__toggle-icon--probable"
              aria-hidden
            />
            <span className="dedup-panel__toggle-label">
              Doublons probables —{" "}
              <strong>
                {probableRows.length} ligne
                {probableRows.length > 1 ? "s" : ""} à vérifier manuellement
              </strong>
            </span>
          </button>

          {/* Contenu */}
          {showProbable && (
            <div className="dedup-panel__body">
              <p className="dedup-panel__hint">
                Ces lignes <strong>ressemblent</strong> à des trades existants
                sans leur être identiques. Elles seront importées si vous
                confirmez — vérifiez qu'il ne s'agit pas de doublons.
              </p>

              <div className="dedup-panel__table-wrap">
                <table className="dedup-panel__table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Symbol</th>
                      <th>Sens</th>
                      <th>Ouverture</th>
                      <th>Volume</th>
                      <th>Trade similaire</th>
                      <th>Similarité</th>
                      <th>Indices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {probableRows.map((dedupRow) => {
                      const validated = rowByIndex.get(dedupRow.index);
                      const p = validated?.parsed;
                      const score = dedupRow.match?.score ?? 0;
                      return (
                        <tr
                          key={dedupRow.index}
                          className="dedup-panel__row dedup-panel__row--probable"
                        >
                          <td className="dedup-panel__cell--line">
                            L.{dedupRow.index + 2}
                          </td>
                          <td className="dedup-panel__cell--symbol">
                            {p?.symbol ?? "—"}
                          </td>
                          <td>
                            {p?.side ? (
                              <span
                                className={`dedup-panel__side dedup-panel__side--${p.side}`}
                              >
                                {p.side === "buy" ? "Achat" : "Vente"}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="dedup-panel__cell--date">
                            {formatDate(p?.openedAt ?? null)}
                          </td>
                          <td>{p?.volume ?? "—"}</td>
                          <td className="dedup-panel__cell--trade">
                            <code>{dedupRow.match?.tradeSummary ?? "—"}</code>
                          </td>
                          <td>
                            <ScoreBar score={score} />
                          </td>
                          <td className="dedup-panel__cell--reason">
                            {dedupRow.match?.reason ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Note de bas de panneau ────────────────────── */}
      {!loading && (
        <div className="dedup-panel__footer">
          <AlertCircle size={12} aria-hidden />
          <span>
            Les doublons exacts sont automatiquement exclus. Les doublons
            probables seront importés si vous confirmez — vérifiez-les avant de
            procéder.
          </span>
        </div>
      )}
    </div>
  );
}
