// ============================================================
// CsvImportPreview — Prévisualisation complète avant import
// ============================================================
// Phase 5 Étape 6 — Prévisualisation avant import.
//
// Ce composant orchestre la décision finale d'import :
//
//   1. CsvImportSummary    : résumé (importables / invalides / avertissements)
//   2. Tableau importables : chaque trade parsé avec ses valeurs transformées
//   3. CsvInvalidRowsTable : lignes exclues avec leurs erreurs détaillées
//   4. Barre d'actions     : retour au mapping ou confirmation (stub)
//
// DIFFÉRENCE AVEC CsvValidationTable (Étape 5) :
//   - CsvValidationTable : valeurs BRUTES du CSV, toutes les lignes,
//     orienté diagnostic (que se passe-t-il ?)
//   - CsvImportPreview   : valeurs PARSÉES (transformées), séparation
//     importable / invalide, orienté décision (que vais-je importer ?)
//
// IMPORTANT : Ce composant n'écrit RIEN dans SQLite.
//   - Pas d'appel à createTrade() ni à aucun service SQLite
//   - L'import effectif est implémenté en Phase 5 Étape 7
//   - Le bouton "Confirmer" appelle onConfirm() qui est un stub dans ImportsPage
//
// Props :
//   validationResult — produit par validateRows() (csvValidationService)
//   onBack           — reset de la prévisualisation → retour au mapping
//   onConfirm        — stub import (Phase 5 Étape 7)
// ============================================================

import { useState } from "react";
import {
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  CsvValidatedRow,
  CsvValidationResult,
} from "../../../types/csvImport";
import CsvImportSummary from "./CsvImportSummary";
import CsvInvalidRowsTable from "./CsvInvalidRowsTable";

// ─── Constantes ────────────────────────────────────────────

/** Nombre de lignes par page dans le tableau de prévisualisation. */
const PAGE_SIZE = 20;

// ─── Props ─────────────────────────────────────────────────

interface CsvImportPreviewProps {
  /** Résultat complet de la validation produit par validateRows(). */
  validationResult: CsvValidationResult;
  /**
   * Retourner à la section mapping.
   * Dans ImportsPage : réinitialise validationResult → null.
   * Le mapping actuel est conservé — l'utilisateur peut modifier
   * les associations et relancer la validation.
   */
  onBack: () => void;
  /**
   * Déclencher l'import final dans SQLite.
   *
   * STUB — pas encore implémenté (Phase 5 Étape 7).
   * Dans ImportsPage : affiche une notification informative.
   *
   * Le bouton est désactivé si summary.importableCount === 0.
   */
  onConfirm: () => void;
}

// ─── Helpers locaux ────────────────────────────────────────

/**
 * Formate une Date en chaîne locale lisible (français).
 * Retourne "—" si null.
 */
function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formate un nombre décimal en chaîne locale française.
 * Retourne "—" si null.
 */
function fmtNum(n: number | null, decimals = 2): string {
  if (n === null) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ─── Sous-composant : ligne du tableau importable ──────────

/**
 * Affiche une ligne de trade importable avec ses valeurs PARSÉES.
 *
 * Contrairement à CsvValidationTable qui affiche les valeurs brutes CSV,
 * ce composant affiche les valeurs après transformation :
 *   - Date : objet Date → format local "jj/mm/aaaa hh:mm"
 *   - Nombre : chaîne → nombre avec 2 ou 5 décimales selon le champ
 *   - Side : "buy limit" → "BUY" (normalisé)
 *   - P&L : coloré vert si positif, rouge si négatif
 */
function ImportableRow({ row }: { row: CsvValidatedRow }) {
  const { parsed, status, warnings } = row;
  const isWarning = status === "warning";

  // Classe CSS pour coloration du P&L
  const pnlClass =
    parsed.netPnl === null
      ? ""
      : parsed.netPnl > 0
        ? "csv-import-preview__pnl--positive"
        : parsed.netPnl < 0
          ? "csv-import-preview__pnl--negative"
          : "";

  return (
    <tr
      className={`csv-import-preview__row csv-import-preview__row--${status}`}
    >
      {/* Icône de statut : vert (valide) ou orange (avertissement) */}
      <td className="csv-import-preview__td csv-import-preview__td--status">
        {isWarning ? (
          <AlertTriangle
            size={13}
            className="csv-import-preview__icon--warning"
            aria-label="Avertissement"
          />
        ) : (
          <CheckCircle
            size={13}
            className="csv-import-preview__icon--valid"
            aria-label="Valide"
          />
        )}
      </td>

      {/* Numéro de ligne dans le fichier CSV original (index + 2 car ligne 1 = header) */}
      <td className="csv-import-preview__td csv-import-preview__td--num">
        <span className="csv-import-preview__line-num">{row.index + 2}</span>
      </td>

      {/* Symbole parsé */}
      <td className="csv-import-preview__td">
        <span className="csv-import-preview__symbol">
          {parsed.symbol ?? "—"}
        </span>
      </td>

      {/* Sens : badge coloré BUY (vert) ou SELL (rouge) */}
      <td className="csv-import-preview__td">
        {parsed.side ? (
          <span
            className={`csv-import-preview__side csv-import-preview__side--${parsed.side}`}
          >
            {parsed.side.toUpperCase()}
          </span>
        ) : (
          <span className="csv-import-preview__missing">—</span>
        )}
      </td>

      {/* Date d'ouverture parsée */}
      <td className="csv-import-preview__td">
        <span className="csv-import-preview__date">
          {fmtDate(parsed.openedAt)}
        </span>
      </td>

      {/* Date de fermeture (optionnel — trades ouverts n'en ont pas) */}
      <td className="csv-import-preview__td">
        <span className="csv-import-preview__date">
          {fmtDate(parsed.closedAt)}
        </span>
      </td>

      {/* Prix d'entrée — 5 décimales pour les paires forex */}
      <td className="csv-import-preview__td csv-import-preview__td--num">
        {fmtNum(parsed.entryPrice, 5)}
      </td>

      {/* Prix de sortie (optionnel) */}
      <td className="csv-import-preview__td csv-import-preview__td--num">
        {fmtNum(parsed.exitPrice, 5)}
      </td>

      {/* Volume en lots */}
      <td className="csv-import-preview__td csv-import-preview__td--num">
        {fmtNum(parsed.volume, 2)}
      </td>

      {/* P&L net avec signe explicite et coloration */}
      <td
        className={`csv-import-preview__td csv-import-preview__td--num ${pnlClass}`}
      >
        {parsed.netPnl !== null
          ? `${parsed.netPnl >= 0 ? "+" : ""}${fmtNum(parsed.netPnl, 2)}`
          : "—"}
      </td>

      {/* Devise */}
      <td className="csv-import-preview__td">
        {parsed.currency ?? (
          <span className="csv-import-preview__missing">—</span>
        )}
      </td>

      {/* Avertissements inline (uniquement pour les lignes "warning") */}
      <td className="csv-import-preview__td csv-import-preview__td--notes">
        {warnings.length > 0 ? (
          <ul className="csv-import-preview__warnings">
            {warnings.map((w, i) => (
              <li key={i} className="csv-import-preview__warning">
                <AlertTriangle size={10} aria-hidden />
                {w.message}
              </li>
            ))}
          </ul>
        ) : (
          <span className="csv-import-preview__ok">✓ OK</span>
        )}
      </td>
    </tr>
  );
}

// ─── Composant principal ────────────────────────────────────

export default function CsvImportPreview({
  validationResult,
  onBack,
  onConfirm,
}: CsvImportPreviewProps) {
  const { rows, summary } = validationResult;

  // ── Séparation des lignes ───────────────────────────────
  // Les lignes "valid" et "warning" sont importables.
  // Les lignes "invalid" sont exclues et affichées séparément.
  const importableRows = rows.filter((r) => r.status !== "invalid");
  const invalidRows = rows.filter((r) => r.status === "invalid");

  // ── Pagination du tableau importable ───────────────────
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(importableRows.length / PAGE_SIZE));
  const pageRows = importableRows.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  // Le bouton "Confirmer" n'est actif que si au moins un trade est importable
  const canImport = summary.importableCount > 0;

  return (
    <div className="csv-import-preview">
      {/* ── 1. Résumé décisionnel ────────────────────────── */}
      {/*
        CsvImportSummary met en avant le nombre de trades qui seront
        effectivement créés, contrairement à CsvValidationSummary qui
        détaille les résultats du diagnostic de validation.
      */}
      <CsvImportSummary summary={summary} />

      {/* ── 2. Tableau des trades importables ────────────── */}
      <div className="csv-import-preview__section">
        <h3 className="csv-import-preview__section-title">
          <CheckCircle size={14} aria-hidden />
          Trades prêts à importer
          <span className="csv-import-preview__section-count">
            {summary.importableCount}
          </span>
        </h3>

        {importableRows.length === 0 ? (
          <p className="csv-import-preview__empty">
            Aucun trade importable — toutes les lignes sont invalides. Corrigez
            le fichier CSV ou revenez au mapping pour modifier les associations
            de colonnes.
          </p>
        ) : (
          <>
            {/* Tableau scrollable horizontalement */}
            <div className="csv-import-preview__wrapper">
              <table className="csv-import-preview__table">
                <thead>
                  <tr>
                    {/* Statut */}
                    <th
                      className="csv-import-preview__th csv-import-preview__th--status"
                      aria-label="Statut"
                    />
                    <th className="csv-import-preview__th csv-import-preview__th--num">
                      Ligne
                    </th>
                    <th className="csv-import-preview__th">Symbole</th>
                    <th className="csv-import-preview__th">Sens</th>
                    <th className="csv-import-preview__th">Ouverture</th>
                    <th className="csv-import-preview__th">Fermeture</th>
                    <th className="csv-import-preview__th csv-import-preview__th--num">
                      Entrée
                    </th>
                    <th className="csv-import-preview__th csv-import-preview__th--num">
                      Sortie
                    </th>
                    <th className="csv-import-preview__th csv-import-preview__th--num">
                      Volume
                    </th>
                    <th className="csv-import-preview__th csv-import-preview__th--num">
                      P&amp;L net
                    </th>
                    <th className="csv-import-preview__th">Devise</th>
                    <th className="csv-import-preview__th">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <ImportableRow key={row.index} row={row} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination — affichée uniquement si plus d'une page */}
            {totalPages > 1 && (
              <div className="csv-import-preview__pagination">
                <button
                  className="btn-ghost csv-import-preview__page-btn"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  aria-label="Page précédente"
                >
                  <ChevronLeft size={14} aria-hidden />
                </button>
                <span className="csv-import-preview__page-info">
                  Page {page + 1}{" "}
                  <span className="csv-import-preview__page-count">
                    / {totalPages}
                  </span>
                </span>
                <button
                  className="btn-ghost csv-import-preview__page-btn"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                  aria-label="Page suivante"
                >
                  <ChevronRight size={14} aria-hidden />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 3. Lignes invalides — exclues de l'import ────── */}
      {/*
        Affichées uniquement s'il y en a.
        L'utilisateur peut soit :
          - Corriger le fichier CSV source et réimporter
          - Revenir au mapping (bouton en bas) pour modifier les colonnes
      */}
      {invalidRows.length > 0 && (
        <div className="csv-import-preview__section csv-import-preview__section--invalid">
          <h3 className="csv-import-preview__section-title csv-import-preview__section-title--invalid">
            <AlertTriangle size={14} aria-hidden />
            Lignes invalides — exclues de l'import
            <span className="csv-import-preview__section-count csv-import-preview__section-count--invalid">
              {invalidRows.length}
            </span>
          </h3>

          <p className="csv-import-preview__invalid-note">
            Ces lignes ne seront pas importées dans TradingBook. Pour les
            inclure, corrigez les données dans le fichier CSV source ou revenez
            au mapping pour modifier les associations de colonnes.
          </p>

          {/* Tableau compact des lignes invalides avec leurs erreurs */}
          <CsvInvalidRowsTable rows={invalidRows} />
        </div>
      )}

      {/* ── 4. Barre d'actions ───────────────────────────── */}
      <div className="csv-import-preview__actions">
        {/*
          Retour au mapping : réinitialise validationResult dans ImportsPage.
          Le mapping actuel est conservé — l'utilisateur modifie les colonnes
          et la validation se relance automatiquement via le onChange.
        */}
        <button className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden />
          Retourner au mapping
        </button>

        {/*
          Bouton de confirmation — STUB (Phase 5 Étape 7).
          L'import SQLite sera implémenté à l'étape suivante.
          Désactivé si aucun trade n'est importable.
        */}
        <button
          className="btn-primary"
          onClick={onConfirm}
          disabled={!canImport}
          title={
            canImport
              ? `Créer ${summary.importableCount} trade${summary.importableCount > 1 ? "s" : ""} dans TradingBook`
              : "Aucun trade importable — corrigez les erreurs d'abord"
          }
        >
          <Download size={14} aria-hidden />
          Confirmer l'import ({summary.importableCount} trade
          {summary.importableCount !== 1 ? "s" : ""})
        </button>
      </div>
    </div>
  );
}
