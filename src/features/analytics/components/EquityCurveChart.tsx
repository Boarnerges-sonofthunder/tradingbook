// ============================================================
// Composant - EquityCurveChart
// ============================================================
// Graphique de la courbe d'equite.
// Les points sont deja prepares par equityCurveAnalyticsService.
// Le composant se limite donc a la presentation et au formatage UI.
// ============================================================

import { memo, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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
import type { EquityCurvePoint, EquityDatePoint } from "../../../types";
import { downsampleSeries, getAxisInterval } from "./chartDisplayUtils";

type ChartMode = "trade" | "date";

interface ChartDatum {
  label: string;
  title: string;
  date: string;
  equity: number;
  netPnl: number;
  tradeIndex?: number;
  symbol?: string;
  drawdown?: number;
  drawdownPct?: number;
  tradeCount?: number;
}

interface EquityCurveChartProps {
  byTrade: EquityCurvePoint[];
  byDate: EquityDatePoint[];
  currency: string;
}

interface EquityTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
  currency: string;
}

const MAX_TRADE_POINTS = 160;
const MAX_DATE_POINTS = 120;

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

const EquityTooltip = memo(function EquityTooltip({
  active,
  payload,
  currency,
}: EquityTooltipProps) {
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
      label: "PnL net",
      value: formatMoney(point.netPnl, currency, true),
      tone:
        point.netPnl > 0
          ? "positive"
          : point.netPnl < 0
            ? "negative"
            : "default",
    },
  ];

  if (point.tradeIndex !== undefined) {
    rows.unshift({
      label: "Trade",
      value: `#${point.tradeIndex}${point.symbol ? ` - ${point.symbol}` : ""}`,
    });
  }

  if (point.drawdown !== undefined) {
    rows.push({
      label: "Drawdown",
      value: `${formatMoney(point.drawdown, currency)}${
        point.drawdownPct !== undefined
          ? ` (${formatPct(point.drawdownPct)})`
          : ""
      }`,
      tone: "warning",
    });
  }

  if (point.tradeCount !== undefined) {
    rows.push({
      label: "Trades",
      value: point.tradeCount,
    });
  }

  return <ChartTooltip title={point.title} rows={rows} />;
});

const EquityCurveChart = memo(function EquityCurveChart({
  byTrade,
  byDate,
  currency,
}: EquityCurveChartProps) {
  const [mode, setMode] = useState<ChartMode>("date");

  const datasets = useMemo<Record<ChartMode, ChartDatum[]>>(
    () => ({
      trade: downsampleSeries(
        byTrade.map((point) => ({
          label: `#${point.index}`,
          title: `${point.symbol} - ${formatDateShort(point.date)}`,
          date: point.closedAt || point.date,
          equity: point.equity,
          netPnl: point.netPnl,
          tradeIndex: point.index,
          symbol: point.symbol,
          drawdown: point.drawdown,
          drawdownPct: point.drawdownPct,
        })),
        MAX_TRADE_POINTS,
        (point) => point.equity,
      ),
      date: downsampleSeries(
        byDate.map((point) => ({
          label: formatDateShort(point.date),
          title: `Cloture du ${formatDateShort(point.date)}`,
          date: point.date,
          equity: point.equity,
          netPnl: point.netPnl,
          tradeCount: point.tradeCount,
        })),
        MAX_DATE_POINTS,
        (point) => point.equity,
      ),
    }),
    [byDate, byTrade],
  );

  const data = mode === "trade" ? datasets.trade : datasets.date;
  const xAxisInterval = useMemo(
    () => getAxisInterval(data.length, mode === "trade" ? 8 : 10),
    [data.length, mode],
  );
  const tooltip = useMemo(
    () => <EquityTooltip currency={currency} />,
    [currency],
  );

  const tabs = (
    <div className="period-tabs" role="tablist" aria-label="Courbe d'équité">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "date"}
        className={`period-tab${mode === "date" ? " period-tab--active" : ""}`}
        onClick={() => setMode("date")}
      >
        Par date
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "trade"}
        className={`period-tab${mode === "trade" ? " period-tab--active" : ""}`}
        onClick={() => setMode("trade")}
      >
        Par trade
      </button>
    </div>
  );

  if (byTrade.length === 0) {
    return (
      <ChartCard
        className="equity-chart"
        title="Courbe d'équité"
        description="Évolution cumulative du PnL net sur les trades clôturés."
        actions={tabs}
      >
        <EmptyChartState
          title="Aucun trade fermé à afficher"
          description="La courbe apparaîtra ici dès que des trades clôturés seront disponibles."
        />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      className="equity-chart"
      title="Courbe d'équité"
      description="Vue cumulative du PnL net, par date ou par trade."
      actions={tabs}
    >
      <ChartContainer
        className="equity-chart__canvas"
        height={320}
        minHeight={320}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
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
              tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
              axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
              tickLine={false}
              tickFormatter={formatCompactMoney}
              width={58}
            />
            <Tooltip content={tooltip} />
            <ReferenceLine y={0} stroke={TRADINGBOOK_RECHARTS_THEME.zeroLine} />
            <Line
              type="monotone"
              dataKey="equity"
              stroke={TRADINGBOOK_RECHARTS_THEME.series.equity}
              strokeWidth={2}
              dot={data.length <= 20 ? { r: 3 } : false}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </ChartCard>
  );
});

export default EquityCurveChart;
