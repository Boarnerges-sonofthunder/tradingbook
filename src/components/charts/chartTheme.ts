// ============================================================
// Theme - Charts TradingBook
// ============================================================
// Palette et presets reutilisables pour garder une coherence
// entre Recharts (graphiques React declaratifs) et
// Lightweight Charts (series denses / plus "market data").
// ============================================================

import {
  ColorType,
  LineStyle,
  type ChartOptions,
  type DeepPartial,
} from "lightweight-charts";

export const TRADINGBOOK_CHART_COLORS = {
  surface: "var(--color-bg-secondary)",
  surfaceAlt: "var(--color-bg-tertiary)",
  textPrimary: "var(--color-text-primary)",
  textSecondary: "var(--color-text-secondary)",
  border: "var(--color-border)",
  accent: "var(--color-accent)",
  accentSoft: "color-mix(in srgb, var(--color-accent) 18%, transparent)",
  positive: "var(--color-positive)",
  negative: "var(--color-negative)",
  warning: "var(--color-warning)",
  neutral: "var(--color-neutral)",
} as const;

export const TRADINGBOOK_RECHARTS_THEME = {
  axisLine: TRADINGBOOK_CHART_COLORS.border,
  axisTick: {
    fill: TRADINGBOOK_CHART_COLORS.textSecondary,
    fontSize: 11,
  },
  grid: TRADINGBOOK_CHART_COLORS.border,
  zeroLine: TRADINGBOOK_CHART_COLORS.border,
  series: {
    equity: TRADINGBOOK_CHART_COLORS.accent,
    drawdown: TRADINGBOOK_CHART_COLORS.warning,
    pnl: TRADINGBOOK_CHART_COLORS.accent,
    positive: TRADINGBOOK_CHART_COLORS.positive,
    negative: TRADINGBOOK_CHART_COLORS.negative,
  },
} as const;

export function createTradingBookLightweightTheme(): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: {
        type: ColorType.Solid,
        color: "#161b27",
      },
      textColor: "#8892a4",
      attributionLogo: false,
    },
    grid: {
      vertLines: {
        color: "#2a3040",
        style: LineStyle.Dotted,
      },
      horzLines: {
        color: "#2a3040",
        style: LineStyle.Dotted,
      },
    },
    crosshair: {
      vertLine: {
        color: "#4a90e2",
        labelBackgroundColor: "#4a90e2",
      },
      horzLine: {
        color: "#2a3040",
        labelBackgroundColor: "#1e2533",
      },
    },
    rightPriceScale: {
      borderColor: "#2a3040",
    },
    timeScale: {
      borderColor: "#2a3040",
      timeVisible: true,
      secondsVisible: false,
    },
  };
}
