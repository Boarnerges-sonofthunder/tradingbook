// ============================================================
// Page — Analytics
// ============================================================
// Phase 7 — Étapes 2–14 : Analyse PnL + Win Rate + Risk/Reward + Drawdown + Courbe d'équité + Profit Factor + Average Win/Loss + Symboles + Stratégies + Sessions + Émotions + Heatmaps.
//
// Flux de données :
//   montage du composant
//     └── loadAll() — Promise.all
//           ├── getPnLStats()              ← service analytics PnL
//           ├── getWinRateStats()           ← service analytics Win Rate
//           ├── getRiskRewardStats()        ← service analytics Risk/Reward
//           ├── getDrawdownStats()          ← service analytics Drawdown
//           ├── getEquityCurveStats()       ← service analytics Courbe d'equite
//           ├── getProfitFactorStats()      ← service analytics Profit Factor
//           ├── getAvgWinLossStats()        ← service analytics Average Win/Loss
//           ├── getSymbolStats()            ← service analytics par symbole
//           ├── getStrategyStats()          ← service analytics par stratégie
//           ├── getSessionStats()           ← service analytics par session
//           ├── getEmotionStats()           ← service analytics par émotion
//           ├── getHabitDetectionStats()    ← service détection d'habitudes
//           └── getHeatmapStats()           ← service analytics heatmaps (Étape 12)
// Les services lisent les mêmes trades fermés (status = "closed").
// Si l'un est vide, les autres le sont aussi — un seul état vide suffit.
//
// États gérés :
//   loading  → skeleton animé pendant la requête
//   error    → message non-intrusif avec bouton "Réessayer"
//   empty    → état vide (aucun trade fermé)
//   data     → sections PnL + Win Rate + Risk/Reward + Drawdown + Courbe d'équité + Profit Factor + Average Win/Loss + Symboles + Stratégies + Sessions + Émotions + Habitudes + Heatmaps
// ============================================================

import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { RefreshCw, BarChart2, Bot } from "lucide-react";
import AIAnalyticsFloatingChat from "../features/ai/components/AIAnalyticsFloatingChat";
import AIInsightsSidebar from "../features/ai/components/AIInsightsSidebar";
import { useUserSettings } from "../hooks";
import { getSyncedTradingAccounts } from "../services/tradingAccounts/tradingAccountsService";
import { getSyncedBrokers } from "../services/brokers/brokersService";
import { getSetting, setSetting } from "../services/settings/settingsService";
import { buildAIInsights, exportAnalyticsForAI } from "../services/ai";
import { tr } from "../utils/i18n";
import RouteLoader from "../components/ui/RouteLoader";
import {
  getPnLStats,
  getWinRateStats,
  getRiskRewardStats,
  getDrawdownStats,
  getEquityCurveStats,
  getProfitFactorStats,
  getSymbolStats,
  getStrategyStats,
  getSessionStats,
  getEmotionStats,
  getHabitDetectionStats,
  getPerformanceChartStats,
} from "../services/analytics";
import PnLSummaryCards from "../features/analytics/components/PnLSummaryCards";
import WinRateSummaryCards from "../features/analytics/components/WinRateSummaryCards";
import WinRateBreakdownTable from "../features/analytics/components/WinRateBreakdownTable";
import RiskRewardSummaryCards from "../features/analytics/components/RiskRewardSummaryCards";
import RiskRewardBreakdownTable from "../features/analytics/components/RiskRewardBreakdownTable";
import ProfitFactorSummaryCards from "../features/analytics/components/ProfitFactorSummaryCards";
import ProfitFactorBreakdownTable from "../features/analytics/components/ProfitFactorBreakdownTable";
import SymbolSummaryCards from "../features/analytics/components/SymbolSummaryCards";
import StrategySummaryCards from "../features/analytics/components/StrategySummaryCards";
import SessionSummaryCards from "../features/analytics/components/SessionSummaryCards";
import EmotionSummaryCards from "../features/analytics/components/EmotionSummaryCards";
import TradingHabitsPanel from "../features/analytics/components/TradingHabitsPanel";
import type {
  PnLResult,
  WinRateResult,
  RiskRewardResult,
  DrawdownResult,
  EquityCurveResult,
  ProfitFactorResult,
  SymbolResult,
  StrategyResult,
  SessionResult,
  EmotionResult,
  HabitDetectionResult,
  PerformanceChartResult,
  AIInsightCard,
  TradingAccount,
  Broker,
} from "../types";
import type { AIAnalyticsFilters, AIMemoryScope } from "../types/ai";

const PerformanceChart = lazy(
  () => import("../features/analytics/components/PerformanceChart"),
);
const DrawdownChart = lazy(
  () => import("../features/analytics/components/DrawdownChart"),
);
const EquityCurveChart = lazy(
  () => import("../features/analytics/components/EquityCurveChart"),
);

const ANALYTICS_FILTER_BROKER_KEY = "analytics.selectedBrokerId";
const ANALYTICS_FILTER_ACCOUNT_KEY = "analytics.selectedAccountId";

function parseStoredFilterId(value: string | null): number | "all" {
  if (!value || value === "all") return "all";
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : "all";
}

// ── Squelette de chargement ────────────────────────────────

function LoadingSkeleton() {
  return (
    <>
      {/* Skeleton section PnL : 10 cartes */}
      <div className="pnl-summary-cards pnl-summary-cards--loading">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={`pnl-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Win Rate : 4 cartes */}
      <div className="winrate-cards winrate-cards--loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`wr-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Risk/Reward : 6 cartes */}
      <div className="rr-cards rr-cards--loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={`rr-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Drawdown : 6 cartes */}
      <div className="dd-cards dd-cards--loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={`dd-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Courbe d'equite : 6 cartes */}
      <div className="equity-cards equity-cards--loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={`equity-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Profit Factor : 6 cartes */}
      <div className="pf-cards pf-cards--loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={`pf-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Average Win/Loss : 6 cartes */}
      <div className="awl-cards awl-cards--loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={`awl-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Symboles : 4 cartes */}
      <div className="symbol-summary-cards symbol-summary-cards--loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`sym-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Stratégies : 4 cartes */}
      <div className="strategy-summary-cards strategy-summary-cards--loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`strat-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Sessions : 4 cartes */}
      <div className="session-summary-cards session-summary-cards--loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`sess-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Émotions : 4 cartes */}
      <div className="strategy-summary-cards strategy-summary-cards--loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`emo-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      {/* Skeleton section Heatmaps : 4 cartes */}
      <div className="strategy-summary-cards strategy-summary-cards--loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`hm-${i}`} className="stat-card stat-card--skeleton" />
        ))}
      </div>
    </>
  );
}

// ── État vide ──────────────────────────────────────────────

function EmptyState({
  language,
}: {
  language: "fr" | "en";
}) {
  return (
    <div className="dashboard-empty">
      <div className="dashboard-empty__icon">
        <BarChart2 size={48} strokeWidth={1.25} />
      </div>
      <h2 className="dashboard-empty__title">
        {tr(language, "Aucun trade clôturé", "No closed trades")}
      </h2>
      <p className="dashboard-empty__text">
        {tr(
          language,
          "Ajoutez ou importez des trades pour voir l'analyse des performances apparaître ici.",
          "Add or import trades to display performance analytics here.",
        )}
      </p>
    </div>
  );
}

function FilteredEmptyState({
  language,
  scopeLabel,
}: {
  language: "fr" | "en";
  scopeLabel: string;
}) {
  return (
    <div className="dashboard-empty">
      <div className="dashboard-empty__icon">
        <BarChart2 size={48} strokeWidth={1.25} />
      </div>
      <h2 className="dashboard-empty__title">
        {tr(
          language,
          `Aucun trade clôturé pour ${scopeLabel}`,
          `No closed trades for ${scopeLabel}`,
        )}
      </h2>
      <p className="dashboard-empty__text">
        {tr(
          language,
          "Les analytics s'affichent uniquement quand ce filtre contient au moins un trade clôturé importé.",
          "Analytics only appear when this filter contains at least one imported closed trade.",
        )}
      </p>
    </div>
  );
}

function AnalyticsChartLoader({
  title,
  language,
}: {
  title: string;
  language: "fr" | "en";
}) {
  return (
    <RouteLoader
      compact
      title={title}
      message={tr(
        language,
        "Préparation de la visualisation…",
        "Preparing visualization...",
      )}
    />
  );
}

// ── Page principale ────────────────────────────────────────

export default function AnalyticsPage() {
  const settings = useUserSettings();
  const displayCurrency = settings.defaultCurrency;
  const [pnlResult, setPnlResult] = useState<PnLResult | null>(null);
  const [performanceChartResult, setPerformanceChartResult] =
    useState<PerformanceChartResult | null>(null);
  const [winRateResult, setWinRateResult] = useState<WinRateResult | null>(
    null,
  );
  const [rrResult, setRrResult] = useState<RiskRewardResult | null>(null);
  const [ddResult, setDdResult] = useState<DrawdownResult | null>(null);
  const [equityCurveResult, setEquityCurveResult] =
    useState<EquityCurveResult | null>(null);
  const [pfResult, setPfResult] = useState<ProfitFactorResult | null>(null);
  const [symbolResult, setSymbolResult] = useState<SymbolResult | null>(null);
  const [strategyResult, setStrategyResult] = useState<StrategyResult | null>(
    null,
  );
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(
    null,
  );
  const [emotionResult, setEmotionResult] = useState<EmotionResult | null>(
    null,
  );
  const [habitResult, setHabitResult] = useState<HabitDetectionResult | null>(
    null,
  );
  const [aiInsights, setAiInsights] = useState<AIInsightCard[]>([]);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | "all">(
    "all",
  );
  const [selectedBrokerId, setSelectedBrokerId] = useState<number | "all">(
    "all",
  );
  const [filtersReady, setFiltersReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  const selectedAccount = useMemo(
    () =>
      selectedAccountId === "all"
        ? null
        : (accounts.find((account) => account.id === selectedAccountId) ??
          null),
    [selectedAccountId, accounts],
  );

  const selectedBroker = useMemo(
    () =>
      selectedBrokerId === "all"
        ? null
        : (brokers.find((broker) => broker.id === selectedBrokerId) ?? null),
    [selectedBrokerId, brokers],
  );

  const loadAll = useCallback(async () => {
    const analyticsFilters: AIAnalyticsFilters = selectedAccount
      ? {
          tradingAccountId: selectedAccount.id,
          accountId: selectedAccount.accountNumber,
          broker: selectedBroker?.name ?? selectedAccount.broker,
        }
      : selectedBroker
        ? { broker: selectedBroker.name }
        : {};

    setLoading(true);
    setError(false);
    try {
      // Chargement en parallèle : les services sont indépendants
      const [
        pnl,
        performanceChart,
        winRate,
        rr,
        dd,
        equityCurve,
        pf,
        sym,
        strat,
        sess,
        emo,
        habits,
      ] = await Promise.all([
        getPnLStats(analyticsFilters),
        getPerformanceChartStats(analyticsFilters),
        getWinRateStats(analyticsFilters),
        getRiskRewardStats(analyticsFilters),
        getDrawdownStats(analyticsFilters),
        getEquityCurveStats(analyticsFilters),
        getProfitFactorStats(analyticsFilters),
        getSymbolStats(analyticsFilters),
        getStrategyStats({ ...analyticsFilters, status: "closed" }),
        getSessionStats({ ...analyticsFilters, status: "closed" }),
        getEmotionStats({ ...analyticsFilters, status: "closed" }),
        getHabitDetectionStats({ ...analyticsFilters, status: "closed" }),
      ]);

      // Le rendu analytics monte beaucoup de charts/tableaux lourds.
      // On pousse leurs mises à jour en transition pour éviter un
      // rafraîchissement trop bloquant côté React.
      startTransition(() => {
        setPnlResult(pnl);
        setPerformanceChartResult(performanceChart);
        setWinRateResult(winRate);
        setRrResult(rr);
        setDdResult(dd);
        setEquityCurveResult(equityCurve);
        setPfResult(pf);
        setSymbolResult(sym);
        setStrategyResult(strat);
        setSessionResult(sess);
        setEmotionResult(emo);
        setHabitResult(habits);
      });

      try {
        const scopeLabel = selectedAccount
          ? `Compte ${selectedAccount.name}`
          : selectedBroker
            ? `Broker ${selectedBroker.name}`
            : null;
        const exported = await exportAnalyticsForAI(analyticsFilters, scopeLabel);
        setAiInsights(buildAIInsights(exported.data));
      } catch {
        setAiInsights([]);
      }
    } catch (err) {
      console.error("[AnalyticsPage] Erreur chargement analytics :", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, selectedBroker]);

  const aiMemoryScope: AIMemoryScope | null = selectedAccount
    ? {
        key: `account:${selectedAccount.id}`,
        label: `Compte ${selectedAccount.name}`,
      }
    : selectedBroker
      ? {
          key: `broker:${selectedBroker.name.toLowerCase()}`,
          label: `Broker ${selectedBroker.name}`,
        }
      : null;

  const handleRefresh = useCallback(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedFilters() {
      try {
        const [storedBroker, storedAccount] = await Promise.all([
          getSetting(ANALYTICS_FILTER_BROKER_KEY),
          getSetting(ANALYTICS_FILTER_ACCOUNT_KEY),
        ]);

        if (cancelled) return;
        setSelectedBrokerId(parseStoredFilterId(storedBroker));
        setSelectedAccountId(parseStoredFilterId(storedAccount));
      } catch {
        if (!cancelled) {
          setSelectedBrokerId("all");
          setSelectedAccountId("all");
        }
      } finally {
        if (!cancelled) setFiltersReady(true);
      }
    }

    void loadSavedFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  // Chargement silencieux au montage (pas de toast — données de fond)
  useEffect(() => {
    if (!filtersReady) return;
    void loadAll();
  }, [filtersReady, loadAll]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      try {
        const rows = await getSyncedTradingAccounts(true);
        if (!cancelled) setAccounts(rows);
      } catch {
        if (!cancelled) setAccounts([]);
      }
    }

    void loadAccounts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBrokers() {
      try {
        const rows = await getSyncedBrokers(true);
        if (!cancelled) setBrokers(rows);
      } catch {
        if (!cancelled) setBrokers([]);
      }
    }

    void loadBrokers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      selectedAccountId !== "all" &&
      !accounts.some((account) => account.id === selectedAccountId)
    ) {
      setSelectedAccountId("all");
    }
  }, [selectedAccountId, accounts]);

  useEffect(() => {
    if (
      selectedBrokerId !== "all" &&
      !brokers.some((broker) => broker.id === selectedBrokerId)
    ) {
      setSelectedBrokerId("all");
    }
  }, [selectedBrokerId, brokers]);

  useEffect(() => {
    if (!filtersReady) return;

    void Promise.all([
      setSetting(ANALYTICS_FILTER_BROKER_KEY, String(selectedBrokerId)),
      setSetting(ANALYTICS_FILTER_ACCOUNT_KEY, String(selectedAccountId)),
    ]).catch((err) => {
      console.warn("[AnalyticsPage] Impossible de persister les filtres", err);
    });
  }, [filtersReady, selectedBrokerId, selectedAccountId]);

  // Garde de rendu : tous les champs doivent être non-nuls pour afficher les données
  const hasData =
    !loading &&
    !error &&
    pnlResult !== null &&
    !pnlResult.isEmpty &&
    pnlResult.stats !== null &&
    performanceChartResult !== null &&
    !performanceChartResult.isEmpty &&
    performanceChartResult.stats !== null &&
    performanceChartResult.breakdown !== null &&
    winRateResult !== null &&
    !winRateResult.isEmpty &&
    winRateResult.stats !== null &&
    rrResult !== null &&
    !rrResult.isEmpty &&
    rrResult.stats !== null &&
    ddResult !== null &&
    !ddResult.isEmpty &&
    ddResult.stats !== null &&
    equityCurveResult !== null &&
    !equityCurveResult.isEmpty &&
    equityCurveResult.stats !== null &&
    pfResult !== null &&
    !pfResult.isEmpty &&
    pfResult.stats !== null &&
    symbolResult !== null &&
    !symbolResult.isEmpty &&
    symbolResult.overview !== null &&
    strategyResult !== null &&
    !strategyResult.isEmpty &&
    strategyResult.overview !== null &&
    sessionResult !== null &&
    !sessionResult.isEmpty &&
    sessionResult.overview !== null &&
    emotionResult !== null &&
    !emotionResult.isEmpty &&
    emotionResult.overview !== null &&
    habitResult !== null &&
    !habitResult.isEmpty;

  return (
    <div className="analytics-page">
      {/* ── En-tête ──────────────────────────────────────── */}
      <div className="analytics-header">
        <div className="analytics-header__text">
          <h1 className="analytics-header__title">Analytics</h1>
          <p className="analytics-header__subtitle">
            {tr(
              settings.language,
              "Analyse des performances sur les trades clôturés",
              "Performance analysis on closed trades",
            )}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-sm)",
          }}
        >
          <button
            type="button"
            className="analytics-header__ai-btn"
            onClick={() => setAiChatOpen((prev) => !prev)}
            title={tr(
              settings.language,
              "Ouvrir l'analyse IA",
              "Open AI analysis",
            )}
            aria-expanded={aiChatOpen}
            aria-haspopup="dialog"
          >
            <Bot size={14} aria-hidden />
            {tr(settings.language, "Analyse IA", "AI analysis")}
          </button>
          <button
            className="analytics-header__refresh"
            onClick={handleRefresh}
            disabled={loading}
            title={tr(
              settings.language,
              "Rafraîchir l'analyse",
              "Refresh analytics",
            )}
            aria-label={tr(
              settings.language,
              "Rafraîchir l'analyse",
              "Refresh analytics",
            )}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      <AIAnalyticsFloatingChat
        isOpen={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        analyticsFilters={
          selectedAccount
            ? {
                tradingAccountId: selectedAccount.id,
                accountId: selectedAccount.accountNumber,
                broker: selectedBroker?.name ?? selectedAccount.broker,
              }
            : selectedBroker
              ? { broker: selectedBroker.name }
              : undefined
        }
        memoryScope={aiMemoryScope}
      />

      <div
        className="form-grid form-grid--2"
        style={{ maxWidth: 760, marginBottom: "var(--spacing-lg)" }}
      >
        <label className="form-group">
          <span className="form-label">
            {tr(settings.language, "Filtre broker", "Broker filter")}
          </span>
          <select
            value={String(selectedBrokerId)}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedBrokerId(value === "all" ? "all" : Number(value));
            }}
          >
            <option value="all">
              {tr(settings.language, "Tous les brokers", "All brokers")}
            </option>
            {brokers.map((broker) => (
              <option key={broker.id} value={broker.id}>
                {broker.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-group">
          <span className="form-label">
            {tr(settings.language, "Filtre compte", "Account filter")}
          </span>
          <select
            value={String(selectedAccountId)}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedAccountId(value === "all" ? "all" : Number(value));
            }}
          >
            <option value="all">
              {tr(settings.language, "Tous les comptes", "All accounts")}
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── État : chargement ────────────────────────────── */}
      {loading && <LoadingSkeleton />}

      {/* ── État : erreur ────────────────────────────────── */}
      {!loading && error && (
        <div className="dashboard-error">
          <p>
            {tr(
              settings.language,
              "Impossible de charger l'analyse.",
              "Unable to load analytics.",
            )}
          </p>
          <button className="dashboard-error__retry" onClick={handleRefresh}>
            {tr(settings.language, "Réessayer", "Retry")}
          </button>
        </div>
      )}

      {/* ── État : vide ──────────────────────────────────── */}
      {!loading && !error && pnlResult !== null && pnlResult.isEmpty && (
        selectedAccount ? (
          <FilteredEmptyState
            language={settings.language}
            scopeLabel={selectedAccount.name}
          />
        ) : selectedBroker ? (
          <FilteredEmptyState
            language={settings.language}
            scopeLabel={selectedBroker.name}
          />
        ) : (
          <EmptyState language={settings.language} />
        )
      )}

      {/* ── État : données ───────────────────────────────── */}
      {hasData && (
        <>
          {/* ── Section PnL ─────────────────────────────── */}
          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(settings.language, "Résumé PnL", "PnL summary")}
            </h2>
            <PnLSummaryCards
              stats={pnlResult!.stats!}
              currency={displayCurrency}
            />
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(settings.language, "Insights IA", "AI insights")}
            </h2>
            <AIInsightsSidebar cards={aiInsights} />
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(
                settings.language,
                "Performance générale",
                "Overall performance",
              )}
            </h2>
            <Suspense
              fallback={
                <AnalyticsChartLoader
                  title={tr(
                    settings.language,
                    "Chargement du graphique",
                    "Loading chart",
                  )}
                  language={settings.language}
                />
              }
            >
              <PerformanceChart
                breakdown={performanceChartResult!.breakdown!}
                currency={displayCurrency}
              />
            </Suspense>
          </section>

          {/* ── Section Win Rate ─────────────────────────── */}
          <section className="analytics-section">
            <h2 className="analytics-section__title">Win Rate</h2>
            <WinRateSummaryCards stats={winRateResult!.stats!} />
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(
                settings.language,
                "Win Rate par catégorie",
                "Win rate by category",
              )}
            </h2>
            <WinRateBreakdownTable
              bySymbol={winRateResult!.bySymbol}
              byStrategy={winRateResult!.byStrategy}
              byMonth={winRateResult!.byMonth}
            />
          </section>

          {/* ── Section Risk/Reward ──────────────────────── */}
          <section className="analytics-section">
            <h2 className="analytics-section__title">Risk / Reward</h2>
            <RiskRewardSummaryCards stats={rrResult!.stats!} />
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(
                settings.language,
                "Risk / Reward par catégorie",
                "Risk / Reward by category",
              )}
            </h2>
            <RiskRewardBreakdownTable
              bySymbol={rrResult!.bySymbol}
              byStrategy={rrResult!.byStrategy}
            />
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(
                settings.language,
                "Evolution du drawdown",
                "Drawdown evolution",
              )}
            </h2>
            <Suspense
              fallback={
                <AnalyticsChartLoader
                  title={tr(
                    settings.language,
                    "Chargement du drawdown",
                    "Loading drawdown",
                  )}
                  language={settings.language}
                />
              }
            >
              <DrawdownChart
                curve={ddResult!.curve}
                currency={displayCurrency}
              />
            </Suspense>
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(settings.language, "Courbe d'équité", "Equity curve")}
            </h2>
            <Suspense
              fallback={
                <AnalyticsChartLoader
                  title={tr(
                    settings.language,
                    "Chargement de la courbe d'équité",
                    "Loading equity curve",
                  )}
                  language={settings.language}
                />
              }
            >
              <EquityCurveChart
                byTrade={equityCurveResult!.byTrade}
                byDate={equityCurveResult!.byDate}
                currency={displayCurrency}
                startEquity={equityCurveResult!.stats!.startEquity}
              />
            </Suspense>
          </section>

          {/* ── Section Profit Factor ─────────────────── */}
          <section className="analytics-section">
            <h2 className="analytics-section__title">Profit Factor</h2>
            <ProfitFactorSummaryCards
              stats={pfResult!.stats!}
              currency={displayCurrency}
            />
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(
                settings.language,
                "Profit Factor par catégorie",
                "Profit factor by category",
              )}
            </h2>
            <ProfitFactorBreakdownTable
              bySymbol={pfResult!.bySymbol}
              byStrategy={pfResult!.byStrategy}
              byMonth={pfResult!.byMonth}
              currency={displayCurrency}
            />
          </section>

          {/* ── Section Performance par Symbole ──── */}
          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(
                settings.language,
                "Performance par Symbole",
                "Performance by symbol",
              )}
            </h2>
            <SymbolSummaryCards
              overview={symbolResult!.overview!}
              currency={displayCurrency}
            />
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(
                settings.language,
                "Performance par Stratégie",
                "Performance by strategy",
              )}
            </h2>
            <StrategySummaryCards
              overview={strategyResult!.overview!}
              currency={displayCurrency}
            />
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(
                settings.language,
                "Performance par Session",
                "Performance by session",
              )}
            </h2>
            <SessionSummaryCards
              overview={sessionResult!.overview!}
              currency={displayCurrency}
            />
          </section>

          {/* ── Section Performance par Émotion ──── */}
          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(
                settings.language,
                "Performance par Émotion",
                "Performance by emotion",
              )}
            </h2>
            <EmotionSummaryCards
              overview={emotionResult!.overview!}
              currency={displayCurrency}
            />
          </section>

          {/* ── Section Habitudes Détectées ──── */}
          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(settings.language, "Habitudes Détectées", "Detected habits")}
            </h2>
            <TradingHabitsPanel result={habitResult!} />
          </section>
        </>
      )}
    </div>
  );
}
