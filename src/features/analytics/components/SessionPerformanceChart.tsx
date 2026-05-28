// ============================================================
// Composant - SessionPerformanceChart
// ============================================================
// Visualise la performance des trades fermes selon les sessions.
//
// Le composant ne calcule rien :
//   - il recoit directement `SessionStats[]` depuis sessionAnalyticsService
//   - il affiche PnL net, nombre de trades et win rate
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
import type { SessionStats } from "../../../types";

interface SessionPerformanceChartProps {
  sessions: SessionStats[];
  currency: string;
}

interface SessionChartDatum extends SessionStats {
  shortLabel: string;
}

interface SessionTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SessionChartDatum }>;
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

function shortenSessionLabel(sessionName: string): string {
  switch (sessionName) {
    case "Overlap London/NY":
      return "Overlap";
    case "Hors session":
      return "Hors";
    default:
      return sessionName;
  }
}

const SessionTooltip = memo(function SessionTooltip({
  active,
  payload,
  currency,
}: SessionTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const rows: ChartTooltipRow[] = [
    {
      label: "PnL net",
      value: formatMoney(point.netPnlTotal, currency, true),
      tone:
        point.netPnlTotal > 0
          ? "positive"
          : point.netPnlTotal < 0
            ? "negative"
            : "default",
    },
    {
      label: "Trades",
      value: point.totalTrades,
    },
    {
      label: "Win rate",
      value: formatPct(point.winRate),
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
  ];

  if (point.profitFactor !== null) {
    rows.push({
      label: "Profit factor",
      value: point.profitFactor.toFixed(2),
      tone:
        point.profitFactor >= 1.5
          ? "positive"
          : point.profitFactor >= 1
            ? "warning"
            : "negative",
    });
  }

  return <ChartTooltip title={point.sessionName} rows={rows} />;
});

const SessionPerformanceChart = memo(function SessionPerformanceChart({
  sessions,
  currency,
}: SessionPerformanceChartProps) {
  const data = useMemo<SessionChartDatum[]>(
    () =>
      sessions.map((session) => ({
        ...session,
        shortLabel: shortenSessionLabel(session.sessionName),
      })),
    [sessions],
  );
  const tooltip = useMemo(() => <SessionTooltip currency={currency} />, [currency]);
  const pnlCells = useMemo(
    () =>
      data.map((point) => (
        <Cell
          key={`pnl-${point.sessionId}`}
          fill={
            point.netPnlTotal > 0
              ? "var(--color-positive)"
              : point.netPnlTotal < 0
                ? "var(--color-negative)"
                : "var(--color-neutral)"
          }
        />
      )),
    [data],
  );
  const winRateCells = useMemo(
    () =>
      data.map((point) => (
        <Cell
          key={`wr-${point.sessionId}`}
          fill={
            point.winRate >= 60
              ? "var(--color-positive)"
              : point.winRate >= 40
                ? "var(--color-warning)"
                : "var(--color-negative)"
          }
        />
      )),
    [data],
  );

  if (data.length === 0) {
    return (
      <ChartCard
        className="session-performance-chart"
        title="Graphiques par session"
        description="PnL, activité et win rate sur les trades fermés, regroupés par session."
      >
        <EmptyChartState
          title="Aucune session à afficher"
          description="Les graphiques apparaîtront ici dès que des trades fermés seront disponibles."
        />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      className="session-performance-chart"
      title="Graphiques par session"
      description="Comparaison visuelle du PnL net, du nombre de trades et du win rate selon la session."
    >
      <div className="session-performance-chart__stack">
        <div className="session-performance-chart__panel">
          <div className="session-performance-chart__panel-title">PnL net</div>
          <div className="session-performance-chart__canvas">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
              >
                <CartesianGrid
                  stroke={TRADINGBOOK_RECHARTS_THEME.grid}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis dataKey="shortLabel" hide />
                <YAxis
                  tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
                  axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
                  tickLine={false}
                  tickFormatter={formatCompactMoney}
                  width={58}
                />
                <Tooltip content={tooltip} />
                <ReferenceLine
                  y={0}
                  stroke={TRADINGBOOK_RECHARTS_THEME.zeroLine}
                />
                <Bar dataKey="netPnlTotal" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {pnlCells}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="session-performance-chart__panel">
          <div className="session-performance-chart__panel-title">Trades</div>
          <div className="session-performance-chart__canvas">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
              >
                <CartesianGrid
                  stroke={TRADINGBOOK_RECHARTS_THEME.grid}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis dataKey="shortLabel" hide />
                <YAxis
                  tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
                  axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
                  tickLine={false}
                  allowDecimals={false}
                  width={58}
                />
                <Tooltip content={tooltip} />
                <Bar
                  dataKey="totalTrades"
                  radius={[4, 4, 0, 0]}
                  fill="var(--color-accent)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="session-performance-chart__panel">
          <div className="session-performance-chart__panel-title">Win rate</div>
          <div className="session-performance-chart__canvas">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, bottom: 8, left: 4 }}
              >
                <CartesianGrid
                  stroke={TRADINGBOOK_RECHARTS_THEME.grid}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="shortLabel"
                  tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
                  axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={TRADINGBOOK_RECHARTS_THEME.axisTick}
                  axisLine={{ stroke: TRADINGBOOK_RECHARTS_THEME.axisLine }}
                  tickLine={false}
                  tickFormatter={formatPct}
                  width={58}
                />
                <Tooltip content={tooltip} />
                <Bar dataKey="winRate" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {winRateCells}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </ChartCard>
  );
});

export default SessionPerformanceChart;
