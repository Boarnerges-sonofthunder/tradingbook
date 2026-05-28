// ============================================================
// Composant — WinRateSummaryCards
// ============================================================
// Affiche les statistiques de win rate sous forme de :
//   1. Grille de 4 cartes (win rate, loss rate, breakeven, total)
//   2. Barre de répartition visuelle (vert / gris / rouge)
//   3. Légende de la barre
//
// Règle : aucune logique métier ici, seulement du formatage.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { WinRateStats } from "../../../types";

// ============================================================
// Helpers de formatage
// ============================================================

/**
 * Formate un taux en pourcentage avec une décimale.
 * Ex : 65.4 → "65.4%"
 */
function formatRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Retourne la variante de couleur selon le win rate.
 * ≥ 50% → positive | > 0% → warning | 0% → negative
 */
function winRateVariant(winRate: number): "positive" | "warning" | "negative" {
  if (winRate >= 50) return "positive";
  if (winRate > 0) return "warning";
  return "negative";
}

// ============================================================
// Composant principal
// ============================================================

interface WinRateSummaryCardsProps {
  stats: WinRateStats;
}

export default function WinRateSummaryCards({
  stats,
}: WinRateSummaryCardsProps) {
  const { winningTrades, losingTrades, breakevenTrades, totalTrades } = stats;

  return (
    <div className="winrate-summary">
      {/* ── 4 cartes statistiques ──────────────────────────── */}
      <div className="winrate-cards">
        {/* Win Rate */}
        <StatCard
          label="Win Rate"
          value={formatRate(stats.winRate)}
          subtext={`${winningTrades} trade${winningTrades !== 1 ? "s" : ""} gagnant${winningTrades !== 1 ? "s" : ""}`}
          variant={winRateVariant(stats.winRate)}
        />

        {/* Loss Rate */}
        <StatCard
          label="Loss Rate"
          value={formatRate(stats.lossRate)}
          subtext={`${losingTrades} trade${losingTrades !== 1 ? "s" : ""} perdant${losingTrades !== 1 ? "s" : ""}`}
          variant={losingTrades > 0 ? "negative" : "neutral"}
        />

        {/* Breakeven Rate */}
        <StatCard
          label="Breakeven"
          value={formatRate(stats.breakevenRate)}
          subtext={`${breakevenTrades} à l'équilibre`}
          variant="neutral"
        />

        {/* Total trades */}
        <StatCard
          label="Total Trades"
          value={String(totalTrades)}
          subtext="trades fermés analysés"
          variant="default"
        />
      </div>

      {/* ── Barre de répartition visuelle ─────────────────── */}
      {/*
        Chaque segment occupe un pourcentage de la largeur totale.
        Ordre : gagnants (vert) → breakeven (gris) → perdants (rouge)
      */}
      <div
        className="winrate-bar"
        role="img"
        aria-label={`Répartition : ${formatRate(stats.winRate)} gagnants, ${formatRate(stats.breakevenRate)} breakeven, ${formatRate(stats.lossRate)} perdants`}
      >
        <div
          className="winrate-bar__segment winrate-bar__segment--win"
          style={{ width: `${stats.winRate}%` }}
        />
        <div
          className="winrate-bar__segment winrate-bar__segment--be"
          style={{ width: `${stats.breakevenRate}%` }}
        />
        <div
          className="winrate-bar__segment winrate-bar__segment--loss"
          style={{ width: `${stats.lossRate}%` }}
        />
      </div>

      {/* ── Légende ───────────────────────────────────────── */}
      <div className="winrate-bar-legend">
        <span className="winrate-bar-legend__item winrate-bar-legend__item--win">
          Gagnants {formatRate(stats.winRate)}
        </span>
        <span className="winrate-bar-legend__item winrate-bar-legend__item--be">
          Breakeven {formatRate(stats.breakevenRate)}
        </span>
        <span className="winrate-bar-legend__item winrate-bar-legend__item--loss">
          Perdants {formatRate(stats.lossRate)}
        </span>
      </div>
    </div>
  );
}
