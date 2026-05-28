import StatCard from "../../dashboard/components/StatCard";
import type { BrokerOverviewStats } from "../../../types";

interface BrokerSummaryCardsProps {
  overview: BrokerOverviewStats;
}

function formatMoney(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

function pnlVariant(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

export default function BrokerSummaryCards({
  overview,
}: BrokerSummaryCardsProps) {
  return (
    <div className="symbol-summary-cards">
      <StatCard
        label="Meilleur Broker"
        value={overview.bestBroker ?? "—"}
        subtext={
          overview.bestBroker
            ? formatMoney(overview.bestBrokerPnl, overview.currency)
            : `${overview.totalBrokers} broker(s) analysé(s)`
        }
        variant={
          overview.bestBroker ? pnlVariant(overview.bestBrokerPnl) : "neutral"
        }
      />

      <StatCard
        label="Pire Broker"
        value={overview.worstBroker ?? "—"}
        subtext={
          overview.worstBroker
            ? formatMoney(overview.worstBrokerPnl, overview.currency)
            : "Données insuffisantes"
        }
        variant={
          overview.worstBroker ? pnlVariant(overview.worstBrokerPnl) : "neutral"
        }
      />

      <StatCard
        label="Broker le plus tradé"
        value={overview.mostTradedBroker ?? "—"}
        subtext={
          overview.mostTradedBroker
            ? `${overview.mostTradedCount} trade(s) fermé(s)`
            : "Aucun trade"
        }
        variant="neutral"
      />

      <StatCard
        label="Meilleur Win Rate"
        value={overview.bestWinRateBroker ?? "—"}
        subtext={
          overview.bestWinRateBroker
            ? `${overview.bestWinRate.toFixed(1)}%`
            : "≥ 5 trades requis"
        }
        variant={overview.bestWinRateBroker ? "positive" : "neutral"}
      />
    </div>
  );
}
