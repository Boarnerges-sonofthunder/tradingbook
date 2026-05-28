// ============================================================
// Composant - StrategyPerformanceChart
// ============================================================
// Visualise les performances par strategie/playbook.
// Les calculs viennent de strategyAnalyticsService : ce composant ne fait
// que formater et afficher les donnees preparees, incluant "Sans strategie".
// ============================================================

import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartCard,
  ChartTooltip,
  EmptyChartState,
  TRADINGBOOK_RECHARTS_THEME,
} from "../../../components/charts";
import type { ChartTooltipRow } from "../../../components/charts";
import type { StrategyStats } from "../../../types";

interface StrategyPerformanceChartProps {
  rows: StrategyStats[];
  currency: string;
}

interface StrategyChartDatum extends StrategyStats {
  shortLabel: string;
}

interface StrategyTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: StrategyChartDatum }>;
  currency: string;
}

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
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatRatio(value: number | null): string {
  if (value === null) return "∞";
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortenLabel(label: string): string {
  if (label.length <= 18) return label;
  return `${label.slice(0, 16)}...`;
}

function pnlTone(value: number): ChartTooltipRow["tone"] {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "default";
}

function winRateColor(value: number): string {
  if (value >= 60) return "var(--color-positive)";
  if (value >= 40) return "var(--color-warning)";
  return "var(--color-negative)";
}

function profitFactorColor(value: number | null): string {
  if (value === null || value >= 1.5) return "var(--color-positive)";
  if (value >= 1) return "var(--color-warning)";
  return "var(--color-negative)";
}

const StrategyTooltip = memo(function StrategyTooltip({
  active,
  payload,
  currency,
}: StrategyTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const rows: ChartTooltipRow[] = [
    {
      label: "PnL net",
      value: formatMoney(point.netPnlTotal, currency, true),
      tone: pnlTone(point.netPnlTotal),
    },
    {
      label: "Trades",
      value: point.totalTrades,
    },
    {
      label: "Win rate",
      value: formatPct(point.winRate),
      tone:
        point.winRate >= 60
          ? "positive"
          : point.winRate >= 40
            ? "warning"
            : "negative",
    },
    {
      label: "Gain moyen",
      value: formatMoney(point.avgWin, currency),
      tone: point.avgWin > 0 ? "positive" : "default",
    },
    {
      label: "Perte moyenne",
      value: formatMoney(point.avgLoss, currency),
      tone: point.avgLoss < 0 ? "negative" : "default",
    },
    {
      label: "Profit factor",
      value: formatRatio(point.profitFactor),
      tone:
        point.profitFactor === null || point.profitFactor >= 1.5
          ? "positive"
          : point.profitFactor >= 1
            ? "warning"
            : "negative",
    },
  ];

  return (
    <ChartTooltip
      title={point.strategyName}
      rows={rows}
      footer={point.isUnassigned ? "Groupe des trades sans stratégie." : null}
    />
  );
});

const PanelTitle = memo(function PanelTitle({
  children,
}: {
  children: string;
}) {
  return <div className="strategy-performance-chart__panel-title">{children}</div>;
});

const StrategyPerformanceChart = memo(function StrategyPerformanceChart({
  rows,
  currency,
}: StrategyPerformanceChartProps) {
  const data = useMemo<StrategyChartDatum[]>(
    () =>
      rows.map((row) => ({
        ...row,
        shortLabel: shortenLabel(row.strategyName),
      })),
    [rows],
  );
  const chartHeight = useMemo(
    () => Math.max(220, data.length * 38 + 48),
    [data.length],
  );
  const tooltip = useMemo(() => <StrategyTooltip currency={currency} />, [currency]);
  const pnlCells = useMemo(
    () =>
      data.map((point) => (
        <Cell
          key={`pnl-${point.strategyId}`}
          fill={
            point.netPnlTotal > 0
              ? "var(--color-positive)"
              : point.netPnlTotal < 0
                ? "var(--color-negative)"
                : "var(--color-neutral)"
          }
          opacity={point.isUnassigned ? 0.68 : 1}
        />
      )),
    [data],
  );
  const winRateCells = useMemo(
    () =>
      data.map((point) => (
        <Cell
          key={`wr-${point.strategyId}`}
          fill={winRateColor(point.winRate)}
          opacity={point.isUnassigned ? 0.68 : 1}
        />
      )),
    [data],
  );
  const profitFactorCells = useMemo(
    () =>
      data.map((point) => (
        <Cell
          key={`pf-${point.strategyId}`}
          fill={profitFactorColor(point.profitFactor)}
          opacity={point.profitFactor === null ? 0.35 : point.isUnassigned ? 0.68 : 1}
        />
      )),
    [data],
  );

  if (data.length === 0) {
    return (
      <ChartCard
        className="strategy-performance-chart"
        title="Graphiques par stratégie"
        description="PnL, activité, win rate, gain/perte moyens et profit factor par stratégie."
      >
        <EmptyChartState
          title="Aucune stratégie à afficher"
          description="Les graphiques apparaîtront ici dès que des trades fermés seront disponibles."
        />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      className="strategy-performance-chart"
      title="Graphiques par stratégie"
      description="Comparaison visuelle des stratégies sur les trades fermés, avec le groupe Sans stratégie inclus."
    >
      <div className="strategy-performance-chart__grid">
        <div className="strategy-performance-chart__panel strategy-performance-chart__panel--wide">
          <PanelTitle>PnL net par stratégie</PanelTitle>
          <div className="strategy-performance-chart__canvas" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 18, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  stroke={TRADINGBOOK_RECHARTS_THEME.grid}
                  strokeDasharray="3 3"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
                  axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
                  tickLine={false}
                  tickFormatter={formatCompactMoney}
                />
                <YAxis
                  type="category"
                  dataKey="shortLabel"
                  tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
                  axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
                  tickLine={false}
                  width={128}
                />
                <Tooltip content={tooltip} />
                <ReferenceLine
                  x={0}
                  stroke={TRADINGBOOK_RECHARTS_THEME.zeroLine}
                />
                <Bar dataKey="netPnlTotal" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {pnlCells}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="strategy-performance-chart__panel">
          <PanelTitle>Nombre de trades</PanelTitle>
          <div className="strategy-performance-chart__canvas" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 18, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  stroke={TRADINGBOOK_RECHARTS_THEME.grid}
                  strokeDasharray="3 3"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
                  axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
                  tickLine={false}
                />
                <YAxis type="category" dataKey="shortLabel" hide />
                <Tooltip content={tooltip} />
                <Bar
                  dataKey="totalTrades"
                  radius={[0, 4, 4, 0]}
                  fill="var(--color-accent)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="strategy-performance-chart__panel">
          <PanelTitle>Win rate</PanelTitle>
          <div className="strategy-performance-chart__canvas" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 18, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  stroke={TRADINGBOOK_RECHARTS_THEME.grid}
                  strokeDasharray="3 3"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
                  axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
                  tickLine={false}
                  tickFormatter={formatPct}
                />
                <YAxis type="category" dataKey="shortLabel" hide />
                <Tooltip content={tooltip} />
                <Bar dataKey="winRate" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {winRateCells}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="strategy-performance-chart__panel">
          <PanelTitle>Average win / loss</PanelTitle>
          <div className="strategy-performance-chart__canvas" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 18, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  stroke={TRADINGBOOK_RECHARTS_THEME.grid}
                  strokeDasharray="3 3"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
                  axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
                  tickLine={false}
                  tickFormatter={formatCompactMoney}
                />
                <YAxis type="category" dataKey="shortLabel" hide />
                <Tooltip content={tooltip} />
                <ReferenceLine
                  x={0}
                  stroke={TRADINGBOOK_RECHARTS_THEME.zeroLine}
                />
                <Bar
                  dataKey="avgWin"
                  radius={[0, 4, 4, 0]}
                  fill="var(--color-positive)"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="avgLoss"
                  radius={[4, 0, 0, 4]}
                  fill="var(--color-negative)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="strategy-performance-chart__panel">
          <PanelTitle>Profit factor</PanelTitle>
          <div className="strategy-performance-chart__canvas" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 18, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  stroke={TRADINGBOOK_RECHARTS_THEME.grid}
                  strokeDasharray="3 3"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
                  axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
                  tickLine={false}
                />
                <YAxis type="category" dataKey="shortLabel" hide />
                <Tooltip content={tooltip} />
                <ReferenceLine
                  x={1}
                  stroke={TRADINGBOOK_RECHARTS_THEME.zeroLine}
                />
                <Bar dataKey="profitFactor" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {profitFactorCells}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </ChartCard>
  );
});

export default StrategyPerformanceChart;
