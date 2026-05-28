// ============================================================
// Composant — ProfitFactorSummaryCards
// ============================================================
// Affiche les statistiques de Profit Factor sous forme de 6 cartes :
//   1. Profit Factor   — ratio global gains / |pertes|
//   2. Payoff Ratio    — gain moyen / perte moyenne absolue
//   3. Total Gains     — somme des net_pnl positifs
//   4. Total Pertes    — somme des net_pnl négatifs (valeur abs.)
//   5. Gain Moyen      — gain moyen par trade gagnant
//   6. Perte Moyenne   — perte moyenne par trade perdant (valeur abs.)
//
// Seuils du Profit Factor :
//   ≥ 2.0 → excellent (vert)  |  ≥ 1.5 → bon (vert clair)
//   ≥ 1.0 → acceptable (orange)  |  < 1.0 → insuffisant (rouge)
//   null  → "∞" — aucun trade perdant (vert)
//
// Règle : aucune logique métier ici, seulement du formatage.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { ProfitFactorStats } from "../../../types";

// ── Helpers de formatage ───────────────────────────────────

/**
 * Formate une valeur monétaire avec 2 décimales.
 * Ex : 1250.5 → "1250.50 USD"
 */
function formatMoney(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

/**
 * Formate un ratio avec 2 décimales.
 * null → "∞" (aucune perte = profit factor infini).
 */
function formatRatio(value: number | null): string {
  if (value === null) return "∞";
  return value.toFixed(2);
}

// ── Helpers de variante ────────────────────────────────────

/**
 * Variante de couleur pour le Profit Factor.
 *   null (∞) → positive  |  ≥ 1.5 → positive  |  ≥ 1.0 → warning
 *   > 0      → negative  |  = 0   → negative
 */
function pfVariant(
  pf: number | null,
): "positive" | "warning" | "negative" | "neutral" {
  if (pf === null) return "positive"; // ∞ — aucune perte
  if (pf >= 1.5) return "positive";
  if (pf >= 1.0) return "warning";
  return "negative";
}

/**
 * Variante de couleur pour le Payoff Ratio.
 *   null → neutral  |  ≥ 2.0 → positive  |  ≥ 1.0 → warning  |  < 1.0 → negative
 */
function payoffVariant(
  ratio: number | null,
): "positive" | "warning" | "negative" | "neutral" {
  if (ratio === null) return "neutral";
  if (ratio >= 2.0) return "positive";
  if (ratio >= 1.0) return "warning";
  return "negative";
}

// ── Composant principal ────────────────────────────────────

interface ProfitFactorSummaryCardsProps {
  currency: string;
  stats: ProfitFactorStats;
}

export default function ProfitFactorSummaryCards({
  currency,
  stats,
}: ProfitFactorSummaryCardsProps) {

  // Texte du Profit Factor (cas ∞ spécial)
  const pfValue = formatRatio(stats.profitFactor);
  const pfSubtext =
    stats.profitFactor === null && stats.totalLosses === 0
      ? stats.winningTrades > 0
        ? "Aucune perte enregistrée"
        : "Aucun trade gagnant ni perdant"
      : `${stats.winningTrades}W / ${stats.losingTrades}L / ${stats.breakevenTrades}BE`;

  return (
    <div className="pf-cards">
      {/* Profit Factor global */}
      <StatCard
        label="Profit Factor"
        value={pfValue}
        subtext={pfSubtext}
        variant={pfVariant(stats.profitFactor)}
      />

      {/* Payoff Ratio */}
      <StatCard
        label="Payoff Ratio"
        value={formatRatio(stats.payoffRatio)}
        subtext={
          stats.payoffRatio !== null
            ? "gain moyen / perte moyenne"
            : "Données insuffisantes"
        }
        variant={payoffVariant(stats.payoffRatio)}
      />

      {/* Total Gains */}
      <StatCard
        label="Total Gains"
        value={formatMoney(stats.totalGains, currency)}
        subtext={`${stats.winningTrades} trade${stats.winningTrades !== 1 ? "s" : ""} gagnant${stats.winningTrades !== 1 ? "s" : ""}`}
        variant={stats.totalGains > 0 ? "positive" : "neutral"}
      />

      {/* Total Pertes */}
      <StatCard
        label="Total Pertes"
        value={formatMoney(stats.totalLosses, currency)}
        subtext={`${stats.losingTrades} trade${stats.losingTrades !== 1 ? "s" : ""} perdant${stats.losingTrades !== 1 ? "s" : ""}`}
        variant={stats.totalLosses > 0 ? "negative" : "neutral"}
      />

      {/* Gain Moyen */}
      <StatCard
        label="Gain Moyen"
        value={formatMoney(stats.avgGain, currency)}
        subtext="par trade gagnant"
        variant={stats.avgGain > 0 ? "positive" : "neutral"}
      />

      {/* Perte Moyenne */}
      <StatCard
        label="Perte Moyenne"
        value={formatMoney(stats.avgLoss, currency)}
        subtext="par trade perdant (valeur abs.)"
        variant={stats.avgLoss > 0 ? "negative" : "neutral"}
      />
    </div>
  );
}
