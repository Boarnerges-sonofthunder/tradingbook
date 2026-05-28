// ============================================================
// Page - Dashboard principal
// ============================================================
// Phase 7 - Statistiques globales + positions ouvertes MT5.
//
// Flux de donnees :
//   montage du composant
//     -> getDashboardStats()       <- service analytics
//           -> findTrades(closed)  <- tradesRepository
//                 -> SQLite
//     -> fetchMT5Positions()       <- bridge MT5 en lecture seule
//
// Etats geres :
//   loading initial  -> skeleton / spinner pendant la premiere requete
//   refresh discret  -> les donnees restent visibles pendant les mises a jour
//   error            -> message non intrusif (log console)
// ============================================================

import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { RefreshCw, Waves } from "lucide-react";
import { getDashboardStats } from "../services/analytics";
import {
  fetchMT5Positions,
  startMT5PositionsTickStream,
  type MT5PositionsTickStreamController,
} from "../services/mt5";
import DashboardStatsGrid from "../features/dashboard/components/DashboardStatsGrid";
import MT5OpenPositionsPreview from "../features/mt5/components/MT5OpenPositionsPreview";
import { useMT5AutoRefreshContext } from "../features/mt5/context/MT5AutoRefreshContext";
import { useUserSettings } from "../hooks";
import { tr } from "../utils/i18n";
import type {
  DashboardStatsResult,
  MT5PositionsResult,
  MT5PositionsStatus,
} from "../types";

function LoadingSkeleton() {
  return (
    <div className="dashboard-stats-grid dashboard-stats-grid--loading">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="stat-card stat-card--skeleton" />
      ))}
    </div>
  );
}

function derivePositionsStatus(
  result: MT5PositionsResult | null,
): MT5PositionsStatus {
  if (result === null) return "idle";
  if (!result.success) return "error";
  if (result.totalPositions === 0) return "empty";
  return "success";
}

const DASHBOARD_MT5_TICK_POLL_MS = 500;

interface DashboardAutoRefreshSyncWatcherProps {
  onAutoSyncComplete: () => void;
}

// Isole les updates du timer auto-refresh pour eviter de rerender
// toute la page dashboard a chaque seconde.
const DashboardAutoRefreshSyncWatcher = memo(
  function DashboardAutoRefreshSyncWatcher({
    onAutoSyncComplete,
  }: DashboardAutoRefreshSyncWatcherProps) {
    const autoRefresh = useMT5AutoRefreshContext();

    useEffect(() => {
      if (!autoRefresh.lastSyncAt) return;
      onAutoSyncComplete();
    }, [autoRefresh.lastSyncAt, onAutoSyncComplete]);

    return null;
  },
);

export default function DashboardPage() {
  const settings = useUserSettings();

  const [statsResult, setStatsResult] = useState<DashboardStatsResult | null>(
    null,
  );
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState(false);

  const [positionsResult, setPositionsResult] =
    useState<MT5PositionsResult | null>(null);
  const [positionsStatus, setPositionsStatus] =
    useState<MT5PositionsStatus>("loading");
  const [positionsRefreshing, setPositionsRefreshing] = useState(false);
  const hasLoadedStatsRef = useRef(false);
  const hasLoadedPositionsRef = useRef(false);
  const positionsTickControllerRef =
    useRef<MT5PositionsTickStreamController | null>(null);
  const positionsTickErrorLoggedRef = useRef(false);

  const isRefreshing = statsRefreshing || positionsRefreshing;
  const isInitialLoading = statsLoading;

  const loadStats = useCallback(async (options?: { background?: boolean }) => {
    const isBackground = options?.background ?? false;

    if (!hasLoadedStatsRef.current && !isBackground) {
      setStatsLoading(true);
    } else {
      setStatsRefreshing(true);
    }

    setStatsError(false);

    try {
      const data = await getDashboardStats();
      startTransition(() => {
        setStatsResult(data);
      });
      hasLoadedStatsRef.current = true;
    } catch (err) {
      console.error("[DashboardPage] Erreur chargement statistiques :", err);
      setStatsError(true);
    } finally {
      setStatsLoading(false);
      setStatsRefreshing(false);
    }
  }, []);

  const loadOpenPositions = useCallback(
    async (options?: { background?: boolean }) => {
      const isBackground = options?.background ?? false;

      if (!hasLoadedPositionsRef.current && !isBackground) {
        setPositionsStatus("loading");
      } else {
        setPositionsRefreshing(true);
      }

      try {
        const result = await fetchMT5Positions();
        startTransition(() => {
          setPositionsResult(result);
          setPositionsStatus(derivePositionsStatus(result));
        });
        hasLoadedPositionsRef.current = true;
      } catch (err) {
        console.error("[DashboardPage] Erreur chargement positions MT5 :", err);
        startTransition(() => {
          setPositionsResult({
            success: false,
            positions: [],
            totalPositions: 0,
            errorCode: "UNKNOWN_MT5_ERROR",
            message: "Impossible de lire les positions ouvertes MT5.",
          });
          setPositionsStatus("error");
        });
        hasLoadedPositionsRef.current = true;
      } finally {
        setPositionsRefreshing(false);
      }
    },
    [],
  );

  const refreshDashboard = useCallback(
    async (options?: { background?: boolean }) => {
      const isBackground = options?.background ?? false;

      await Promise.all([
        loadStats({ background: isBackground }),
        loadOpenPositions({ background: isBackground }),
      ]);
    },
    [loadOpenPositions, loadStats],
  );

  const handleRefreshDashboard = useCallback(() => {
    void refreshDashboard({ background: true });
  }, [refreshDashboard]);

  const handleRetryStats = useCallback(() => {
    void loadStats();
  }, [loadStats]);

  const handleRefreshPositions = useCallback(() => {
    void loadOpenPositions({ background: true });
  }, [loadOpenPositions]);

  const handleAutoSyncComplete = useCallback(() => {
    // Auto-sync met a jour SQLite (historique/trades). Les positions ouvertes
    // affichées ici sont deja maintenues par stream tick, donc on recharge
    // uniquement les statistiques du dashboard.
    void loadStats({ background: true });
  }, [loadStats]);

  useEffect(() => {
    let cancelled = false;

    async function stopTickStream() {
      if (positionsTickControllerRef.current === null) {
        return;
      }

      const controller = positionsTickControllerRef.current;
      positionsTickControllerRef.current = null;
      await controller.stop();
    }

    async function startTickStream() {
      try {
        await stopTickStream();

        const controller = await startMT5PositionsTickStream({
          tickPollMs: DASHBOARD_MT5_TICK_POLL_MS,
          onTick: (event) => {
            if (cancelled) return;
            startTransition(() => {
              setPositionsResult(event);
              setPositionsStatus(derivePositionsStatus(event));
            });
            hasLoadedPositionsRef.current = true;

            if (!event.success && !positionsTickErrorLoggedRef.current) {
              console.error(
                "[DashboardPage] Erreur stream tick positions MT5 :",
                event.message,
              );
              positionsTickErrorLoggedRef.current = true;
            }

            if (event.success) {
              positionsTickErrorLoggedRef.current = false;
            }
          },
          onFatalError: (message) => {
            if (cancelled) return;
            console.error(
              "[DashboardPage] Stream tick MT5 interrompu :",
              message,
            );
          },
          onClose: () => {
            if (cancelled) return;
          },
        });

        if (cancelled) {
          await controller.stop();
          return;
        }

        positionsTickControllerRef.current = controller;
      } catch (err) {
        if (cancelled) return;
        console.error(
          "[DashboardPage] Impossible de demarrer le stream tick MT5 :",
          err,
        );

        // Fallback: garder comportement historique si stream indisponible.
        void loadOpenPositions({ background: true });
      }
    }

    void startTickStream();

    return () => {
      cancelled = true;
      void stopTickStream();
    };
  }, [loadOpenPositions]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  return (
    <div className="dashboard-page">
      <DashboardAutoRefreshSyncWatcher
        onAutoSyncComplete={handleAutoSyncComplete}
      />

      <div className="dashboard-header">
        <div className="dashboard-header__text">
          <h1 className="dashboard-header__title">Performances</h1>
          <p className="dashboard-header__subtitle">
            {tr(
              settings.language,
              "Statistiques calculées sur l'ensemble des trades clôturés",
              "Statistics computed across all closed trades",
            )}
          </p>
        </div>
        <button
          className="dashboard-header__refresh"
          onClick={handleRefreshDashboard}
          disabled={isInitialLoading || isRefreshing}
          title={tr(
            settings.language,
            "Rafraîchir le dashboard",
            "Refresh dashboard",
          )}
          aria-label={tr(
            settings.language,
            "Rafraîchir le dashboard",
            "Refresh dashboard",
          )}
        >
          <RefreshCw
            size={15}
            className={isInitialLoading || isRefreshing ? "spin" : ""}
          />
        </button>
      </div>

      {statsRefreshing && statsResult !== null && (
        <div
          className="dashboard-inline-status"
          role="status"
          aria-live="polite"
        >
          <RefreshCw size={14} className="spin" aria-hidden />
          <span>
            {tr(
              settings.language,
              "Mise à jour du dashboard en cours…",
              "Dashboard update in progress...",
            )}
          </span>
        </div>
      )}

      {isInitialLoading && <LoadingSkeleton />}

      {!isInitialLoading && statsError && (
        <div className="dashboard-error">
          <p>
            {tr(
              settings.language,
              "Impossible de charger les statistiques.",
              "Unable to load statistics.",
            )}
          </p>
          <button className="dashboard-error__retry" onClick={handleRetryStats}>
            {tr(settings.language, "Réessayer", "Retry")}
          </button>
        </div>
      )}

      {!isInitialLoading && !statsError && statsResult !== null && (
        <DashboardStatsGrid
          result={statsResult}
          currency={settings.defaultCurrency}
        />
      )}

      <section className="dashboard-section">
        <div className="dashboard-section__header">
          <div className="dashboard-section__text">
            <div className="dashboard-section__eyebrow">
              <Waves size={14} aria-hidden />
              <span>MetaTrader 5</span>
            </div>
            <h2 className="dashboard-section__title">
              {tr(settings.language, "Positions ouvertes", "Open positions")}
            </h2>
          </div>

          <div className="dashboard-section__actions">
            <button
              className="dashboard-header__refresh"
              onClick={handleRefreshPositions}
              disabled={positionsStatus === "loading" || positionsRefreshing}
              title={tr(
                settings.language,
                "Actualiser les positions ouvertes",
                "Refresh open positions",
              )}
              aria-label={tr(
                settings.language,
                "Actualiser les positions ouvertes",
                "Refresh open positions",
              )}
            >
              <RefreshCw
                size={15}
                className={
                  positionsStatus === "loading" || positionsRefreshing
                    ? "spin"
                    : ""
                }
              />
            </button>
          </div>
        </div>

        <MT5OpenPositionsPreview
          status={positionsStatus}
          result={positionsResult}
        />
      </section>
    </div>
  );
}
