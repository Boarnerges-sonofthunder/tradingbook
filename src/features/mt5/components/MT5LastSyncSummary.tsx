// ============================================================
// MT5LastSyncSummary - dernier log de synchronisation MT5
// ============================================================
// Affiche le dernier resultat persiste dans `mt5_sync_logs`.
// Ce composant lit uniquement les donnees locales deja chargees par la page.
// ============================================================

import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useUserSettings } from "../../../hooks";
import { formatDateTimeForSettings } from "../../../services/settings/settingsFormatService";
import type { MT5SyncLog } from "../../../repositories/mt5SyncLogsRepository";

interface MT5LastSyncSummaryProps {
  log: MT5SyncLog | null;
  loading: boolean;
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

function StatusIcon({ status }: { status: MT5SyncLog["status"] }) {
  if (status === "running") {
    return <Loader2 size={16} className="mt5-last-sync__spinner" aria-hidden />;
  }
  if (status === "success") {
    return <CheckCircle2 size={16} aria-hidden />;
  }
  if (status === "partial_success") {
    return <AlertCircle size={16} aria-hidden />;
  }
  return <AlertCircle size={16} aria-hidden />;
}

export function MT5LastSyncSummary({
  log,
  loading,
}: MT5LastSyncSummaryProps) {
  const settings = useUserSettings();

  if (loading) {
    return (
      <div className="mt5-last-sync mt5-last-sync--loading">
        <Loader2 size={16} className="mt5-last-sync__spinner" aria-hidden />
        <span>Chargement du dernier log MT5…</span>
      </div>
    );
  }

  if (!log) {
    return (
      <div className="mt5-last-sync mt5-last-sync--empty">
        <Clock size={16} aria-hidden />
        <span>Aucune synchronisation MT5 enregistrée.</span>
      </div>
    );
  }

  return (
    <div className={`mt5-last-sync mt5-last-sync--${log.status}`}>
      <div className="mt5-last-sync__header">
        <div className="mt5-last-sync__status-icon">
          <StatusIcon status={log.status} />
        </div>
        <div>
          <p className="mt5-last-sync__title">
            Dernière synchronisation : {statusLabel(log.status)}
          </p>
          <p className="mt5-last-sync__time">
            {formatDateTimeForSettings(log.finishedAt ?? log.startedAt, settings)}
          </p>
        </div>
      </div>

      <div className="mt5-last-sync__metrics">
        <span>{log.tradesRead} lus</span>
        <span>{log.tradesAdded} ajoutés</span>
        <span>{log.tradesUpdated} mis à jour</span>
        <span>{log.duplicatesIgnored} doublons</span>
        <span>{log.probableDuplicates} probables</span>
        <span>{log.invalidTrades} invalides</span>
      </div>

      {(log.accountId ?? log.broker ?? log.server) && (
        <p className="mt5-last-sync__account">
          {[log.broker, log.server, log.accountId && `Compte ${log.accountId}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {log.errorMessage && (
        <p className="mt5-last-sync__error">{log.errorMessage}</p>
      )}
    </div>
  );
}
