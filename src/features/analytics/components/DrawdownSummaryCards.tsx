// ============================================================
// Composant — DrawdownSummaryCards
// ============================================================
// Affiche les statistiques de drawdown sous forme de 6 cartes :
//   1. Drawdown Maximum   — profondeur de la pire perte depuis un sommet
//   2. Drawdown Actuel    — écart equity courante / dernier sommet
//   3. Drawdown Moyen     — moyenne des points en drawdown
//   4. Début Max DD       — date du pic précédant le drawdown max
//   5. Fin Max DD         — date du point le plus bas
//   6. Récupération       — trades nécessaires pour repasser le pic
//
// Règle : aucune logique métier ici, seulement du formatage.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { DrawdownStats } from "../../../types";

// ── Helpers de formatage ───────────────────────────────────

/**
 * Formate une valeur monétaire avec 2 décimales.
 * Ex : -1250.5 → "-1250.50 USD" | 0 → "0.00 USD"
 */
function formatMoney(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

/**
 * Formate un pourcentage avec 2 décimales.
 * Ex : -15.3 → "-15.30%"
 */
function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Formate une date ISO "YYYY-MM-DD" en format court français.
 * Ex : "2024-01-15" → "15 janv. 2024"
 */
function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Composant principal ────────────────────────────────────

interface DrawdownSummaryCardsProps {
  currency: string;
  stats: DrawdownStats;
}

export default function DrawdownSummaryCards({
  currency,
  stats,
}: DrawdownSummaryCardsProps) {
  const hasDrawdown = stats.maxDrawdown < 0;

  // Texte et variante de la carte Récupération
  const recoveryValue = !hasDrawdown
    ? "Aucun drawdown"
    : stats.recoveryTrades !== null
      ? `${stats.recoveryTrades} trade${stats.recoveryTrades > 1 ? "s" : ""}`
      : "Non récupéré";

  const recoveryVariant: "positive" | "negative" | "neutral" = !hasDrawdown
    ? "neutral"
    : stats.recoveryTrades !== null
      ? "positive"
      : "negative";

  return (
    <div className="dd-cards">
      {/* Drawdown Maximum */}
      <StatCard
        label="Drawdown Maximum"
        value={formatMoney(stats.maxDrawdown, currency)}
        subtext={
          hasDrawdown
            ? `${formatPct(stats.maxDrawdownPct)} du pic`
            : "Aucune perte consécutive"
        }
        variant={hasDrawdown ? "negative" : "positive"}
      />

      {/* Drawdown Actuel */}
      <StatCard
        label="Drawdown Actuel"
        value={formatMoney(stats.currentDrawdown, currency)}
        subtext={
          stats.currentDrawdown < 0
            ? `${formatPct(stats.currentDrawdownPct)} du pic`
            : "Equity au sommet"
        }
        variant={stats.currentDrawdown < 0 ? "negative" : "positive"}
      />

      {/* Drawdown Moyen */}
      <StatCard
        label="Drawdown Moyen"
        value={formatMoney(stats.avgDrawdown, currency)}
        subtext={
          stats.avgDrawdown < 0
            ? "moyenne des points en drawdown"
            : "Aucun point en drawdown"
        }
        variant={stats.avgDrawdown < 0 ? "negative" : "neutral"}
      />

      {/* Début Max DD */}
      <StatCard
        label="Début Max DD"
        value={formatDateShort(stats.maxDrawdownStartDate)}
        subtext="pic avant la chute maximale"
        variant="neutral"
      />

      {/* Fin Max DD */}
      <StatCard
        label="Fin Max DD"
        value={formatDateShort(stats.maxDrawdownEndDate)}
        subtext="point le plus bas observé"
        variant="neutral"
      />

      {/* Récupération */}
      <StatCard
        label="Récupération"
        value={recoveryValue}
        subtext="trades pour repasser le pic"
        variant={recoveryVariant}
      />
    </div>
  );
}
