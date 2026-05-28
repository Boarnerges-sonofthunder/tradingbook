// ============================================================
// MT5SyncSummary — Résumé de la synchronisation MT5
// ============================================================
// Phase 6 Étape 5 — Affiche le résultat de runMT5Sync() dans l'UI.
//
// ÉTATS :
//   idle    — aucune synchronisation encore lancée
//   syncing — synchronisation en cours (spinner)
//   success — terminé sans erreur (statistiques affichées)
//   partial — terminé avec des erreurs partielles
//   error   — erreur critique (MT5 inaccessible, Python absent, etc.)
//
// DONNÉES AFFICHÉES :
//   - Deals MT5 lus (historique)
//   - Positions ouvertes lues
//   - Trades insérés (nouveaux)
//   - Trades mis à jour (position fermée, ou P&L rafraîchi)
//   - Trades ignorés (doublons exacts)
//   - Erreurs individuelles (max 20)
//   - Infos compte MT5 si disponibles
//   - Horodatage de la dernière sync
// ============================================================

import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Database,
  RefreshCw,
} from "lucide-react";
import { useUserSettings } from "../../../hooks";
import { formatDateTimeForSettings } from "../../../services/settings/settingsFormatService";
import type { MT5SyncReport, MT5SyncStatus } from "../../../types/mt5";

// ─── Props ────────────────────────────────────────────────

interface MT5SyncSummaryProps {
  status: MT5SyncStatus;
  report: MT5SyncReport | null;
}

// ─── Helpers ──────────────────────────────────────────────

/** Formate une date ISO en date/heure locale lisible. */
function fmtSyncTime(
  iso: string,
  settings: ReturnType<typeof useUserSettings>,
): string {
  return formatDateTimeForSettings(iso, settings, iso);
}

// ─── Composant ────────────────────────────────────────────

export function MT5SyncSummary({ status, report }: MT5SyncSummaryProps) {
  const settings = useUserSettings();

  // ── État idle ─────────────────────────────────────────────
  if (status === "idle") {
    return (
      <div className="mt5-sync-summary mt5-sync-summary--idle">
        <div className="mt5-sync-summary__icon mt5-sync-summary__icon--idle">
          <Database size={20} aria-hidden />
        </div>
        <p className="mt5-sync-summary__message">
          Prêt à synchroniser. Cliquez sur <strong>Synchroniser MT5</strong>{" "}
          pour importer les trades récents de MetaTrader 5.
        </p>
      </div>
    );
  }

  // ── État syncing ──────────────────────────────────────────
  if (status === "syncing") {
    return (
      <div className="mt5-sync-summary mt5-sync-summary--syncing">
        <div className="mt5-sync-summary__icon">
          <Loader2
            size={20}
            className="mt5-sync-summary__spinner"
            aria-hidden
          />
        </div>
        <p className="mt5-sync-summary__message">
          Synchronisation en cours… Lecture des données MT5.
        </p>
      </div>
    );
  }

  // ── Pas de rapport disponible (ne devrait pas arriver hors idle) ──
  if (!report) {
    return (
      <div className="mt5-sync-summary mt5-sync-summary--error">
        <div className="mt5-sync-summary__icon mt5-sync-summary__icon--error">
          <AlertCircle size={20} aria-hidden />
        </div>
        <p className="mt5-sync-summary__message">Aucun rapport disponible.</p>
      </div>
    );
  }

  // ── État error ────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="mt5-sync-summary mt5-sync-summary--error">
        <div className="mt5-sync-summary__header">
          <div className="mt5-sync-summary__icon mt5-sync-summary__icon--error">
            <AlertCircle size={20} aria-hidden />
          </div>
          <div>
            <p className="mt5-sync-summary__title">Synchronisation échouée</p>
            <p className="mt5-sync-summary__timestamp">
              {fmtSyncTime(report.syncedAt, settings)}
            </p>
          </div>
        </div>
        <p className="mt5-sync-summary__message mt5-sync-summary__message--error">
          {report.message}
        </p>
        {report.errorMessages.length > 0 && (
          <ul className="mt5-sync-summary__errors">
            {report.errorMessages.map((msg, i) => (
              <li key={i} className="mt5-sync-summary__error-item">
                {msg}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── État success ou partial ───────────────────────────────
  const isPartial = status === "partial";

  return (
    <div
      className={`mt5-sync-summary ${isPartial ? "mt5-sync-summary--partial" : "mt5-sync-summary--success"}`}
    >
      {/* En-tête */}
      <div className="mt5-sync-summary__header">
        <div
          className={`mt5-sync-summary__icon ${isPartial ? "mt5-sync-summary__icon--partial" : "mt5-sync-summary__icon--success"}`}
        >
          {isPartial ? (
            <AlertCircle size={20} aria-hidden />
          ) : (
            <CheckCircle size={20} aria-hidden />
          )}
        </div>
        <div>
          <p className="mt5-sync-summary__title">
            {isPartial
              ? "Synchronisation partielle"
              : "Synchronisation réussie"}
          </p>
          <p className="mt5-sync-summary__timestamp">
            {fmtSyncTime(report.syncedAt, settings)}
          </p>
        </div>
      </div>

      {/* Message résumé */}
      {report.message && (
        <p className="mt5-sync-summary__message">{report.message}</p>
      )}

      {/* Statistiques */}
      <div className="mt5-sync-summary__stats">
        {/* Lecture MT5 */}
        <div className="mt5-sync-summary__stats-group">
          <p className="mt5-sync-summary__stats-label">Lecture MT5</p>
          <div className="mt5-sync-summary__stats-grid">
            <StatItem label="Deals lus" value={report.dealsRead} />
            <StatItem label="Positions ouvertes" value={report.positionsRead} />
            <StatItem
              label="Candidats historique"
              value={report.candidatesFromHistory}
            />
            <StatItem
              label="Candidats positions"
              value={report.candidatesFromPositions}
            />
          </div>
        </div>

        {/* Écriture SQLite */}
        <div className="mt5-sync-summary__stats-group">
          <p className="mt5-sync-summary__stats-label">Détection MT5</p>
          <div className="mt5-sync-summary__stats-grid">
            <StatItem
              label="Nouveaux"
              value={report.detectedNew}
              variant={report.detectedNew > 0 ? "success" : "neutral"}
            />
            <StatItem label="Existants" value={report.detectedExisting} />
            <StatItem
              label="À mettre à jour"
              value={report.detectedUpdates}
              variant={report.detectedUpdates > 0 ? "info" : "neutral"}
            />
            <StatItem
              label="Probables"
              value={report.detectedProbableDuplicates}
              variant={report.detectedProbableDuplicates > 0 ? "warning" : "neutral"}
            />
            <StatItem
              label="Invalides"
              value={report.detectedInvalid}
              variant={report.detectedInvalid > 0 ? "error" : "neutral"}
            />
          </div>
        </div>

        <div className="mt5-sync-summary__stats-group">
          <p className="mt5-sync-summary__stats-label">Import SQLite</p>
          <div className="mt5-sync-summary__stats-grid">
            <StatItem
              label="Insérés"
              value={report.inserted}
              variant={report.inserted > 0 ? "success" : "neutral"}
            />
            <StatItem
              label="Mis à jour"
              value={report.updated}
              variant={report.updated > 0 ? "info" : "neutral"}
            />
            <StatItem
              label="Ignorés (doublons)"
              value={report.skipped}
              variant="neutral"
            />
            <StatItem
              label="Erreurs"
              value={report.errors}
              variant={report.errors > 0 ? "error" : "neutral"}
            />
          </div>
        </div>
      </div>

      {/* Infos compte MT5 */}
      {(report.broker ?? report.server ?? report.accountId) && (
        <div className="mt5-sync-summary__account">
          <RefreshCw size={12} aria-hidden />
          <span>
            {[
              report.broker,
              report.server,
              report.accountId && `Compte ${report.accountId}`,
              report.currency,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      )}

      {/* Alertes de détection : doublons probables et candidats invalides */}
      {report.detectionMessages.length > 0 && (
        <details className="mt5-sync-summary__warnings-details">
          <summary className="mt5-sync-summary__warnings-summary">
            {report.detectionMessages.length} alerte
            {report.detectionMessages.length > 1 ? "s" : ""} de détection
          </summary>
          <ul className="mt5-sync-summary__warnings">
            {report.detectionMessages.map((msg, i) => (
              <li key={i} className="mt5-sync-summary__warning-item">
                {msg}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Messages d'erreur individuels (si partial) */}
      {report.errorMessages.length > 0 && (
        <details className="mt5-sync-summary__errors-details">
          <summary className="mt5-sync-summary__errors-summary">
            {report.errorMessages.length} erreur
            {report.errorMessages.length > 1 ? "s" : ""} détaillée
            {report.errorMessages.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt5-sync-summary__errors">
            {report.errorMessages.map((msg, i) => (
              <li key={i} className="mt5-sync-summary__error-item">
                {msg}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── Sous-composant StatItem ───────────────────────────────

interface StatItemProps {
  label: string;
  value: number;
  variant?: "success" | "info" | "warning" | "error" | "neutral";
}

function StatItem({ label, value, variant = "neutral" }: StatItemProps) {
  return (
    <div className={`mt5-sync-stat-item mt5-sync-stat-item--${variant}`}>
      <span className="mt5-sync-stat-item__value">{value}</span>
      <span className="mt5-sync-stat-item__label">{label}</span>
    </div>
  );
}
