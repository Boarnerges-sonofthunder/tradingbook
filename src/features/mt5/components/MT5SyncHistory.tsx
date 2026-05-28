// ============================================================
// MT5SyncHistory - historique local des synchronisations MT5
// ============================================================
// Affiche les dernieres entrees de `mt5_sync_logs`.
// Les donnees restent locales dans SQLite et ne sont jamais envoyees ailleurs.
// ============================================================

import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useUserSettings } from "../../../hooks";
import { formatShortDateTimeForSettings } from "../../../services/settings/settingsFormatService";
import type { MT5SyncLog } from "../../../repositories/mt5SyncLogsRepository";

interface MT5SyncHistoryProps {
  logs: MT5SyncLog[];
  loading: boolean;
  onRefresh: () => void;
}

function statusLabel(status: MT5SyncLog["status"]): string {
  switch (status) {
    case "running":
      return "En cours";
    case "success":
      return "Réussie";
    case "partial_success":
      return "Partielle";
    case "failed":
      return "Échouée";
    case "cancelled":
      return "Annulée";
  }
}

function StatusPill({ status }: { status: MT5SyncLog["status"] }) {
  const isRunning = status === "running";
  const isSuccess = status === "success";

  return (
    <span className={`mt5-sync-history__status mt5-sync-history__status--${status}`}>
      {isRunning ? (
        <Loader2 size={12} className="mt5-sync-history__spinner" aria-hidden />
      ) : isSuccess ? (
        <CheckCircle2 size={12} aria-hidden />
      ) : (
        <AlertCircle size={12} aria-hidden />
      )}
      {statusLabel(status)}
    </span>
  );
}

export function MT5SyncHistory({
  logs,
  loading,
  onRefresh,
}: MT5SyncHistoryProps) {
  const settings = useUserSettings();

  return (
    <div className="mt5-sync-history">
      <div className="mt5-sync-history__header">
        <div>
          <p className="mt5-sync-history__title">Historique des synchronisations</p>
          <p className="mt5-sync-history__subtitle">
            Logs locaux enregistrés dans SQLite.
          </p>
        </div>
        <button
          className="btn-secondary mt5-sync-history__refresh"
          onClick={onRefresh}
          disabled={loading}
          aria-busy={loading}
          type="button"
        >
          <RefreshCw
            size={14}
            className={loading ? "mt5-sync-history__spinner" : undefined}
            aria-hidden
          />
          Actualiser
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="mt5-sync-history__empty">
          {loading ? "Chargement des logs MT5…" : "Aucun log MT5 enregistré."}
        </div>
      ) : (
        <div className="mt5-sync-history__table-wrap">
          <table className="mt5-sync-history__table">
            <thead>
              <tr>
                <th>Début</th>
                <th>Fin</th>
                <th>Statut</th>
                <th>Compte</th>
                <th>Lus</th>
                <th>Ajoutés</th>
                <th>Mis à jour</th>
                <th>Doublons</th>
                <th>Probables</th>
                <th>Invalides</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatShortDateTimeForSettings(log.startedAt, settings)}</td>
                  <td>{formatShortDateTimeForSettings(log.finishedAt, settings)}</td>
                  <td>
                    <StatusPill status={log.status} />
                  </td>
                  <td>
                    {[log.accountId, log.broker].filter(Boolean).join(" · ") ||
                      "-"}
                  </td>
                  <td>{log.tradesRead}</td>
                  <td>{log.tradesAdded}</td>
                  <td>{log.tradesUpdated}</td>
                  <td>{log.duplicatesIgnored}</td>
                  <td>{log.probableDuplicates}</td>
                  <td>{log.invalidTrades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logs.some((log) => log.errorMessage) && (
        <details className="mt5-sync-history__errors">
          <summary>Erreurs et alertes enregistrées</summary>
          <ul>
            {logs
              .filter((log) => log.errorMessage)
              .map((log) => (
                <li key={log.id}>
                  <strong>
                    {formatShortDateTimeForSettings(
                      log.finishedAt ?? log.startedAt,
                      settings,
                    )}
                  </strong>
                  <span>{log.errorMessage}</span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
