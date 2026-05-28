import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, RefreshCw, Upload } from "lucide-react";
import BacktestStrategyForm from "./components/BacktestStrategyForm";
import BacktestRunPanel from "./components/BacktestRunPanel";
import BacktestResultsSummary from "./components/BacktestResultsSummary";
import BacktestTradesTable from "./components/BacktestTradesTable";
import BacktestEquityChart from "./components/BacktestEquityChart";
import BacktestDrawdownChart from "./components/BacktestDrawdownChart";
import BacktestReplayChart from "./components/BacktestReplayChart";
import {
  createBacktestStrategy,
  deleteBacktestStrategy,
  getBacktestComparison,
  getBacktestRunDetails,
  getBacktestRuns,
  getBacktestStrategies,
  getHistoricalCandlesForReplay,
  getHistoricalMarketSymbols,
  importHistoricalMarketDataCsv,
  runBacktest,
  updateBacktestStrategy,
} from "../../services/backtesting";
import type {
  BacktestComparisonItem,
  BacktestRunDetails,
  BacktestStrategy,
  BacktestStrategyInput,
  ChartTimeframe,
  MarketDataCandle,
} from "../../types";
import { useNotification } from "../../hooks";

function deriveReplayRange(strategy: BacktestStrategy | null): {
  fromIso: string | undefined;
  toIso: string | undefined;
  timeframe: ChartTimeframe;
  symbol: string;
} {
  if (!strategy) {
    return {
      fromIso: undefined,
      toIso: undefined,
      timeframe: "M15",
      symbol: "EURUSD",
    };
  }

  return {
    fromIso: strategy.testPeriodStart,
    toIso: strategy.testPeriodEnd,
    timeframe: strategy.timeframe,
    symbol: strategy.symbol,
  };
}

export default function BacktestingPage() {
  const notify = useNotification();

  const [strategies, setStrategies] = useState<BacktestStrategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<number | null>(
    null,
  );

  const [runs, setRuns] = useState<BacktestRunDetails["run"][]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [runDetails, setRunDetails] = useState<BacktestRunDetails | null>(null);
  const [comparison, setComparison] = useState<BacktestComparisonItem[]>([]);
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([]);

  const [historicalSymbols, setHistoricalSymbols] = useState<string[]>([]);
  const [replayCandles, setReplayCandles] = useState<MarketDataCandle[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [importingData, setImportingData] = useState(false);

  const selectedStrategy = useMemo(
    () =>
      strategies.find((strategy) => strategy.id === selectedStrategyId) ?? null,
    [strategies, selectedStrategyId],
  );

  const loadBaseData = useCallback(async () => {
    const [nextStrategies, nextRuns, symbols] = await Promise.all([
      getBacktestStrategies(),
      getBacktestRuns(80),
      getHistoricalMarketSymbols(),
    ]);

    setStrategies(nextStrategies);
    setRuns(nextRuns);
    setHistoricalSymbols(symbols);

    if (!selectedStrategyId && nextStrategies[0]) {
      setSelectedStrategyId(nextStrategies[0].id);
    }

    if (!selectedRunId && nextRuns[0]) {
      setSelectedRunId(nextRuns[0].id);
    }
  }, [selectedRunId, selectedStrategyId]);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  useEffect(() => {
    if (!selectedRunId) {
      setRunDetails(null);
      return;
    }

    void (async () => {
      const details = await getBacktestRunDetails(selectedRunId);
      setRunDetails(details);
    })();
  }, [selectedRunId]);

  useEffect(() => {
    const range = deriveReplayRange(selectedStrategy);

    void (async () => {
      const candles = await getHistoricalCandlesForReplay(
        range.symbol,
        range.timeframe,
        range.fromIso,
        range.toIso,
      );
      setReplayCandles(candles);
    })();
  }, [selectedStrategy]);

  async function handleSaveStrategy(
    strategyId: number | null,
    payload: BacktestStrategyInput,
  ): Promise<void> {
    setLoading(true);
    try {
      if (strategyId) {
        const updated = await updateBacktestStrategy(strategyId, payload);
        if (!updated) {
          throw new Error("Strategie introuvable pour mise a jour");
        }
        notify.success("Strategie mise a jour");
      } else {
        const created = await createBacktestStrategy(payload);
        setSelectedStrategyId(created.id);
        notify.success("Strategie creee");
      }

      await loadBaseData();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Erreur sauvegarde strategie";
      notify.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteStrategy(): Promise<void> {
    if (!selectedStrategy) {
      return;
    }

    setLoading(true);
    try {
      await deleteBacktestStrategy(selectedStrategy.id);
      setSelectedStrategyId(null);
      notify.success("Strategie supprimee");
      await loadBaseData();
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Suppression impossible",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRunBacktest(): Promise<void> {
    if (!selectedStrategy) {
      notify.warning("Selectionnez une strategie");
      return;
    }

    setLoadingRun(true);
    try {
      const result = await runBacktest({ strategyId: selectedStrategy.id });
      notify.success(`Backtest termine (run #${result.run.id})`);

      await loadBaseData();
      setSelectedRunId(result.run.id);
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Execution backtest en echec",
      );
    } finally {
      setLoadingRun(false);
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setImportingData(true);

    try {
      const content = await file.text();
      const summary = await importHistoricalMarketDataCsv(content, file.name);
      notify.success(
        `Import marche termine: ${summary.importedRows} lignes importees`,
      );
      await loadBaseData();
    } catch (err) {
      notify.error(
        err instanceof Error
          ? err.message
          : "Import donnees historique en echec",
      );
    } finally {
      setImportingData(false);
      event.target.value = "";
    }
  }

  async function handleCompareRuns(): Promise<void> {
    if (selectedForCompare.length < 2) {
      setComparison([]);
      return;
    }

    const nextComparison = await getBacktestComparison(selectedForCompare);
    setComparison(nextComparison);
  }

  function toggleCompare(runId: number) {
    setSelectedForCompare((current) => {
      if (current.includes(runId)) {
        return current.filter((id) => id !== runId);
      }
      return [...current, runId].slice(-4);
    });
  }

  return (
    <div className="content-max backtesting-page">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Backtesting</h1>
          <p className="page-subtitle">
            Simulation historique locale. Aucun ordre reel, aucune execution
            live.
          </p>
        </div>

        <div className="page-actions backtesting-page__actions">
          <label className="btn-secondary btn-icon-text backtesting-upload-btn">
            <Upload size={14} />
            Import donnees historiques CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportFile}
              disabled={importingData}
            />
          </label>

          <button
            type="button"
            className="btn-secondary btn-icon-text"
            onClick={() => void loadBaseData()}
          >
            <RefreshCw size={14} />
            Rafraichir
          </button>

          <button
            type="button"
            className="btn-primary btn-icon-text"
            onClick={() => void handleRunBacktest()}
            disabled={loadingRun || !selectedStrategy}
          >
            <Play size={14} />
            Lancer backtest
          </button>
        </div>
      </div>

      <div className="backtesting-page__notice card">
        <strong>Mode securise:</strong> moteur backtest simule uniquement
        historique local SQLite. Aucun ordre reel MT5/MT4, aucun signal live
        buy/sell.
      </div>

      <div className="backtesting-grid">
        <BacktestRunPanel
          runs={runs}
          selectedRunId={selectedRunId}
          selectedForCompare={selectedForCompare}
          onSelectRun={setSelectedRunId}
          onToggleCompare={toggleCompare}
        />

        <div className="backtesting-grid__main">
          <div className="backtesting-grid__strategy-head">
            <div className="backtesting-grid__strategy-select">
              <label>
                Strategie
                <select
                  value={selectedStrategyId ?? ""}
                  onChange={(event) =>
                    setSelectedStrategyId(Number(event.target.value) || null)
                  }
                >
                  <option value="">Nouvelle strategie</option>
                  {strategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.name} · {strategy.symbol} {strategy.timeframe}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedStrategy && (
              <button
                type="button"
                className="btn-danger"
                onClick={() => void handleDeleteStrategy()}
              >
                Supprimer strategie
              </button>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handleCompareRuns()}
              disabled={selectedForCompare.length < 2}
            >
              Comparer runs selectionnes
            </button>
          </div>

          <BacktestStrategyForm
            selectedStrategy={selectedStrategy}
            availableSymbols={historicalSymbols}
            onSave={handleSaveStrategy}
            loading={loading}
          />

          <BacktestResultsSummary
            run={runDetails?.run ?? null}
            comparison={comparison}
          />

          <div className="backtesting-grid__charts">
            <BacktestEquityChart points={runDetails?.equityPoints ?? []} />
            <BacktestDrawdownChart points={runDetails?.equityPoints ?? []} />
          </div>

          <BacktestReplayChart
            candles={replayCandles}
            trades={runDetails?.trades ?? []}
          />

          <BacktestTradesTable trades={runDetails?.trades ?? []} />
        </div>
      </div>
    </div>
  );
}
