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
  getDisconnectedMT5SourceKeys,
  isMT5SourceConnected,
  resolveMT5TerminalSources,
  setMT5SourceConnected,
  sourceKeyFromTerminalPath,
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

interface MT5PositionsSourceEntry {
  key: string;
  terminalPath: string | null;
  label: string;
  connected: boolean;
  result: MT5PositionsResult | null;
  status: MT5PositionsStatus;
}

function extractTerminalLabel(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  const last = segments.length > 0 ? segments[segments.length - 1] : path;
  return last.toLowerCase().endsWith(".exe") ? last.slice(0, -4) : last;
}

function buildSourceLabel(
  language: "fr" | "en",
  terminalPath: string | null,
  index: number,
  accountId?: string,
): string {
  if (accountId && accountId.trim() !== "") {
    return `${tr(language, "Compte", "Account")} ${accountId.trim()}`;
  }

  if (terminalPath === null) {
    return tr(language, "Terminal MT5 actif", "Active MT5 terminal");
  }

  return `${tr(language, "Terminal", "Terminal")} ${index + 1} — ${extractTerminalLabel(terminalPath)}`;
}

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

  const [positionsSources, setPositionsSources] = useState<
    MT5PositionsSourceEntry[]
  >([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [positionsRefreshing, setPositionsRefreshing] = useState(false);
  const [connectionUpdateKey, setConnectionUpdateKey] = useState(0);
  const [togglePendingKey, setTogglePendingKey] = useState<string | null>(null);
  const connectedAccountIdsRef = useRef<string[]>([]);
  const hasLoadedStatsRef = useRef(false);
  const hasLoadedPositionsRef = useRef(false);
  const positionsTickControllersRef = useRef<
    Map<string, MT5PositionsTickStreamController>
  >(new Map());
  const positionsTickErrorLoggedRef = useRef(false);

  const isRefreshing = statsRefreshing || positionsRefreshing;
  const isInitialLoading = statsLoading;

  const loadStats = useCallback(
    async (options?: { background?: boolean; accountIds?: string[] }) => {
      const isBackground = options?.background ?? false;
      const activeAccountIds =
        options?.accountIds ?? connectedAccountIdsRef.current;

      if (!hasLoadedStatsRef.current && !isBackground) {
        setStatsLoading(true);
      } else {
        setStatsRefreshing(true);
      }

      setStatsError(false);

      try {
        if (activeAccountIds.length === 0) {
          startTransition(() => {
            setStatsResult({ isEmpty: true, stats: null });
          });
          hasLoadedStatsRef.current = true;
          return;
        }

        const data = await getDashboardStats({ accountIds: activeAccountIds });
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
    },
    [],
  );

  const loadOpenPositions = useCallback(
    async (options?: { background?: boolean }) => {
      const isBackground = options?.background ?? false;

      const [sources, disconnectedKeys] = await Promise.all([
        resolveMT5TerminalSources(),
        getDisconnectedMT5SourceKeys(),
      ]);

      const entriesTemplate = sources.map((terminalPath, index) => {
        const connected = isMT5SourceConnected(terminalPath, disconnectedKeys);
        return {
          key: sourceKeyFromTerminalPath(terminalPath),
          terminalPath,
          connected,
          label: buildSourceLabel(settings.language, terminalPath, index),
          result: null,
          status: connected ? "loading" : "idle",
        } satisfies MT5PositionsSourceEntry;
      });

      if (!hasLoadedPositionsRef.current && !isBackground) {
        setPositionsLoading(true);
        startTransition(() => {
          setPositionsSources(entriesTemplate);
        });
      } else {
        setPositionsRefreshing(true);
      }

      try {
        const results = await Promise.all(
          entriesTemplate.map(async (entry, index) => {
            if (!entry.connected) {
              return entry;
            }

            const result = await fetchMT5Positions({
              terminalPath: entry.terminalPath ?? undefined,
            });

            return {
              ...entry,
              label: buildSourceLabel(
                settings.language,
                entry.terminalPath,
                index,
                result.accountId,
              ),
              result,
              status: derivePositionsStatus(result),
            } satisfies MT5PositionsSourceEntry;
          }),
        );

        const accountIds = [
          ...new Set(
            results
              .filter((entry) => entry.connected)
              .map((entry) => entry.result?.accountId?.trim() ?? "")
              .filter((value) => value !== ""),
          ),
        ];

        connectedAccountIdsRef.current = accountIds;
        startTransition(() => {
          setPositionsSources(results);
        });
        hasLoadedPositionsRef.current = true;
        return accountIds;
      } catch (err) {
        console.error("[DashboardPage] Erreur chargement positions MT5 :", err);
        connectedAccountIdsRef.current = [];
        startTransition(() => {
          setPositionsSources([
            {
              key: sourceKeyFromTerminalPath(null),
              terminalPath: null,
              connected: true,
              label: tr(
                settings.language,
                "Terminal MT5 actif",
                "Active MT5 terminal",
              ),
              result: {
                success: false,
                positions: [],
                totalPositions: 0,
                errorCode: "UNKNOWN_MT5_ERROR",
                message: "Impossible de lire les positions ouvertes MT5.",
              },
              status: "error",
            },
          ]);
        });
        hasLoadedPositionsRef.current = true;
        return [];
      } finally {
        setPositionsLoading(false);
        setPositionsRefreshing(false);
      }
    },
    [settings.language],
  );

  const refreshDashboard = useCallback(
    async (options?: { background?: boolean }) => {
      const isBackground = options?.background ?? false;
      const accountIds = await loadOpenPositions({ background: isBackground });
      await loadStats({ background: isBackground, accountIds });
    },
    [loadOpenPositions, loadStats],
  );

  const handleRefreshDashboard = useCallback(() => {
    void refreshDashboard({ background: true });
  }, [refreshDashboard]);

  const handleRetryStats = useCallback(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  const handleRefreshPositions = useCallback(() => {
    void refreshDashboard({ background: true });
  }, [refreshDashboard]);

  const handleToggleSourceConnection = useCallback(
    async (source: MT5PositionsSourceEntry) => {
      const nextConnected = !source.connected;
      setTogglePendingKey(source.key);

      try {
        await setMT5SourceConnected(source.terminalPath, nextConnected);
        setConnectionUpdateKey((value) => value + 1);
        await refreshDashboard({ background: true });
      } finally {
        setTogglePendingKey(null);
      }
    },
    [refreshDashboard],
  );

  const handleAutoSyncComplete = useCallback(() => {
    void loadStats({ background: true });
  }, [loadStats]);

  useEffect(() => {
    let cancelled = false;

    async function stopTickStreams() {
      const controllers = [...positionsTickControllersRef.current.values()];
      positionsTickControllersRef.current.clear();
      await Promise.all(
        controllers.map(async (controller) => controller.stop()),
      );
    }

    function upsertTickEvent(
      key: string,
      terminalPath: string | null,
      event: MT5PositionsResult,
      index: number,
    ) {
      setPositionsSources((current) => {
        const next = [...current];
        const entryIndex = next.findIndex((entry) => entry.key === key);
        const label = buildSourceLabel(
          settings.language,
          terminalPath,
          index,
          event.accountId,
        );

        const nextEntry: MT5PositionsSourceEntry = {
          key,
          terminalPath,
          connected: true,
          label,
          result: event,
          status: derivePositionsStatus(event),
        };

        if (entryIndex >= 0) {
          next[entryIndex] = nextEntry;
          return next;
        }

        next.push(nextEntry);
        return next;
      });
    }

    async function startTickStreams() {
      try {
        await stopTickStreams();

        const [sources, disconnectedKeys] = await Promise.all([
          resolveMT5TerminalSources(),
          getDisconnectedMT5SourceKeys(),
        ]);
        const connectedSources = sources.filter((terminalPath) =>
          isMT5SourceConnected(terminalPath, disconnectedKeys),
        );

        for (let index = 0; index < connectedSources.length; index += 1) {
          const terminalPath = connectedSources[index];
          const key = sourceKeyFromTerminalPath(terminalPath);

          try {
            const controller = await startMT5PositionsTickStream({
              tickPollMs: DASHBOARD_MT5_TICK_POLL_MS,
              terminalPath: terminalPath ?? undefined,
              onTick: (event) => {
                if (cancelled) return;
                startTransition(() => {
                  upsertTickEvent(key, terminalPath, event, index);
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

            positionsTickControllersRef.current.set(key, controller);
          } catch (err) {
            if (cancelled) return;

            console.error(
              "[DashboardPage] Impossible de demarrer stream source MT5 :",
              err,
            );

            // Fallback source par source: on force un refresh ponctuel.
            void loadOpenPositions({ background: true });
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error(
          "[DashboardPage] Impossible de demarrer le stream tick MT5 :",
          err,
        );

        // Fallback global: garder comportement historique si stream indisponible.
        void loadOpenPositions({ background: true });
      }
    }

    void startTickStreams();

    return () => {
      cancelled = true;
      void stopTickStreams();
    };
  }, [connectionUpdateKey, loadOpenPositions, settings.language]);

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
              "Statistiques calculées sur les comptes MT5 connectés (trades clôturés)",
              "Statistics computed from connected MT5 accounts (closed trades)",
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
              disabled={positionsLoading || positionsRefreshing}
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
                  positionsLoading || positionsRefreshing ? "spin" : ""
                }
              />
            </button>
          </div>
        </div>

        {positionsSources.length === 0 ? (
          <MT5OpenPositionsPreview status="idle" result={null} />
        ) : (
          positionsSources.map((source) => (
            <div key={source.key} className="dashboard-mt5-source">
              <div className="dashboard-mt5-source__header">
                <h3 className="dashboard-mt5-source__title">{source.label}</h3>
                <button
                  type="button"
                  className={source.connected ? "btn-danger" : "btn-secondary"}
                  disabled={togglePendingKey === source.key}
                  onClick={() => {
                    void handleToggleSourceConnection(source);
                  }}
                >
                  {togglePendingKey === source.key
                    ? tr(settings.language, "Mise à jour…", "Updating...")
                    : source.connected
                      ? tr(settings.language, "Déconnecter", "Disconnect")
                      : tr(settings.language, "Reconnecter", "Reconnect")}
                </button>
              </div>

              {!source.connected && (
                <p className="dashboard-mt5-source__status">
                  {tr(
                    settings.language,
                    "Compte déconnecté : exclu de l'auto-sync et des statistiques.",
                    "Disconnected account: excluded from auto-sync and statistics.",
                  )}
                </p>
              )}

              <MT5OpenPositionsPreview
                status={source.status}
                result={source.result}
              />
            </div>
          ))
        )}
      </section>
    </div>
  );
}
