// ============================================================
// Composant — StrategySummaryCards
// ============================================================
// 4 cartes de résumé tirées de StrategyOverviewStats :
//
//   1. Meilleure Stratégie  — PnL net total le plus élevé
//   2. Pire Stratégie       — PnL net total le plus bas
//   3. Plus Utilisée        — nombre de trades le plus élevé
//   4. Meilleur Win Rate    — % gagnant le plus élevé (≥ 5 trades)
//
// Note : le groupe "Sans stratégie" est exclu des classements.
// Règle : aucune logique métier ici, seulement du formatage.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { StrategyOverviewStats } from "../../../types";

// ── Helpers de formatage ───────────────────────────────────

function formatMoney(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

function formatWinRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ── Helpers de variante ────────────────────────────────────

function pnlVariant(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

// ── Composant principal ────────────────────────────────────

interface StrategySummaryCardsProps {
  currency: string;
  overview: StrategyOverviewStats;
}

export default function StrategySummaryCards({
  currency,
  overview,
}: StrategySummaryCardsProps) {
  const {
    totalStrategies,
    unassignedTrades,
    bestStrategy,
    bestStrategyPnl,
    worstStrategy,
    worstStrategyPnl,
    mostUsedStrategy,
    mostUsedCount,
    bestWinRateStrategy,
    bestWinRate,
  } = overview;

  const strategiesSubtext =
    totalStrategies > 0
      ? `${totalStrategies} stratégie${totalStrategies > 1 ? "s" : ""} analysée${totalStrategies > 1 ? "s" : ""}`
      : "Aucune stratégie affectée";

  const unassignedSubtext =
    unassignedTrades > 0 ? ` · ${unassignedTrades} sans stratégie` : "";

  return (
    <div className="strategy-summary-cards">
      {/* ── Carte 1 : Meilleure stratégie ── */}
      <StatCard
        label="Meilleure Stratégie"
        value={bestStrategy ?? "—"}
        subtext={
          bestStrategy !== null
            ? formatMoney(bestStrategyPnl, currency)
            : strategiesSubtext + unassignedSubtext
        }
        variant={
          bestStrategy !== null ? pnlVariant(bestStrategyPnl) : "neutral"
        }
      />

      {/* ── Carte 2 : Pire stratégie ── */}
      <StatCard
        label="Pire Stratégie"
        value={worstStrategy ?? "—"}
        subtext={
          worstStrategy !== null
            ? formatMoney(worstStrategyPnl, currency)
            : "Données insuffisantes"
        }
        variant={
          worstStrategy !== null ? pnlVariant(worstStrategyPnl) : "neutral"
        }
      />

      {/* ── Carte 3 : Stratégie la plus utilisée ── */}
      <StatCard
        label="Plus Utilisée"
        value={mostUsedStrategy ?? "—"}
        subtext={
          mostUsedStrategy !== null
            ? `${mostUsedCount} trade${mostUsedCount > 1 ? "s" : ""} fermé${mostUsedCount > 1 ? "s" : ""}`
            : "Aucune stratégie affectée"
        }
        variant="neutral"
      />

      {/* ── Carte 4 : Meilleur win rate ── */}
      <StatCard
        label="Meilleur Win Rate"
        value={bestWinRateStrategy ?? "—"}
        subtext={
          bestWinRateStrategy !== null
            ? formatWinRate(bestWinRate)
            : "≥ 5 trades requis"
        }
        variant={bestWinRateStrategy !== null ? "positive" : "neutral"}
      />
    </div>
  );
}
