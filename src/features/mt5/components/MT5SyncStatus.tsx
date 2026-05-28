// ============================================================
// MT5SyncStatus — TradingBook
// ============================================================
// Phase 6 Étape 9 — Indicateur de statut de la synchronisation MT5.
//
// Ce composant affiche (compact) :
//   - Si auto-sync est activé/désactivé
//   - Dernière sync (horodatage relatif)
//   - Prochaine sync (countdown en secondes)
//   - Spinner si sync en cours
// ============================================================

import { Clock, RefreshCw, Zap, ZapOff } from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────

/**
 * Formate un timestamp ISO en temps relatif court.
 * ex : "il y a 2 min", "il y a 45s", "il y a 1h"
 */
function formatRelativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1_000);

  if (diff < 10) return "à l'instant";
  if (diff < 60) return `il y a ${diff}s`;
  if (diff < 3_600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86_400) return `il y a ${Math.floor(diff / 3_600)}h`;
  return `il y a ${Math.floor(diff / 86_400)}j`;
}

/**
 * Formate un nombre de secondes en countdown lisible.
 * ex : "45s", "3 min 12s", "14 min"
 */
function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (sec === 0) return `${min} min`;
  return `${min} min ${sec}s`;
}

// ─── Types ─────────────────────────────────────────────────

interface MT5SyncStatusProps {
  enabled: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  secondsUntilNext: number | null;
}

// ─── Composant ─────────────────────────────────────────────

export function MT5SyncStatus({
  enabled,
  isSyncing,
  lastSyncAt,
  secondsUntilNext,
}: MT5SyncStatusProps) {
  return (
    <div className="mt5-sync-status">
      {/* ── Indicateur activé/désactivé ──────────────────── */}
      <div
        className={`mt5-sync-status__badge ${
          enabled ? "mt5-sync-status__badge--on" : "mt5-sync-status__badge--off"
        }`}
      >
        {enabled ? (
          <Zap size={12} aria-hidden />
        ) : (
          <ZapOff size={12} aria-hidden />
        )}
        <span>{enabled ? "Auto activé" : "Auto désactivé"}</span>
      </div>

      {/* ── Sync en cours ────────────────────────────────── */}
      {isSyncing && (
        <div className="mt5-sync-status__item mt5-sync-status__item--syncing">
          <RefreshCw size={12} className="mt5-status__spinner" aria-hidden />
          <span>Synchronisation en cours…</span>
        </div>
      )}

      {/* ── Dernière sync ────────────────────────────────── */}
      {lastSyncAt !== null && !isSyncing && (
        <div className="mt5-sync-status__item">
          <Clock size={12} aria-hidden />
          <span className="mt5-sync-status__label">Dernière sync :</span>
          <span className="mt5-sync-status__value">
            {formatRelativeTime(lastSyncAt)}
          </span>
        </div>
      )}

      {/* ── Prochaine sync ───────────────────────────────── */}
      {enabled && secondsUntilNext !== null && !isSyncing && (
        <div className="mt5-sync-status__item">
          <RefreshCw size={12} aria-hidden />
          <span className="mt5-sync-status__label">Prochaine dans :</span>
          <span className="mt5-sync-status__value">
            {formatCountdown(secondsUntilNext)}
          </span>
        </div>
      )}
    </div>
  );
}
