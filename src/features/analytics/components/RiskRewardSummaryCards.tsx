// ============================================================
// Composant — RiskRewardSummaryCards
// ============================================================
// Affiche les statistiques Risk/Reward sous forme de 6 cartes :
//   1. R/R Moyen      — ratio moyen des trades exploitables
//   2. Meilleur R/R   — ratio le plus élevé observé
//   3. Pire R/R       — ratio le plus faible observé
//   4. Stop-Loss défini  — % de trades avec SL
//   5. Take-Profit défini — % de trades avec TP
//   6. Trades analysés  — exploitables / total
//
// Règle : aucune logique métier ici, seulement du formatage.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { RiskRewardStats } from "../../../types";

// ── Helpers de formatage ───────────────────────────────────

/**
 * Formate un ratio R/R avec 2 décimales.
 * Ex : 1.75 → "1.75" | null → "N/A"
 */
function formatRR(value: number | null): string {
  return value !== null ? value.toFixed(2) : "N/A";
}

/**
 * Formate un pourcentage avec une décimale.
 * Ex : 65.4 → "65.4%"
 */
function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Variante de couleur pour un ratio R/R.
 *   ≥ 1.5 → positive | ≥ 1.0 → warning | < 1.0 → negative | null → neutral
 */
function rrVariant(
  rr: number | null,
): "positive" | "warning" | "negative" | "neutral" {
  if (rr === null) return "neutral";
  if (rr >= 1.5) return "positive";
  if (rr >= 1) return "warning";
  return "negative";
}

/**
 * Variante de couleur pour un pourcentage de couverture SL/TP.
 *   ≥ 70% → positive | ≥ 40% → warning | < 40% → negative
 */
function coverageVariant(pct: number): "positive" | "warning" | "negative" {
  if (pct >= 70) return "positive";
  if (pct >= 40) return "warning";
  return "negative";
}

// ── Composant principal ────────────────────────────────────

interface RiskRewardSummaryCardsProps {
  stats: RiskRewardStats;
}

export default function RiskRewardSummaryCards({
  stats,
}: RiskRewardSummaryCardsProps) {
  return (
    <div className="rr-cards">
      {/* ── Colonne 1 : ratios R/R ──────────────────────── */}

      {/* R/R Moyen */}
      <StatCard
        label="R/R Moyen"
        value={formatRR(stats.avgRR)}
        subtext={
          stats.avgRR !== null
            ? `sur ${stats.exploitableTrades} trade${stats.exploitableTrades !== 1 ? "s" : ""} analysé${stats.exploitableTrades !== 1 ? "s" : ""}`
            : "Aucune donnée R/R disponible"
        }
        variant={rrVariant(stats.avgRR)}
      />

      {/* Meilleur R/R */}
      <StatCard
        label="Meilleur R/R"
        value={formatRR(stats.bestRR)}
        subtext="ratio le plus élevé observé"
        variant={stats.bestRR !== null ? "positive" : "neutral"}
      />

      {/* Pire R/R */}
      <StatCard
        label="Pire R/R"
        value={formatRR(stats.worstRR)}
        subtext="ratio le plus faible observé"
        variant={
          stats.worstRR !== null
            ? stats.worstRR < 1
              ? "negative"
              : "warning"
            : "neutral"
        }
      />

      {/* ── Colonne 2 : couverture SL / TP ─────────────── */}

      {/* Stop-Loss défini */}
      <StatCard
        label="Stop-Loss défini"
        value={formatPct(stats.pctWithSL)}
        subtext={`${stats.tradesWithSL} / ${stats.totalTrades} trade${stats.totalTrades !== 1 ? "s" : ""}`}
        variant={coverageVariant(stats.pctWithSL)}
      />

      {/* Take-Profit défini */}
      <StatCard
        label="Take-Profit défini"
        value={formatPct(stats.pctWithTP)}
        subtext={`${stats.tradesWithTP} / ${stats.totalTrades} trade${stats.totalTrades !== 1 ? "s" : ""}`}
        variant={coverageVariant(stats.pctWithTP)}
      />

      {/* Trades analysés */}
      <StatCard
        label="Trades analysés"
        value={`${stats.exploitableTrades} / ${stats.totalTrades}`}
        subtext={
          stats.exploitableTrades === 0
            ? "Ajoutez SL et TP pour activer l'analyse"
            : "avec R/R calculable"
        }
        variant={
          stats.exploitableTrades === 0
            ? "neutral"
            : stats.exploitableTrades === stats.totalTrades
              ? "positive"
              : "warning"
        }
      />
    </div>
  );
}
