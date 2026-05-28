// ============================================================
// Composant - MonthlyPerformanceSummary
// ============================================================
// Cartes de resume du mois selectionne dans le calendrier.
// Les valeurs sont deja calculees par le service analytics.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { PerformanceCalendarMonthSummary } from "../../../types";

function formatMoney(value: number, currency: string, signed = false): string {
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatPct(value: number): string {
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

function variant(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

interface MonthlyPerformanceSummaryProps {
  summary: PerformanceCalendarMonthSummary;
}

export default function MonthlyPerformanceSummary({
  summary,
}: MonthlyPerformanceSummaryProps) {
  const { currency } = summary;

  return (
    <div className="performance-month-summary">
      <StatCard
        label="PnL net du mois"
        value={formatMoney(summary.netPnl, currency, true)}
        subtext={`${summary.tradingDays} jour${summary.tradingDays > 1 ? "s" : ""} tradé${summary.tradingDays > 1 ? "s" : ""}`}
        variant={variant(summary.netPnl)}
      />
      <StatCard
        label="Trades du mois"
        value={String(summary.trades)}
        subtext={`${summary.winningTrades} gagnants · ${summary.losingTrades} perdants`}
        variant="neutral"
      />
      <StatCard
        label="Win rate"
        value={formatPct(summary.winRate)}
        subtext="Basé sur les trades fermés"
        variant={summary.winRate >= 50 ? "positive" : "warning"}
      />
      <StatCard
        label="Jours gagnants"
        value={String(summary.winningDays)}
        subtext={`${summary.losingDays} perdants · ${summary.neutralDays} neutres`}
        variant={summary.winningDays > summary.losingDays ? "positive" : "neutral"}
      />
      <StatCard
        label="Meilleur jour"
        value={formatMoney(summary.bestDayPnl, currency, true)}
        subtext={formatDate(summary.bestDay)}
        variant={variant(summary.bestDayPnl)}
      />
      <StatCard
        label="Pire jour"
        value={formatMoney(summary.worstDayPnl, currency, true)}
        subtext={formatDate(summary.worstDay)}
        variant={variant(summary.worstDayPnl)}
      />
    </div>
  );
}
