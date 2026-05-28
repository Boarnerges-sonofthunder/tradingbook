// ============================================================
// Composant - PerformanceChart
// ============================================================
// Visualise la performance generale des trades fermes sur une periode.
// Le composant affiche uniquement des donnees deja preparees par
// performanceChartAnalyticsService.
// ============================================================

import { memo, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
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
import type {
  PerformanceChartBreakdown,
  PerformanceChartPeriod,
  PerformanceChartPoint,
} from "../../../types";
import { downsampleSeries, getAxisInterval } from "./chartDisplayUtils";

interface PerformanceChartProps {
  breakdown: PerformanceChartBreakdown;
  currency: string;
}

interface ChartDatum extends PerformanceChartPoint {
  label: string;
  detail: string;
}

interface PerformanceTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
  currency: string;
}

const MAX_POINTS_BY_PERIOD: Record<PerformanceChartPeriod, number> = {
  day: 150,
  week: 104,
  month: 72,
};

const PERIOD_LABELS: Record<PerformanceChartPeriod, string> = {
  day: "Par jour",
  week: "Par semaine",
  month: "Par mois",
};

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

function formatPeriodLabel(period: string): string {
  if (period.includes("W")) {
    const [year, week] = period.split("-W");
    return `S${week} ${year}`;
  }

  if (period.length === 7) {
    const [year, month] = period.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString("fr-FR", {
      month: "short",
      year: "2-digit",
    });
  }

  const [year, month, day] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

function formatPeriodDetail(period: string): string {
  if (period.includes("W")) {
    const [year, week] = period.split("-W");
    return `Semaine ${week} / ${year}`;
  }

  if (period.length === 7) {
    const [year, month] = period.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
  }

  const [year, month, day] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const PerformanceTooltip = memo(function PerformanceTooltip({
  active,
  payload,
  currency,
}: PerformanceTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const rows: ChartTooltipRow[] = [
    {
      label: "PnL net",
      value: formatMoney(point.netPnl, currency, true),
      tone:
        point.netPnl > 0
          ? "positive"
          : point.netPnl < 0
            ? "negative"
            : "default",
    },
    {
      label: "Cumulatif",
      value: formatMoney(point.cumulativePnl, currency, true),
      tone: point.cumulativePnl >= 0 ? "accent" : "negative",
    },
    {
      label: "Trades",
      value: point.tradeCount,
    },
    {
      label: "Win rate",
      value: formatPct(point.winRate),
    },
  ];

  return <ChartTooltip title={point.detail} rows={rows} />;
});

const PerformanceChart = memo(function PerformanceChart({
  breakdown,
  currency,
}: PerformanceChartProps) {
  const [period, setPeriod] = useState<PerformanceChartPeriod>("month");

  const datasets = useMemo<Record<PerformanceChartPeriod, ChartDatum[]>>(
    () => ({
      day: downsampleSeries(
        breakdown.byDay.map((point) => ({
          ...point,
          label: formatPeriodLabel(point.period),
          detail: formatPeriodDetail(point.period),
        })),
        MAX_POINTS_BY_PERIOD.day,
        (point) => point.netPnl,
      ),
      week: downsampleSeries(
        breakdown.byWeek.map((point) => ({
          ...point,
          label: formatPeriodLabel(point.period),
          detail: formatPeriodDetail(point.period),
        })),
        MAX_POINTS_BY_PERIOD.week,
        (point) => point.netPnl,
      ),
      month: downsampleSeries(
        breakdown.byMonth.map((point) => ({
          ...point,
          label: formatPeriodLabel(point.period),
          detail: formatPeriodDetail(point.period),
        })),
        MAX_POINTS_BY_PERIOD.month,
        (point) => point.netPnl,
      ),
    }),
    [breakdown.byDay, breakdown.byMonth, breakdown.byWeek],
  );
  const data = datasets[period];
  const xAxisInterval = useMemo(
    () => getAxisInterval(data.length, 10),
    [data.length],
  );
  const tooltip = useMemo(
    () => <PerformanceTooltip currency={currency} />,
    [currency],
  );

  const tabs = (
    <div
      className="period-tabs"
      role="tablist"
      aria-label="Performance generale"
    >
      {(["month", "week", "day"] as PerformanceChartPeriod[]).map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={period === value}
          className={`period-tab${period === value ? " period-tab--active" : ""}`}
          onClick={() => setPeriod(value)}
        >
          {PERIOD_LABELS[value]}
        </button>
      ))}
    </div>
  );

  if (data.length === 0) {
    return (
      <ChartCard
        className="performance-chart"
        title="Graphique de performance"
        description="PnL net et trajectoire cumulative sur les trades clôturés."
        actions={tabs}
      >
        <EmptyChartState
          title="Aucune donnée à afficher"
          description="Le graphique apparaîtra ici dès que des trades clôturés seront disponibles."
        />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      className="performance-chart"
      title="Graphique de performance"
      description="PnL par période avec trajectoire cumulative pour repérer les phases positives et négatives."
      actions={tabs}
    >
      <ChartContainer
        className="performance-chart__canvas"
        height={360}
        minHeight={360}
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
              minTickGap={18}
            />
            <YAxis
              yAxisId="net"
              tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
              axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
              tickLine={false}
              tickFormatter={formatCompactMoney}
              width={58}
            />
            <YAxis
              yAxisId="cum"
              orientation="right"
              tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
              axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
              tickLine={false}
              tickFormatter={formatCompactMoney}
              width={58}
            />
            <Tooltip content={tooltip} />
            <ReferenceLine
              yAxisId="net"
              y={0}
              stroke={TRADINGBOOK_RECHARTS_THEME.zeroLine}
            />
            <Bar
              yAxisId="net"
              dataKey="netPnl"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              {data.map((point) => (
                <Cell
                  key={point.period}
                  fill={
                    point.netPnl > 0
                      ? "var(--color-positive)"
                      : point.netPnl < 0
                        ? "var(--color-negative)"
                        : "var(--color-neutral)"
                  }
                />
              ))}
            </Bar>
            <Line
              yAxisId="cum"
              type="monotone"
              dataKey="cumulativePnl"
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

export default PerformanceChart;
