import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestEquityPoint } from "../../../types";

interface BacktestEquityChartProps {
  points: BacktestEquityPoint[];
}

export default function BacktestEquityChart({
  points,
}: BacktestEquityChartProps) {
  return (
    <section className="card backtest-card">
      <h2 className="backtest-card__title">Equity curve</h2>

      {points.length === 0 ? (
        <p className="text-muted">Aucun point equity.</p>
      ) : (
        <div className="backtest-chart-box">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={points}>
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
              <Line
                type="monotone"
                dataKey="equity"
                stroke="var(--color-accent)"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
