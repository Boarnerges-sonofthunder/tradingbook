// ============================================================
// Composant - EquityCurveSummaryCards
// ============================================================
// Affiche les mesures principales de la courbe d'equite.
// Regle : aucun calcul metier ici, seulement du formatage UI.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { EquityCurveStats } from "../../../types";

function formatMoney(value: number, currency: string, signed = false): string {
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatPct(value: number): string {
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "Départ";
  const [year, month, day] = dateStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function pnlVariant(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

interface EquityCurveSummaryCardsProps {
  currency: string;
  stats: EquityCurveStats;
}

export default function EquityCurveSummaryCards({
  currency,
  stats,
}: EquityCurveSummaryCardsProps) {
  const hasDrawdown = stats.maxDrawdown < 0;

  return (
    <div className="equity-cards">
      <StatCard
        label="Équité finale"
        value={formatMoney(stats.finalEquity, currency, true)}
        subtext={`${stats.totalTrades} trade${stats.totalTrades > 1 ? "s" : ""} fermé${stats.totalTrades > 1 ? "s" : ""}`}
        variant={pnlVariant(stats.finalEquity)}
      />

      <StatCard
        label="Variation totale"
        value={formatMoney(stats.totalVariation, currency, true)}
        subtext="Depuis l'équité de départ"
        variant={pnlVariant(stats.totalVariation)}
      />

      <StatCard
        label="Plus haut sommet"
        value={formatMoney(stats.highestPeak, currency)}
        subtext={formatDateShort(stats.highestPeakDate)}
        variant={stats.highestPeak > 0 ? "positive" : "neutral"}
      />

      <StatCard
        label="Plus bas creux"
        value={formatMoney(stats.lowestTrough, currency)}
        subtext={formatDateShort(stats.lowestTroughDate)}
        variant={stats.lowestTrough < 0 ? "negative" : "neutral"}
      />

      <StatCard
        label="Drawdown maximum"
        value={formatMoney(stats.maxDrawdown, currency)}
        subtext={
          hasDrawdown ? `${formatPct(stats.maxDrawdownPct)} du sommet` : "Aucun drawdown"
        }
        variant={hasDrawdown ? "negative" : "positive"}
      />

      <StatCard
        label="Drawdown actuel"
        value={formatMoney(stats.currentDrawdown, currency)}
        subtext={
          stats.currentDrawdown < 0
            ? `${formatPct(stats.currentDrawdownPct)} du sommet`
            : "Équité au sommet"
        }
        variant={stats.currentDrawdown < 0 ? "negative" : "positive"}
      />
    </div>
  );
}
