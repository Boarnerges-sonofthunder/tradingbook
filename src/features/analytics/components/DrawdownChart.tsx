// ============================================================
// Composant - DrawdownChart
// ============================================================
// Visualise les periodes de drawdown deja calculees par
// drawdownAnalyticsService.
//
// Regle importante :
//   - aucune logique analytics ici
//   - le composant recoit une courbe deja preparee
// ============================================================

import { memo, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartCard,
  ChartContainer,
  ChartTooltip,
  EmptyChartState,
  TRADINGBOOK_RECHARTS_THEME,
} from "../../../components/charts";
import type { ChartTooltipRow } from "../../../components/charts";
import type { DrawdownPoint } from "../../../types";
import { downsampleSeries, getAxisInterval } from "./chartDisplayUtils";

interface DrawdownChartProps {
  curve: DrawdownPoint[];
  currency: string;
}

interface DrawdownChartDatum {
  date: string;
  label: string;
  equity: number;
  peak: number;
  drawdown: number;
  drawdownPct: number;
}

interface DrawdownTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DrawdownChartDatum }>;
  currency: string;
}

const MAX_DRAWDOWN_POINTS = 160;

function formatMoney(value: number, currency: string, signed = false): string {
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatCompactMoney(value: number): string {
  return value.toLocaleString("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

function formatPct(value: number): string {
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

const DrawdownTooltip = memo(function DrawdownTooltip({
  active,
  payload,
  currency,
}: DrawdownTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const rows: ChartTooltipRow[] = [
    {
      label: "Date",
      value: point.date,
    },
    {
      label: "Equite",
      value: formatMoney(point.equity, currency, true),
      tone: point.equity >= 0 ? "accent" : "negative",
    },
    {
      label: "Pic",
      value: formatMoney(point.peak, currency, true),
    },
    {
      label: "Drawdown",
      value: formatMoney(point.drawdown, currency),
      tone: point.drawdown < 0 ? "negative" : "default",
    },
    {
      label: "Drawdown %",
      value: formatPct(point.drawdownPct),
      tone: point.drawdownPct < 0 ? "warning" : "default",
    },
  ];

  return <ChartTooltip title={`Cloture du ${point.label}`} rows={rows} />;
});

const DrawdownChart = memo(function DrawdownChart({
  curve,
  currency,
}: DrawdownChartProps) {
  const data = useMemo<DrawdownChartDatum[]>(
    () =>
      downsampleSeries(
        curve.map((point) => ({
          date: point.date,
          label: formatDateShort(point.date),
          equity: point.equity,
          peak: point.peak,
          drawdown: point.drawdown,
          drawdownPct: point.drawdownPct,
        })),
        MAX_DRAWDOWN_POINTS,
        (point) => point.drawdown,
      ),
    [curve],
  );
  const xAxisInterval = useMemo(
    () => getAxisInterval(data.length, 8),
    [data.length],
  );
  const tooltip = useMemo(
    () => <DrawdownTooltip currency={currency} />,
    [currency],
  );

  if (data.length === 0) {
    return (
      <ChartCard
        className="drawdown-chart"
        title="Graphique du drawdown"
        description="Baisse d'équité depuis les sommets précédents."
      >
        <EmptyChartState
          title="Aucun trade fermé à afficher"
          description="Le drawdown apparaîtra ici dès que des trades clôturés seront disponibles."
        />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      className="drawdown-chart"
      title="Graphique du drawdown"
      description="Compare l'équité courante au dernier sommet et met en évidence les phases de recul."
    >
      <ChartContainer
        className="drawdown-chart__canvas"
        height={340}
        minHeight={340}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 18, bottom: 8, left: 4 }}
          >
            <CartesianGrid
              stroke={TRADINGBOOK_RECHARTS_THEME.grid}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
              axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
              tickLine={false}
              interval={xAxisInterval}
              minTickGap={22}
            />
            <YAxis
              yAxisId="equity"
              tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
              axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
              tickLine={false}
              tickFormatter={formatCompactMoney}
              width={58}
            />
            <YAxis
              yAxisId="drawdown"
              orientation="right"
              tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
              axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
              tickLine={false}
              tickFormatter={formatCompactMoney}
              width={58}
            />
            <Tooltip content={tooltip} />
            <ReferenceLine
              yAxisId="drawdown"
              y={0}
              stroke={TRADINGBOOK_RECHARTS_THEME.zeroLine}
            />
            <Area
              yAxisId="drawdown"
              type="monotone"
              dataKey="drawdown"
              stroke={TRADINGBOOK_RECHARTS_THEME.series.negative}
              fill="var(--color-negative-subtle)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              yAxisId="equity"
              type="monotone"
              dataKey="peak"
              stroke="var(--color-text-secondary)"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="equity"
              type="monotone"
              dataKey="equity"
              stroke={TRADINGBOOK_RECHARTS_THEME.series.equity}
              strokeWidth={2}
              dot={data.length <= 20 ? { r: 3 } : false}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartContainer>
    </ChartCard>
  );
});

export default DrawdownChart;
