import type { BacktestRun } from "../../../types";

interface BacktestRunPanelProps {
  runs: BacktestRun[];
  selectedRunId: number | null;
  selectedForCompare: number[];
  onSelectRun: (runId: number) => void;
  onToggleCompare: (runId: number) => void;
}

export default function BacktestRunPanel({
  runs,
  selectedRunId,
  selectedForCompare,
  onSelectRun,
  onToggleCompare,
}: BacktestRunPanelProps) {
  return (
    <section className="card backtest-card">
      <h2 className="backtest-card__title">Historique backtests</h2>

      {runs.length === 0 ? (
        <p className="text-muted">Aucun run backtest enregistre.</p>
      ) : (
        <div className="backtest-runs-list">
          {runs.map((run) => {
            const selected = selectedRunId === run.id;
            const checked = selectedForCompare.includes(run.id);

            return (
              <button
                key={run.id}
                type="button"
                className={`backtest-run-item ${selected ? "backtest-run-item--selected" : ""}`}
                onClick={() => onSelectRun(run.id)}
              >
                <div className="backtest-run-item__top">
                  <strong>{run.strategyName}</strong>
                  <span className="badge badge-neutral">#{run.id}</span>
                </div>

                <div className="backtest-run-item__meta">
                  <span>
                    {run.symbol} · {run.timeframe}
                  </span>
                  <span>Trades: {run.totalTrades}</span>
                </div>

                <div className="backtest-run-item__meta">
                  <span>PnL: {run.totalPnl.toFixed(2)}</span>
                  <span>WR: {run.winRate.toFixed(2)}%</span>
                </div>

                <label
                  className="backtest-run-item__compare"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCompare(run.id)}
                  />
                  Comparer
                </label>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
