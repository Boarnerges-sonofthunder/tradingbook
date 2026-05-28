import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestComparisonItem, BacktestRun } from "../../../types";

interface BacktestResultsSummaryProps {
  run: BacktestRun | null;
  comparison: BacktestComparisonItem[];
}

export default function BacktestResultsSummary({
  run,
  comparison,
}: BacktestResultsSummaryProps) {
  const distributionData = useMemo(() => {
    if (!run) {
      return [];
    }

    return [
      { label: "Wins", value: run.wins },
      { label: "Losses", value: run.losses },
      { label: "Breakeven", value: run.breakevens },
    ];
  }, [run]);

  return (
    <section className="card backtest-card">
      <h2 className="backtest-card__title">Resume resultats</h2>

      {!run ? (
        <p className="text-muted">
          Selectionnez un run pour afficher metriques.
        </p>
      ) : (
        <>
          <div className="backtest-summary-grid">
            <article className="backtest-kpi">
              <span>Capital final</span>
              <strong>{run.finalCapital.toFixed(2)}</strong>
            </article>
            <article className="backtest-kpi">
              <span>PnL total</span>
              <strong>{run.totalPnl.toFixed(2)}</strong>
            </article>
            <article className="backtest-kpi">
              <span>Win rate</span>
              <strong>{run.winRate.toFixed(2)}%</strong>
            </article>
            <article className="backtest-kpi">
              <span>Profit factor</span>
              <strong>{run.profitFactor.toFixed(2)}</strong>
            </article>
            <article className="backtest-kpi">
              <span>Avg Win / Loss</span>
              <strong>
                {run.averageWin.toFixed(2)} / {run.averageLoss.toFixed(2)}
              </strong>
            </article>
            <article className="backtest-kpi">
              <span>Max drawdown</span>
              <strong>{run.maxDrawdown.toFixed(2)}</strong>
            </article>
          </div>

          <div className="backtest-chart-box">
            <h3>Distribution gains/pertes</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={distributionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="value"
                  fill="var(--color-accent)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {comparison.length > 0 && (
        <div className="backtest-compare-table">
          <h3>Comparaison multi-backtests</h3>
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Strategie</th>
                <th>PnL</th>
                <th>Win rate</th>
                <th>Profit factor</th>
                <th>Drawdown</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((item) => (
                <tr key={item.runId}>
                  <td>{item.runId}</td>
                  <td>{item.strategyName}</td>
                  <td>{item.totalPnl.toFixed(2)}</td>
                  <td>{item.winRate.toFixed(2)}%</td>
                  <td>{item.profitFactor.toFixed(2)}</td>
                  <td>{item.maxDrawdown.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
