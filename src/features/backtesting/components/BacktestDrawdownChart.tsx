import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestEquityPoint } from "../../../types";

interface BacktestDrawdownChartProps {
  points: BacktestEquityPoint[];
}

export default function BacktestDrawdownChart({
  points,
}: BacktestDrawdownChartProps) {
  return (
    <section className="card backtest-card">
      <h2 className="backtest-card__title">Graphique drawdown</h2>

      {points.length === 0 ? (
        <p className="text-muted">Aucun point drawdown.</p>
      ) : (
        <div className="backtest-chart-box">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={points}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value: string) =>
                  new Date(value).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                  })
                }
              />
              <YAxis />
              <Tooltip
                labelFormatter={(label) =>
                  new Date(String(label)).toLocaleString("fr-FR")
                }
              />
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke="var(--color-negative)"
                fill="var(--color-negative-subtle)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
