// ============================================================
// MT5AutoRefreshControls — TradingBook
// ============================================================
// Phase 6 Étape 9 — Contrôles UI de la synchronisation auto MT5.
//
// Ce composant affiche :
//   - Un toggle switch (activé/désactivé)
//   - Un sélecteur d'intervalle (30s / 1min / 5min / 15min)
//   - Le sélecteur est désactivé quand le toggle est off
// ============================================================

import { Timer } from "lucide-react";
import {
  MT5_REFRESH_INTERVAL_OPTIONS,
  type UseMT5AutoRefreshReturn,
} from "../../../hooks/useMT5AutoRefresh";
import type { MT5AutoRefreshInterval } from "../../../types/mt5";

// ─── Types ─────────────────────────────────────────────────

interface MT5AutoRefreshControlsProps {
  enabled: boolean;
  interval: MT5AutoRefreshInterval;
  isSyncing: boolean;
  settingsLoaded: boolean;
  onEnable: UseMT5AutoRefreshReturn["enableAutoRefresh"];
  onDisable: UseMT5AutoRefreshReturn["disableAutoRefresh"];
  onChangeInterval: UseMT5AutoRefreshReturn["changeInterval"];
}

// ─── Composant ─────────────────────────────────────────────

export function MT5AutoRefreshControls({
  enabled,
  interval,
  isSyncing,
  settingsLoaded,
  onEnable,
  onDisable,
  onChangeInterval,
}: MT5AutoRefreshControlsProps) {
  function handleToggle() {
    if (!settingsLoaded) return;
    if (enabled) {
      void onDisable();
    } else {
      void onEnable(interval !== "disabled" ? interval : "5min");
    }
  }

  function handleIntervalChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as MT5AutoRefreshInterval;
    void onChangeInterval(value);
  }

  const isDisabled = !settingsLoaded || isSyncing;

  return (
    <div className="mt5-autorefresh">
      {/* ── Ligne toggle ────────────────────────────────── */}
      <div className="mt5-autorefresh__row">
        <div className="mt5-autorefresh__label-group">
          <Timer size={14} className="mt5-autorefresh__icon" aria-hidden />
          <span className="mt5-autorefresh__label">
            Synchronisation automatique
          </span>
        </div>

        <label
          className="mt5-toggle"
          aria-label={
            enabled
              ? "Désactiver le refresh automatique"
              : "Activer le refresh automatique"
          }
        >
          <input
            type="checkbox"
            className="mt5-toggle__input"
            checked={enabled}
            onChange={handleToggle}
            disabled={isDisabled}
          />
          <span className="mt5-toggle__track" aria-hidden />
        </label>
      </div>

      {/* ── Ligne intervalle ─────────────────────────────── */}
      <div className="mt5-autorefresh__row mt5-autorefresh__row--sub">
        <label
          className="mt5-autorefresh__sublabel"
          htmlFor="mt5-refresh-interval"
        >
          Intervalle
        </label>

        <select
          id="mt5-refresh-interval"
          className="mt5-autorefresh__select"
          value={interval}
          onChange={handleIntervalChange}
          disabled={!enabled || isDisabled}
          aria-label="Intervalle de synchronisation automatique"
        >
          {MT5_REFRESH_INTERVAL_OPTIONS.filter(
            (o) => o.value !== "disabled",
          ).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Badge d'état ─────────────────────────────────── */}
      {!settingsLoaded && (
        <p className="mt5-autorefresh__loading">Chargement des préférences…</p>
      )}
    </div>
  );
}
