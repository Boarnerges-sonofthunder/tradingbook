// ============================================================
// Composant — EmotionSummaryCards
// ============================================================
// 4 cartes de résumé tirées de EmotionOverviewStats :
//
//   1. Meilleure Émotion   — PnL net total le plus élevé
//   2. Pire Émotion        — PnL net total le plus bas
//   3. Plus Fréquente      — nombre de trades le plus élevé
//   4. Meilleur Win Rate   — % gagnant le plus élevé (≥ 5 trades)
//
// Note : le groupe "Sans émotion" est exclu des classements.
// Règle : aucune logique métier ici, seulement du formatage.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { EmotionOverviewStats } from "../../../types";

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

interface EmotionSummaryCardsProps {
  currency: string;
  overview: EmotionOverviewStats;
}

export default function EmotionSummaryCards({
  currency,
  overview,
}: EmotionSummaryCardsProps) {
  const {
    totalEmotions,
    unassignedTrades,
    bestEmotion,
    bestEmotionPnl,
    worstEmotion,
    worstEmotionPnl,
    mostUsedEmotion,
    mostUsedCount,
    bestWinRateEmotion,
    bestWinRate,
  } = overview;

  const emotionsSubtext =
    totalEmotions > 0
      ? `${totalEmotions} émotion${totalEmotions > 1 ? "s" : ""} analysée${totalEmotions > 1 ? "s" : ""}`
      : "Aucune émotion affectée";

  const unassignedSubtext =
    unassignedTrades > 0 ? ` · ${unassignedTrades} sans émotion` : "";

  return (
    <div className="strategy-summary-cards">
      {/* ── Carte 1 : Meilleure émotion ── */}
      <StatCard
        label="Meilleure Émotion"
        value={bestEmotion ?? "—"}
        subtext={
          bestEmotion !== null
            ? formatMoney(bestEmotionPnl, currency)
            : emotionsSubtext + unassignedSubtext
        }
        variant={bestEmotion !== null ? pnlVariant(bestEmotionPnl) : "neutral"}
      />

      {/* ── Carte 2 : Pire émotion ── */}
      <StatCard
        label="Pire Émotion"
        value={worstEmotion ?? "—"}
        subtext={
          worstEmotion !== null
            ? formatMoney(worstEmotionPnl, currency)
            : "Données insuffisantes"
        }
        variant={
          worstEmotion !== null ? pnlVariant(worstEmotionPnl) : "neutral"
        }
      />

      {/* ── Carte 3 : Émotion la plus fréquente ── */}
      <StatCard
        label="Plus Fréquente"
        value={mostUsedEmotion ?? "—"}
        subtext={
          mostUsedEmotion !== null
            ? `${mostUsedCount} trade${mostUsedCount > 1 ? "s" : ""} fermé${mostUsedCount > 1 ? "s" : ""}`
            : "Aucune émotion affectée"
        }
        variant="neutral"
      />

      {/* ── Carte 4 : Meilleur win rate ── */}
      <StatCard
        label="Meilleur Win Rate"
        value={bestWinRateEmotion ?? "—"}
        subtext={
          bestWinRateEmotion !== null
            ? formatWinRate(bestWinRate)
            : "≥ 5 trades requis"
        }
        variant={bestWinRateEmotion !== null ? "positive" : "neutral"}
      />
    </div>
  );
}
