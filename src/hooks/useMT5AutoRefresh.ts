// ============================================================
// Hook — useMT5AutoRefresh
// ============================================================
// Phase 6 Étape 9 — Synchronisation automatique périodique.
//
// Ce hook gère :
//   - le chargement/sauvegarde des préférences depuis SQLite
//   - le démarrage/arrêt du timer via mt5AutoRefreshService
//   - le countdown vers la prochaine sync (rafraîchi chaque seconde)
//   - l'état isSyncing (auto ou manuelle via syncNow)
//
// Comportement :
//   - Désactivé par défaut (opt-in explicite uniquement).
//   - Quand activé, le premier tick se produit après 1 intervalle.
//   - Quand l'utilisateur change l'intervalle, le timer redémarre.
//   - Nettoyage automatique au démontage du composant.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "../services/logging";
import {
  getSetting,
  setSetting,
} from "../services/settings/settingsService";
import {
  isSyncInProgress,
  runSyncWithLock,
  startAutoRefresh,
  stopAutoRefresh,
} from "../services/mt5/mt5AutoRefreshService";
import type { MT5AutoRefreshInterval } from "../types/mt5";

const logger = createLogger("use-mt5-auto-refresh");

// ─── Constantes ────────────────────────────────────────────

/** Clés de persistance dans la table SQLite `settings`. */
const SETTINGS_KEY_ENABLED = "mt5.autoRefresh.enabled";
const SETTINGS_KEY_INTERVAL = "mt5.autoRefresh.interval";

/** Options de l'intervalle avec labels UI et valeurs en ms. */
export const MT5_REFRESH_INTERVAL_OPTIONS: ReadonlyArray<{
  value: MT5AutoRefreshInterval;
  label: string;
  ms: number | null;
}> = [
  { value: "disabled", label: "Désactivé", ms: null },
  { value: "30s", label: "30 secondes", ms: 30_000 },
  { value: "1min", label: "1 minute", ms: 60_000 },
  { value: "5min", label: "5 minutes", ms: 5 * 60_000 },
  { value: "15min", label: "15 minutes", ms: 15 * 60_000 },
];

function getIntervalMs(interval: MT5AutoRefreshInterval): number | null {
  return (
    MT5_REFRESH_INTERVAL_OPTIONS.find((o) => o.value === interval)?.ms ?? null
  );
}

function isValidInterval(value: string): value is MT5AutoRefreshInterval {
  return MT5_REFRESH_INTERVAL_OPTIONS.some((o) => o.value === value);
}

// ─── Types ─────────────────────────────────────────────────

export interface UseMT5AutoRefreshOptions {
  /**
   * Callback appelé à chaque déclenchement (auto ou via syncNow).
   * Ce callback est enveloppé dans le verrou anti-concurrence.
   */
  onSync: () => Promise<void>;
}

export interface UseMT5AutoRefreshReturn {
  /** true si le refresh automatique est activé. */
  enabled: boolean;
  /** Intervalle sélectionné. */
  interval: MT5AutoRefreshInterval;
  /** true si une sync est en cours (auto ou manuelle via syncNow). */
  isSyncing: boolean;
  /** Horodatage ISO de la dernière sync terminée. */
  lastSyncAt: string | null;
  /** Date prévue de la prochaine sync (null si désactivé). */
  nextSyncAt: Date | null;
  /** Secondes restantes avant la prochaine sync (null si désactivé). */
  secondsUntilNext: number | null;
  /** true une fois les préférences chargées depuis SQLite. */
  settingsLoaded: boolean;
  /** Active le refresh automatique. Sauvegarde dans SQLite. */
  enableAutoRefresh: (interval?: MT5AutoRefreshInterval) => Promise<void>;
  /** Désactive le refresh automatique. Sauvegarde dans SQLite. */
  disableAutoRefresh: () => Promise<void>;
  /** Change l'intervalle. Redémarre le timer si actuellement actif. */
  changeInterval: (interval: MT5AutoRefreshInterval) => Promise<void>;
  /**
   * Lance une synchronisation immédiate via le verrou.
   * Retourne false si une sync est déjà en cours.
   */
  syncNow: () => Promise<boolean>;
}

// ─── Hook ──────────────────────────────────────────────────

export function useMT5AutoRefresh(
  options: UseMT5AutoRefreshOptions,
): UseMT5AutoRefreshReturn {
  const { onSync } = options;

  // Ref stable vers le callback onSync (évite les stale closures dans le timer).
  const onSyncRef = useRef(onSync);
  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  // ── État ────────────────────────────────────────────────

  const [enabled, setEnabled] = useState(false);
  const [interval, setIntervalValue] = useState<MT5AutoRefreshInterval>("5min");
  /** Synchronisé avec le verrou module-level du service. */
  const [isSyncing, setIsSyncing] = useState(() => isSyncInProgress());
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [nextSyncAt, setNextSyncAt] = useState<Date | null>(null);
  const [secondsUntilNext, setSecondsUntilNext] = useState<number | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ── Countdown vers la prochaine sync ────────────────────

  useEffect(() => {
    if (!nextSyncAt || !enabled) {
      setSecondsUntilNext(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.round((nextSyncAt.getTime() - Date.now()) / 1000),
      );
      setSecondsUntilNext(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [nextSyncAt, enabled]);

  // ── Callback de statut (stable, ne dépend pas d'intervalles) ──

  const handleStatusChange = useCallback((syncing: boolean) => {
    setIsSyncing(syncing);
    if (!syncing) {
      setLastSyncAt(new Date().toISOString());
    }
  }, []);

  // ── Démarrage interne du timer ───────────────────────────

  const startTimer = useCallback(
    (activeInterval: MT5AutoRefreshInterval) => {
      const ms = getIntervalMs(activeInterval);
      if (ms === null) return;

      setNextSyncAt(new Date(Date.now() + ms));

      startAutoRefresh(
        ms,
        () => {
          // Recalculer la prochaine sync au début de chaque tick.
          setNextSyncAt(new Date(Date.now() + ms));
          return onSyncRef.current();
        },
        handleStatusChange,
      );
    },
    [handleStatusChange],
  );

  // ── Chargement initial des préférences (au montage) ─────

  useEffect(() => {
    async function loadPreferences() {
      try {
        const [rawEnabled, rawInterval] = await Promise.all([
          getSetting(SETTINGS_KEY_ENABLED),
          getSetting(SETTINGS_KEY_INTERVAL),
        ]);

        const savedEnabled = rawEnabled === "true";
        const savedInterval =
          rawInterval !== null && isValidInterval(rawInterval)
            ? rawInterval
            : "5min";

        setEnabled(savedEnabled);
        setIntervalValue(savedInterval);

        if (savedEnabled) {
          startTimer(savedInterval);
        }
      } catch (err) {
        logger.error(
          `Erreur chargement préférences auto-refresh MT5 : ${String(err)}`,
        );
      } finally {
        setSettingsLoaded(true);
      }
    }

    void loadPreferences();

    // Nettoyage : stopper le timer si le composant se démonte.
    return () => {
      stopAutoRefresh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions publiques ────────────────────────────────────

  const enableAutoRefresh = useCallback(
    async (newInterval?: MT5AutoRefreshInterval) => {
      const activeInterval =
        newInterval ?? interval !== "disabled" ? (newInterval ?? interval) : "5min";

      setEnabled(true);
      setIntervalValue(activeInterval);

      try {
        await Promise.all([
          setSetting(SETTINGS_KEY_ENABLED, "true"),
          setSetting(SETTINGS_KEY_INTERVAL, activeInterval),
        ]);
      } catch (err) {
        logger.error(
          `Erreur sauvegarde préférence auto-refresh (enabled) : ${String(err)}`,
        );
      }

      startTimer(activeInterval);
    },
    [interval, startTimer],
  );

  const disableAutoRefresh = useCallback(async () => {
    setEnabled(false);
    setNextSyncAt(null);
    setSecondsUntilNext(null);
    stopAutoRefresh();

    try {
      await setSetting(SETTINGS_KEY_ENABLED, "false");
    } catch (err) {
      logger.error(
        `Erreur sauvegarde préférence auto-refresh (disabled) : ${String(err)}`,
      );
    }
  }, []);

  const changeInterval = useCallback(
    async (newInterval: MT5AutoRefreshInterval) => {
      setIntervalValue(newInterval);

      try {
        await setSetting(SETTINGS_KEY_INTERVAL, newInterval);
      } catch (err) {
        logger.error(
          `Erreur sauvegarde intervalle auto-refresh : ${String(err)}`,
        );
      }

      if (newInterval === "disabled") {
        await disableAutoRefresh();
      } else if (enabled) {
        startTimer(newInterval);
      }
    },
    [enabled, startTimer, disableAutoRefresh],
  );

  const syncNow = useCallback(async (): Promise<boolean> => {
    return runSyncWithLock(() => onSyncRef.current(), handleStatusChange);
  }, [handleStatusChange]);

  return {
    enabled,
    interval,
    isSyncing,
    lastSyncAt,
    nextSyncAt,
    secondsUntilNext,
    settingsLoaded,
    enableAutoRefresh,
    disableAutoRefresh,
    changeInterval,
    syncNow,
  };
}
