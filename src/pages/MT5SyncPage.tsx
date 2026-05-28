// ============================================================
// MT5SyncPage — Synchronisation MetaTrader 5
// ============================================================
// Phase 6 Étapes 2, 3, 4, 5 & 9 — Bridge + Historique + Positions + Import SQLite + Auto-refresh.
//
// Cette page permet :
//   ✓ Vérifier si Python + MetaTrader5 sont installés
//   ✓ Vérifier si le terminal MT5 est ouvert et connecté
//   ✓ Afficher les informations du compte MT5
//   ✓ Charger l'historique des deals MT5 (prévisualisation)
//   ✓ Choisir la période : Aujourd'hui / 7j / 30j / personnalisé
//   ✓ Afficher les positions actuellement ouvertes (prévisualisation)
//   ✓ Synchroniser les trades MT5 vers SQLite (déduplication + import)
//   ✓ Synchronisation automatique périodique (Étape 9)
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Terminal,
  Timer,
  User,
  Server,
  Building2,
  CircleDot,
  Info,
  History,
  Layers,
  Database,
} from "lucide-react";
import {
  buildMT5ResultError,
  checkMT5Connection,
  fetchMT5History,
  fetchMT5Positions,
  getMT5SyncHistory,
  runMT5Sync,
  startMT5PositionsTickStream,
  type MT5PositionsTickStreamController,
} from "../services/mt5";
import { useNotification } from "../hooks";
import { useMT5AutoRefreshContext } from "../features/mt5/context/MT5AutoRefreshContext";
import MT5DateRangeSelector from "../features/mt5/components/MT5DateRangeSelector";
import MT5HistoryPreview from "../features/mt5/components/MT5HistoryPreview";
import MT5OpenPositionsPreview from "../features/mt5/components/MT5OpenPositionsPreview";
import { MT5AutoRefreshControls } from "../features/mt5/components/MT5AutoRefreshControls";
import { MT5ErrorPanel } from "../features/mt5/components/MT5ErrorPanel";
import { MT5LastSyncSummary } from "../features/mt5/components/MT5LastSyncSummary";
import { MT5SyncHistory } from "../features/mt5/components/MT5SyncHistory";
import { MT5SyncStatus as MT5SyncStatusBar } from "../features/mt5/components/MT5SyncStatus";
import { MT5SyncSummary } from "../features/mt5/components/MT5SyncSummary";
import type { MT5SyncLog } from "../repositories/mt5SyncLogsRepository";
import type {
  MT5BridgeCheckResult,
  MT5CheckStatus,
  MT5HistoryPeriod,
  MT5HistoryResult,
  MT5HistoryStatus,
  MT5PositionsResult,
  MT5PositionsStatus,
  MT5SyncReport,
  MT5SyncStatus,
} from "../types/mt5";
import { inferTradingAccountTypeFromText } from "../services/tradingAccounts/accountTypeInference";

const MT5_TICK_INTERVAL_OPTIONS_MS = [250, 500, 1000] as const;

// ─── Sous-composants ──────────────────────────────────────

/** Indicateur visuel de statut de la connexion. */
function StatusIndicator({ status }: { status: MT5CheckStatus }) {
  if (status === "idle") {
    return (
      <div className="mt5-status mt5-status--idle">
        <CircleDot size={14} aria-hidden />
        <span>En attente de vérification</span>
      </div>
    );
  }
  if (status === "checking") {
    return (
      <div className="mt5-status mt5-status--checking">
        <RefreshCw size={14} className="mt5-status__spinner" aria-hidden />
        <span>Vérification en cours…</span>
      </div>
    );
  }
  if (status === "connected") {
    return (
      <div className="mt5-status mt5-status--connected">
        <CheckCircle2 size={14} aria-hidden />
        <span>Connecté à MetaTrader 5</span>
      </div>
    );
  }
  if (status === "partial") {
    return (
      <div className="mt5-status mt5-status--partial">
        <AlertCircle size={14} aria-hidden />
        <span>MetaTrader 5 détecté (hors ligne)</span>
      </div>
    );
  }
  return (
    <div className="mt5-status mt5-status--error">
      <XCircle size={14} aria-hidden />
      <span>MetaTrader 5 non disponible</span>
    </div>
  );
}

/** Carte affichant les informations du compte MT5 quand la connexion est OK. */
function MT5AccountCard({ result }: { result: MT5BridgeCheckResult }) {
  const rows: Array<{ icon: React.ReactNode; label: string; value: string }> =
    [];
  const inferredAccountType = inferTradingAccountTypeFromText(
    result.server,
    result.accountName,
    result.company,
  );

  if (result.account !== undefined) {
    rows.push({
      icon: <User size={13} aria-hidden />,
      label: "Compte",
      value: `${result.account}${result.accountName ? ` — ${result.accountName}` : ""}`,
    });
  }
  if (result.server) {
    rows.push({
      icon: <Server size={13} aria-hidden />,
      label: "Serveur",
      value: result.server,
    });
  }
  if (result.company) {
    rows.push({
      icon: <Building2 size={13} aria-hidden />,
      label: "Broker",
      value: result.company,
    });
  }
  if (result.currency) {
    rows.push({
      icon: <CircleDot size={13} aria-hidden />,
      label: "Devise",
      value: result.currency,
    });
  }
  if (inferredAccountType !== "other") {
    rows.push({
      icon: <Info size={13} aria-hidden />,
      label: "Type de compte",
      value: inferredAccountType === "demo" ? "Demo" : "Live",
    });
  }
  if (result.terminalVersion) {
    rows.push({
      icon: <Terminal size={13} aria-hidden />,
      label: "Version",
      value: result.terminalVersion,
    });
  }

  return (
    <div className="mt5-account-card">
      <p className="mt5-account-card__message">{result.message}</p>
      {rows.length > 0 && (
        <dl className="mt5-account-card__rows">
          {rows.map((row) => (
            <div key={row.label} className="mt5-account-card__row">
              <dt className="mt5-account-card__label">
                {row.icon}
                {row.label}
              </dt>
              <dd className="mt5-account-card__value">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Carte affichant l'erreur + les étapes de résolution. */
function MT5ErrorCard({ result }: { result: MT5BridgeCheckResult }) {
  return (
    <MT5ErrorPanel
      errorCode={result.errorCode}
      message={result.message}
      className="mt5-error-card"
    />
  );
}

/** Carte informative "hors ligne" quand MT5 est détecté mais pas connecté. */
function MT5PartialCard({ result }: { result: MT5BridgeCheckResult }) {
  return (
    <div className="mt5-partial-card">
      <div className="mt5-partial-card__header">
        <AlertCircle size={14} className="mt5-partial-card__icon" aria-hidden />
        <p className="mt5-partial-card__message">{result.message}</p>
      </div>
      {result.terminalVersion && (
        <p className="mt5-partial-card__version">
          <Terminal size={12} aria-hidden />
          {result.terminalVersion}
        </p>
      )}
      <p className="mt5-partial-card__hint">
        Connectez-vous à votre compte dans MetaTrader 5, puis cliquez à nouveau
        sur Vérifier.
      </p>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────

export default function MT5SyncPage() {
  const notify = useNotification();
  const positionsFetchInFlightRef = useRef(false);
  const positionsLiveErrorNotifiedRef = useRef(false);
  const positionsTickControllerRef =
    useRef<MT5PositionsTickStreamController | null>(null);
  const positionsTickErrorNotifiedRef = useRef(false);

  // ── État vérification connexion ────────────────────────
  const [checkStatus, setCheckStatus] = useState<MT5CheckStatus>("idle");
  const [checkResult, setCheckResult] = useState<MT5BridgeCheckResult | null>(
    null,
  );

  // ── État historique MT5 ────────────────────────────────
  const [historyStatus, setHistoryStatus] = useState<MT5HistoryStatus>("idle");
  const [historyResult, setHistoryResult] = useState<MT5HistoryResult | null>(
    null,
  );

  // ── État positions ouvertes MT5 ────────────────────────
  const [positionsStatus, setPositionsStatus] =
    useState<MT5PositionsStatus>("idle");
  const [positionsResult, setPositionsResult] =
    useState<MT5PositionsResult | null>(null);
  const [positionsTickEnabled, setPositionsTickEnabled] = useState(true);
  const [positionsTickPollMs, setPositionsTickPollMs] = useState<number>(250);
  const [positionsTickActive, setPositionsTickActive] = useState(false);

  // ── État synchronisation MT5 ───────────────────────────
  const [syncStatus, setSyncStatus] = useState<MT5SyncStatus>("idle");
  const [syncReport, setSyncReport] = useState<MT5SyncReport | null>(null);
  const [syncLogs, setSyncLogs] = useState<MT5SyncLog[]>([]);
  const [syncLogsLoading, setSyncLogsLoading] = useState(false);

  // ── Auto-refresh MT5 ───────────────────────────────────
  // Consomme le contexte global monté dans AppLayout.
  // Le hook useMT5AutoRefresh vit dans AppLayout → le timer persiste
  // quelle que soit la page active.
  const autoRefresh = useMT5AutoRefreshContext();

  useEffect(() => {
    void loadSyncLogs(false); // chargement de fond silencieux au montage

    // Signale au contexte que la page est montée → les toasts automatiques
    // sont supprimés pendant que la page affiche ses propres résultats.
    autoRefresh.setPageMounted(true);
    return () => {
      autoRefresh.setPageMounted(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recharge les logs quand une sync automatique (fond) se termine.
  // lastSyncAt change dès qu'une sync fond s'effectue.
  useEffect(() => {
    if (autoRefresh.lastSyncAt) {
      void loadSyncLogs(false);
    }
  }, [autoRefresh.lastSyncAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────

  async function loadSyncLogs(notifyOnError = true) {
    setSyncLogsLoading(true);
    try {
      const logs = await getMT5SyncHistory(10);
      setSyncLogs(logs);
    } catch (err) {
      console.error("[MT5SyncPage] Erreur chargement logs MT5 :", err);
      if (notifyOnError) {
        notify.error(
          "Impossible de charger l'historique des synchronisations MT5.",
        );
      }
    } finally {
      setSyncLogsLoading(false);
    }
  }

  async function handleCheck() {
    setCheckStatus("checking");
    setCheckResult(null);

    try {
      const result = await checkMT5Connection();
      setCheckResult(result);

      if (result.success && result.terminalConnected) {
        setCheckStatus("connected");
        notify.success("MetaTrader 5 détecté et connecté.");
      } else if (result.success) {
        // MT5 détecté mais terminal hors ligne
        setCheckStatus("partial");
        notify.warning(
          "MetaTrader 5 détecté mais non connecté au serveur broker.",
        );
      } else {
        setCheckStatus("error");
      }
    } catch (err) {
      const mt5Error = buildMT5ResultError({
        code: "UNKNOWN_MT5_ERROR",
        message: String(err),
        technicalDetails: err,
        context: "ui-check",
      });
      setCheckResult({
        success: false,
        terminalConnected: false,
        errorCode: mt5Error.errorCode,
        message: mt5Error.message,
      });
      setCheckStatus("error");
      notify.error("Impossible de lancer la vérification MT5.");
    }
  }

  /**
   * Lit les positions actuellement ouvertes dans MT5.
   * LECTURE SEULE — aucun import dans SQLite à cette étape.
   */
  async function fetchPositions(options?: {
    silent?: boolean;
    resetPrevious?: boolean;
  }) {
    const silent = options?.silent ?? false;
    const resetPrevious = options?.resetPrevious ?? false;

    if (positionsFetchInFlightRef.current) {
      return;
    }

    positionsFetchInFlightRef.current = true;

    if (!silent) {
      setPositionsStatus("loading");
      if (resetPrevious) {
        setPositionsResult(null);
      }
    }

    try {
      const result = await fetchMT5Positions();
      setPositionsResult(result);

      if (!result.success) {
        setPositionsStatus("error");
        // Evite spam de toasts pendant refresh live en cas d'erreur persistante.
        if (!silent || !positionsLiveErrorNotifiedRef.current) {
          notify.error(`Erreur MT5 positions : ${result.message}`);
        }
        if (silent) {
          positionsLiveErrorNotifiedRef.current = true;
        }
      } else if (result.totalPositions === 0) {
        setPositionsStatus("empty");
        positionsLiveErrorNotifiedRef.current = false;
        if (!silent) {
          notify.info("Aucune position ouverte sur ce compte.");
        }
      } else {
        setPositionsStatus("success");
        positionsLiveErrorNotifiedRef.current = false;
        if (!silent) {
          notify.success(
            `${result.totalPositions} position(s) ouverte(s) lue(s) depuis MT5.`,
          );
        }
      }
    } catch (err) {
      const mt5Error = buildMT5ResultError({
        code: "UNKNOWN_MT5_ERROR",
        message: String(err),
        technicalDetails: err,
        context: "ui-positions",
      });
      setPositionsResult({
        success: false,
        positions: [],
        totalPositions: 0,
        errorCode: mt5Error.errorCode,
        message: mt5Error.message,
      });
      setPositionsStatus("error");
      if (!silent || !positionsLiveErrorNotifiedRef.current) {
        notify.error("Erreur lors de la lecture des positions MT5.");
      }
      if (silent) {
        positionsLiveErrorNotifiedRef.current = true;
      }
    } finally {
      positionsFetchInFlightRef.current = false;
    }
  }

  async function handleFetchPositions() {
    await fetchPositions({ silent: false, resetPrevious: true });
  }

  async function stopPositionsTickStream() {
    if (positionsTickControllerRef.current === null) {
      return;
    }

    const controller = positionsTickControllerRef.current;
    positionsTickControllerRef.current = null;
    setPositionsTickActive(false);
    await controller.stop();
  }

  // Mode tick reel: stream continu des positions, emission a chaque tick detecte.
  useEffect(() => {
    let cancelled = false;

    if (checkStatus !== "connected" || !positionsTickEnabled) {
      void stopPositionsTickStream();
      return;
    }

    setPositionsStatus((current) => (current === "idle" ? "loading" : current));

    void (async () => {
      try {
        await stopPositionsTickStream();
        const controller = await startMT5PositionsTickStream({
          tickPollMs: positionsTickPollMs,
          onTick: (event) => {
            if (cancelled) return;

            setPositionsResult(event);

            if (!event.success) {
              setPositionsStatus("error");
              if (!positionsTickErrorNotifiedRef.current) {
                notify.error(`Erreur stream MT5 positions : ${event.message}`);
              }
              positionsTickErrorNotifiedRef.current = true;
              return;
            }

            positionsTickErrorNotifiedRef.current = false;
            setPositionsStatus(
              event.totalPositions === 0 ? "empty" : "success",
            );
          },
          onFatalError: (message) => {
            if (cancelled) return;
            setPositionsStatus("error");
            if (!positionsTickErrorNotifiedRef.current) {
              notify.error(`Stream tick MT5 interrompu : ${message}`);
            }
            positionsTickErrorNotifiedRef.current = true;
          },
          onClose: () => {
            if (cancelled) return;
            setPositionsTickActive(false);
          },
        });

        if (cancelled) {
          await controller.stop();
          return;
        }

        positionsTickControllerRef.current = controller;
        setPositionsTickActive(controller.isActive());
      } catch (err) {
        if (cancelled) return;
        setPositionsTickActive(false);
        setPositionsStatus("error");
        notify.error(
          `Impossible de demarrer le mode tick MT5 : ${String(err)}`,
        );
      }
    })();

    return () => {
      cancelled = true;
      void stopPositionsTickStream();
    };
  }, [checkStatus, positionsTickEnabled, positionsTickPollMs]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggleTickMode() {
    setPositionsTickEnabled((current) => !current);
  }

  function handleTickPollMsChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    setPositionsTickPollMs(value);
  }

  /**
   * Synchronise les trades MT5 vers SQLite.
   * Lit historique + positions, déduplique et insère/met à jour.
   */
  async function handleSync() {
    setSyncStatus("syncing");
    setSyncReport(null);

    try {
      const report = await runMT5Sync({ period: "30d" });
      setSyncReport(report);

      if (!report.success) {
        setSyncStatus("error");
        notify.error(`Synchronisation échouée : ${report.message}`);
      } else if (report.errors > 0) {
        setSyncStatus("partial");
        notify.warning(
          `Synchronisation partielle : ${report.errors} erreur(s).`,
        );
      } else {
        setSyncStatus("success");
        if (report.inserted > 0 || report.updated > 0) {
          notify.success(
            `${report.inserted} trade(s) importé(s), ${report.updated} mis à jour.`,
          );
        } else {
          notify.info("Synchronisation terminée. Aucun nouveau trade.");
        }
      }
    } catch (err) {
      const mt5Error = buildMT5ResultError({
        code: "UNKNOWN_MT5_ERROR",
        message: String(err),
        technicalDetails: err,
        context: "ui-sync",
      });
      setSyncReport({
        success: false,
        period: "30d",
        dealsRead: 0,
        positionsRead: 0,
        candidatesFromHistory: 0,
        candidatesFromPositions: 0,
        detectedNew: 0,
        detectedExisting: 0,
        detectedUpdates: 0,
        detectedProbableDuplicates: 0,
        detectedInvalid: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: 1,
        errorMessages: [mt5Error.message],
        detectionMessages: [],
        message: mt5Error.message,
        syncedAt: new Date().toISOString(),
      });
      setSyncStatus("error");
      notify.error("Erreur inattendue lors de la synchronisation.");
    } finally {
      await loadSyncLogs();
    }
  }

  /**
   * Charge l'historique des deals MT5 pour la période demandée.
   * LECTURE SEULE — aucun import dans SQLite à cette étape.
   */
  async function handleFetchHistory(
    period: MT5HistoryPeriod,
    fromDate: string | null,
    toDate: string | null,
  ) {
    setHistoryStatus("loading");
    setHistoryResult(null);

    try {
      const result = await fetchMT5History(period, fromDate, toDate);
      setHistoryResult(result);

      if (!result.success) {
        setHistoryStatus("error");
        notify.error(`Erreur MT5 : ${result.message}`);
      } else if (result.totalDeals === 0) {
        setHistoryStatus("empty");
        notify.info("Aucun deal trouvé sur la période sélectionnée.");
      } else {
        setHistoryStatus("success");
        notify.success(`${result.totalDeals} deal(s) chargé(s) depuis MT5.`);
      }
    } catch (err) {
      const mt5Error = buildMT5ResultError({
        code: "UNKNOWN_MT5_ERROR",
        message: String(err),
        technicalDetails: err,
        context: "ui-history",
      });
      setHistoryResult({
        success: false,
        deals: [],
        totalDeals: 0,
        errorCode: mt5Error.errorCode,
        message: mt5Error.message,
      });
      setHistoryStatus("error");
      notify.error("Erreur lors du chargement de l'historique MT5.");
    }
  }

  // ── Rendu ──────────────────────────────────────────────

  return (
    <div className="content-max">
      {/* ── En-tête de page ─────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Synchronisation MT5</h1>
          <p className="page-subtitle">
            Connexion locale à MetaTrader 5 via un bridge Python. Lecture seule
            — aucun ordre ne peut être passé depuis TradingBook.
          </p>
        </div>
      </div>

      {/* ── Section : état de la connexion ──────────────── */}
      <section className="page-section">
        <h2 className="import-section-title">
          <Activity size={15} aria-hidden />
          État du bridge MT5
        </h2>

        <div className="mt5-bridge-panel">
          {/* Indicateur de statut */}
          <div className="mt5-bridge-panel__status-row">
            <StatusIndicator status={checkStatus} />

            {/* Bouton de vérification */}
            <button
              className="btn-primary mt5-bridge-panel__check-btn"
              onClick={() => void handleCheck()}
              disabled={checkStatus === "checking"}
              aria-busy={checkStatus === "checking"}
            >
              {checkStatus === "checking" ? (
                <>
                  <RefreshCw
                    size={14}
                    className="mt5-status__spinner"
                    aria-hidden
                  />
                  Vérification…
                </>
              ) : (
                <>
                  <Activity size={14} aria-hidden />
                  {checkStatus === "idle"
                    ? "Vérifier la connexion"
                    : "Revérifier"}
                </>
              )}
            </button>
          </div>

          {/* Résultat de la vérification */}
          {checkResult !== null && (
            <div className="mt5-bridge-panel__result">
              {checkStatus === "connected" && (
                <MT5AccountCard result={checkResult} />
              )}
              {checkStatus === "partial" && (
                <MT5PartialCard result={checkResult} />
              )}
              {checkStatus === "error" && <MT5ErrorCard result={checkResult} />}
            </div>
          )}
        </div>
      </section>

      {/* ── Section : synchronisation automatique ───────── */}
      <section className="page-section">
        <h2 className="import-section-title">
          <Timer size={15} aria-hidden />
          Synchronisation automatique
        </h2>

        <p className="mt5-sync-description">
          TradingBook peut synchroniser automatiquement vos trades MT5 à
          intervalles réguliers. La synchronisation manuelle reste toujours
          disponible. Aucun ordre ne peut être passé depuis TradingBook.
        </p>

        <div className="mt5-autorefresh-panel">
          <MT5AutoRefreshControls
            enabled={autoRefresh.enabled}
            interval={autoRefresh.interval}
            isSyncing={autoRefresh.isSyncing}
            settingsLoaded={autoRefresh.settingsLoaded}
            onEnable={autoRefresh.enableAutoRefresh}
            onDisable={autoRefresh.disableAutoRefresh}
            onChangeInterval={autoRefresh.changeInterval}
          />

          <MT5SyncStatusBar
            enabled={autoRefresh.enabled}
            isSyncing={autoRefresh.isSyncing}
            lastSyncAt={autoRefresh.lastSyncAt}
            secondsUntilNext={autoRefresh.secondsUntilNext}
          />
        </div>
      </section>

      {/* ── Section : synchronisation MT5 ───────────────── */}
      <section className="page-section">
        <h2 className="import-section-title">
          <Database size={15} aria-hidden />
          Synchronisation MT5
        </h2>

        <p className="mt5-sync-description">
          Importe les trades des 30 derniers jours depuis MetaTrader 5 vers
          TradingBook. Les doublons sont automatiquement ignorés. Les positions
          ouvertes sont mises à jour si leur P&amp;L a changé.
        </p>

        {/* Avertissement si MT5 non connecté */}
        {checkStatus !== "connected" && (
          <div className="mt5-history-notice">
            <AlertCircle size={13} aria-hidden />
            <span>
              Vérifiez la connexion MT5 ci-dessus avant de synchroniser.
            </span>
          </div>
        )}

        <div className="mt5-sync-actions">
          <button
            className="btn-primary"
            onClick={() => void handleSync()}
            disabled={syncStatus === "syncing" || autoRefresh.isSyncing}
            aria-busy={syncStatus === "syncing" || autoRefresh.isSyncing}
          >
            {syncStatus === "syncing" ? (
              <>
                <RefreshCw
                  size={14}
                  className="mt5-status__spinner"
                  aria-hidden
                />
                Synchronisation…
              </>
            ) : (
              <>
                <Database size={14} aria-hidden />
                {syncStatus === "idle" ? "Synchroniser MT5" : "Re-synchroniser"}
              </>
            )}
          </button>
        </div>

        <MT5SyncSummary status={syncStatus} report={syncReport} />
        <MT5LastSyncSummary
          log={syncLogs[0] ?? null}
          loading={syncLogsLoading}
        />
        <MT5SyncHistory
          logs={syncLogs}
          loading={syncLogsLoading}
          onRefresh={() => void loadSyncLogs()}
        />
      </section>

      {/* ── Section : positions ouvertes MT5 ────────────── */}
      <section className="page-section">
        <h2 className="import-section-title">
          <Layers size={15} aria-hidden />
          Positions ouvertes MT5
        </h2>

        <p className="mt5-sync-description">
          Mode tick reel: stream continu des positions ouvertes. Mise a jour
          declenchee sur tick detecte par le bridge Python local.
        </p>

        {/* Avertissement si MT5 non connecté */}
        {checkStatus !== "connected" && (
          <div className="mt5-history-notice">
            <AlertCircle size={13} aria-hidden />
            <span>
              Vérifiez la connexion MT5 ci-dessus avant de lire les positions.
            </span>
          </div>
        )}

        <div className="mt5-autorefresh-panel">
          <div className="mt5-autorefresh">
            <div className="mt5-autorefresh__row">
              <div className="mt5-autorefresh__label-group">
                <Activity
                  size={14}
                  className="mt5-autorefresh__icon"
                  aria-hidden
                />
                <span className="mt5-autorefresh__label">
                  Mode tick positions
                </span>
              </div>

              <label
                className="mt5-toggle"
                aria-label="Activer ou désactiver le mode tick positions"
              >
                <input
                  type="checkbox"
                  className="mt5-toggle__input"
                  checked={positionsTickEnabled}
                  onChange={handleToggleTickMode}
                  disabled={checkStatus !== "connected"}
                />
                <span className="mt5-toggle__track" aria-hidden />
              </label>
            </div>

            <div className="mt5-autorefresh__row mt5-autorefresh__row--sub">
              <label
                className="mt5-autorefresh__sublabel"
                htmlFor="mt5-positions-tick-poll-ms"
              >
                Frequence de detection tick
              </label>
              <select
                id="mt5-positions-tick-poll-ms"
                className="mt5-autorefresh__select"
                value={positionsTickPollMs}
                onChange={handleTickPollMsChange}
                disabled={!positionsTickEnabled || checkStatus !== "connected"}
              >
                {MT5_TICK_INTERVAL_OPTIONS_MS.map((ms) => (
                  <option key={ms} value={ms}>
                    {ms} ms
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt5-sync-status">
            <span
              className={`mt5-sync-status__badge ${positionsTickActive ? "mt5-sync-status__badge--on" : "mt5-sync-status__badge--off"}`}
            >
              {positionsTickActive ? "Tick actif" : "Tick inactif"}
            </span>
            <span className="mt5-sync-status__meta">
              {positionsTickActive
                ? `Polling bridge: ${positionsTickPollMs} ms`
                : "Activez mode tick pour stream temps reel."}
            </span>
          </div>
        </div>

        {/* Bouton d'actualisation */}
        <div className="mt5-positions-section">
          <button
            className="btn-primary mt5-positions-refresh-btn"
            onClick={() => void handleFetchPositions()}
            disabled={positionsStatus === "loading" || positionsTickActive}
            aria-busy={positionsStatus === "loading" || positionsTickActive}
          >
            {positionsStatus === "loading" ? (
              <>
                <RefreshCw
                  size={14}
                  className="mt5-status__spinner"
                  aria-hidden
                />
                Lecture en cours…
              </>
            ) : (
              <>
                <Layers size={14} aria-hidden />
                {positionsTickActive
                  ? "Mode tick actif"
                  : "Actualiser les positions"}
              </>
            )}
          </button>
        </div>

        {/* Prévisualisation des positions */}
        <div className="mt5-history-preview-wrapper">
          <MT5OpenPositionsPreview
            status={positionsStatus}
            result={positionsResult}
          />
        </div>
      </section>

      {/* ── Section : historique des deals MT5 ─────────── */}
      <section className="page-section">
        <h2 className="import-section-title">
          <History size={15} aria-hidden />
          Historique des deals MT5
        </h2>

        {/* Avertissement si MT5 non connecté */}
        {checkStatus !== "connected" && (
          <div className="mt5-history-notice">
            <AlertCircle size={13} aria-hidden />
            <span>
              Vérifiez la connexion MT5 ci-dessus avant de charger l'historique.
            </span>
          </div>
        )}

        {/* Sélecteur de période */}
        <MT5DateRangeSelector
          onFetch={(period, fromDate, toDate) =>
            void handleFetchHistory(period, fromDate, toDate)
          }
          disabled={historyStatus === "loading"}
        />

        {/* Prévisualisation des deals */}
        <div className="mt5-history-preview-wrapper">
          <MT5HistoryPreview status={historyStatus} result={historyResult} />
        </div>
      </section>

      {/* ── Section : prérequis techniques ──────────────── */}
      <section className="page-section">
        <h2 className="import-section-title">
          <Info size={15} aria-hidden />
          Prérequis
        </h2>

        <div className="mt5-prereqs">
          <div className="mt5-prereqs__item">
            <Terminal size={14} className="mt5-prereqs__icon" aria-hidden />
            <div className="mt5-prereqs__content">
              <span className="mt5-prereqs__title">Python 3.8+</span>
              <span className="mt5-prereqs__desc">
                Doit être installé et accessible depuis le PATH.{" "}
                <code className="mt5-prereqs__cmd">python --version</code>
              </span>
            </div>
          </div>

          <div className="mt5-prereqs__item">
            <Terminal size={14} className="mt5-prereqs__icon" aria-hidden />
            <div className="mt5-prereqs__content">
              <span className="mt5-prereqs__title">
                Bibliothèque MetaTrader5
              </span>
              <span className="mt5-prereqs__desc">
                Package Python officiel MetaQuotes.{" "}
                <code className="mt5-prereqs__cmd">
                  pip install MetaTrader5
                </code>
              </span>
            </div>
          </div>

          <div className="mt5-prereqs__item">
            <Activity size={14} className="mt5-prereqs__icon" aria-hidden />
            <div className="mt5-prereqs__content">
              <span className="mt5-prereqs__title">
                Terminal MetaTrader 5 ouvert
              </span>
              <span className="mt5-prereqs__desc">
                MT5 doit être lancé et connecté à votre compte Fusion Markets
                avant de cliquer sur Vérifier.
              </span>
            </div>
          </div>

          <div className="mt5-prereqs__item mt5-prereqs__item--note">
            <CheckCircle2
              size={14}
              className="mt5-prereqs__icon mt5-prereqs__icon--ok"
              aria-hidden
            />
            <div className="mt5-prereqs__content">
              <span className="mt5-prereqs__title">Lecture seule</span>
              <span className="mt5-prereqs__desc">
                TradingBook ne passe jamais d'ordres. Aucun credential broker
                n'est stocké.
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
