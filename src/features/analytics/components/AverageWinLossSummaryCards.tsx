// ============================================================
// Composant — AverageWinLossSummaryCards
// ============================================================
// Affiche les statistiques Average Win / Average Loss sous forme de 6 cartes :
//   1. Gain Moyen      — avgWin  (vert si > 0, neutre si 0)
//   2. Perte Moyenne   — avgLoss (rouge si < 0, neutre si 0)
//   3. Ratio G/P       — winLossRatio (∞ = vert, coloré par seuils)
//   4. Meilleur Trade  — bestTrade  (positif → vert)
//   5. Pire Trade      — worstTrade (négatif → rouge)
//   6. Trades analysés — totalTrades + répartition en subtext
//
// Seuils du Ratio G/P (winLossRatio) :
//   null     → "∞" (aucun perdant → vert)
//   ≥ 1.5    → excellent (vert)
//   ≥ 1.0    → acceptable (orange)
//   < 1.0    → insuffisant (rouge)
//   0 + loss → "0.00" (rouge, aucun gagnant)
//
// Règle : aucune logique métier ici, seulement du formatage.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { AvgWinLossStats } from "../../../types";

// ── Helpers de formatage ───────────────────────────────────

/**
 * Formate une valeur monétaire avec 2 décimales et sa devise.
 * La valeur est affichée avec son signe naturel (perte = négative).
 */
function formatMoney(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

/**
 * Formate le ratio gain/perte.
 * null → "∞" (aucun perdant = ratio infini).
 */
function formatRatio(value: number | null): string {
  if (value === null) return "∞";
  return value.toFixed(2);
}

// ── Helpers de variante ────────────────────────────────────

/**
 * Variante pour les montants positifs (gains).
 * Neutre si 0, positif sinon.
 */
function positiveVariant(value: number): "positive" | "neutral" {
  return value > 0 ? "positive" : "neutral";
}

/**
 * Variante pour les montants négatifs (pertes).
 * Neutre si 0, négatif sinon.
 */
function negativeVariant(value: number): "negative" | "neutral" {
  return value < 0 ? "negative" : "neutral";
}

/**
 * Variante de couleur pour le Ratio Gain/Perte.
 *   null (∞)  → positive  (aucune perte = idéal)
 *   ≥ 1.5     → positive  (excellent : les gains dépassent largement les pertes)
 *   ≥ 1.0     → warning   (acceptable : les gains couvrent les pertes)
 *   < 1.0     → negative  (insuffisant : les pertes dépassent les gains)
 */
function ratioVariant(
  ratio: number | null,
): "positive" | "warning" | "negative" | "neutral" {
  if (ratio === null) return "positive"; // ∞ — aucune perte
  if (ratio >= 1.5) return "positive";
  if (ratio >= 1.0) return "warning";
  return "negative";
}

// ── Composant principal ────────────────────────────────────

interface AverageWinLossSummaryCardsProps {
  currency: string;
  stats: AvgWinLossStats;
}

export default function AverageWinLossSummaryCards({
  currency,
  stats,
}: AverageWinLossSummaryCardsProps) {
  const {
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    avgWin,
    avgLoss,
    winLossRatio,
    bestTrade,
    worstTrade,
  } = stats;

  return (
    <div className="awl-cards">
      {/* ── Carte 1 : Gain Moyen ── */}
      <StatCard
        label="Gain Moyen"
        value={formatMoney(avgWin, currency)}
        subtext={`${winningTrades} trade${winningTrades > 1 ? "s" : ""} gagnant${winningTrades > 1 ? "s" : ""}`}
        variant={positiveVariant(avgWin)}
      />

      {/* ── Carte 2 : Perte Moyenne ── */}
      <StatCard
        label="Perte Moyenne"
        value={formatMoney(avgLoss, currency)}
        subtext={`${losingTrades} trade${losingTrades > 1 ? "s" : ""} perdant${losingTrades > 1 ? "s" : ""}`}
        variant={negativeVariant(avgLoss)}
      />

      {/* ── Carte 3 : Ratio Gain/Perte ── */}
      <StatCard
        label="Ratio G/P"
        value={formatRatio(winLossRatio)}
        subtext="gain moy. / |perte moy.|"
        variant={ratioVariant(winLossRatio)}
      />

      {/* ── Carte 4 : Meilleur Trade ── */}
      <StatCard
        label="Meilleur Trade"
        value={formatMoney(bestTrade, currency)}
        subtext="net_pnl maximal"
        variant={positiveVariant(bestTrade)}
      />

      {/* ── Carte 5 : Pire Trade ── */}
      <StatCard
        label="Pire Trade"
        value={formatMoney(worstTrade, currency)}
        subtext="net_pnl minimal"
        variant={negativeVariant(worstTrade)}
      />

      {/* ── Carte 6 : Trades analysés ── */}
      <StatCard
        label="Trades Analysés"
        value={String(totalTrades)}
        subtext={
          breakevenTrades > 0
            ? `${winningTrades} G / ${losingTrades} P / ${breakevenTrades} BE`
            : `${winningTrades} gagnants / ${losingTrades} perdants`
        }
        variant="neutral"
      />
    </div>
  );
}
