// ============================================================
// Composant - ProfitLossDistributionChart
// ============================================================
// Histogramme horizontal de distribution des trades fermes par
// tranche de net_pnl. Les calculs de bucketisation restent dans
// profitLossDistributionAnalyticsService.
// ============================================================

import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  ProfitLossDistributionBucket,
  ProfitLossDistributionStats,
} from "../../../types";

interface ProfitLossDistributionChartProps {
  buckets: ProfitLossDistributionBucket[];
  currency: string;
  stats: ProfitLossDistributionStats;
}

interface DistributionTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ProfitLossDistributionBucket }>;
  currency: string;
}

function formatMoney(value: number, currency: string, signed = false): string {
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

const DistributionTooltip = memo(function DistributionTooltip({
  active,
  payload,
  currency,
}: DistributionTooltipProps) {
  if (!active || !payload?.length) return null;

  const bucket = payload[0].payload;
  const rows: ChartTooltipRow[] = [
    {
      label: "Trades",
      value: bucket.tradeCount,
    },
    {
      label: "PnL moyen",
      value:
        bucket.avgPnl === null
          ? "-"
          : formatMoney(bucket.avgPnl, currency, true),
      tone:
        bucket.avgPnl === null
          ? "default"
          : bucket.avgPnl > 0
            ? "positive"
            : bucket.avgPnl < 0
              ? "negative"
              : "warning",
    },
    {
      label: "PnL cumule",
      value: formatMoney(bucket.netPnlTotal, currency, true),
      tone:
        bucket.netPnlTotal > 0
          ? "positive"
          : bucket.netPnlTotal < 0
            ? "negative"
            : "warning",
    },
  ];

  return <ChartTooltip title={bucket.label} rows={rows} />;
});

function bucketColor(kind: ProfitLossDistributionBucket["kind"]): string {
  if (kind === "gain") return "var(--color-positive)";
  if (kind === "loss") return "var(--color-negative)";
  return "var(--color-warning)";
}

const ProfitLossDistributionChart = memo(function ProfitLossDistributionChart({
  buckets,
  currency,
  stats,
}: ProfitLossDistributionChartProps) {
  const footer = useMemo(
    () => (
      <div className="profit-loss-distribution-chart__footer">
        <div className="profit-loss-distribution-chart__legend">
          <span className="profit-loss-distribution-chart__legend-item profit-loss-distribution-chart__legend-item--loss">
            Pertes
          </span>
          <span className="profit-loss-distribution-chart__legend-item profit-loss-distribution-chart__legend-item--breakeven">
            Breakeven
          </span>
          <span className="profit-loss-distribution-chart__legend-item profit-loss-distribution-chart__legend-item--gain">
            Gains
          </span>
        </div>
        <span className="profit-loss-distribution-chart__step">
          Pas automatique : {formatMoney(stats.bucketSize, currency)}
        </span>
      </div>
    ),
    [currency, stats.bucketSize],
  );

  if (buckets.length === 0) {
    return (
      <ChartCard
        className="profit-loss-distribution-chart"
        title="Distribution des gains et pertes"
        description="Répartition des trades fermés par tranche de PnL net."
      >
        <EmptyChartState
          title="Aucune distribution à afficher"
          description="Le graphique apparaîtra ici dès que des trades fermés seront disponibles."
        />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      className="profit-loss-distribution-chart"
      title="Distribution des gains et pertes"
      description="Histogramme des trades fermés pour distinguer petites pertes, grosses pertes, breakeven, petits gains et gros gains."
      footer={footer}
    >
      <ChartContainer
        className="profit-loss-distribution-chart__canvas"
        height={400}
        minHeight={400}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={buckets}
            layout="vertical"
            margin={{ top: 8, right: 24, bottom: 8, left: 12 }}
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
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="shortLabel"
              width={120}
              tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
              axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
              tickLine={false}
            />
            <Tooltip content={<DistributionTooltip currency={currency} />} />
            <Bar
              dataKey="tradeCount"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              {buckets.map((bucket) => (
                <Cell key={bucket.bucketId} fill={bucketColor(bucket.kind)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </ChartCard>
  );
});

export default ProfitLossDistributionChart;
