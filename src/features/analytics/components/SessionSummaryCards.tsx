// ============================================================
// Composant — SessionSummaryCards
// ============================================================
// 4 cartes de résumé tirées de SessionOverviewStats :
//
//   1. Meilleure Session   — PnL net total le plus élevé
//   2. Session la plus active — nombre de trades le plus élevé
//   3. Pire Session        — PnL net total le plus bas
//   4. Meilleur Win Rate   — % gagnant le plus élevé (≥ 5 trades)
//
// Note : le groupe "Hors session" est exclu des classements.
// Règle : aucune logique métier ici — formatage uniquement.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { SessionOverviewStats } from "../../../types";

// ── Helpers de formatage ────────────────────────────────────

function formatMoney(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

function pnlVariant(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

// ── Composant principal ─────────────────────────────────────

interface SessionSummaryCardsProps {
  currency: string;
  overview: SessionOverviewStats;
}

export default function SessionSummaryCards({
  currency,
  overview,
}: SessionSummaryCardsProps) {
  const {
    totalTrades,
    outOfSessionTrades,
    bestSession,
    bestSessionPnl,
    worstSession,
    worstSessionPnl,
    mostActiveSession,
    mostActiveCount,
    bestWinRateSession,
    bestWinRate,
  } = overview;

  const outSubtext =
    outOfSessionTrades > 0 ? ` · ${outOfSessionTrades} hors session` : "";

  const totalSubtext = `${totalTrades} trade${totalTrades > 1 ? "s" : ""} analysé${totalTrades > 1 ? "s" : ""}${outSubtext}`;

  return (
    <div className="session-summary-cards">
      {/* ── Carte 1 : Meilleure session ── */}
      <StatCard
        label="Meilleure Session"
        value={bestSession ?? "—"}
        subtext={
          bestSession !== null
            ? formatMoney(bestSessionPnl, currency)
            : totalSubtext
        }
        variant={bestSession !== null ? pnlVariant(bestSessionPnl) : "neutral"}
      />

      {/* ── Carte 2 : Session la plus active ── */}
      <StatCard
        label="Plus Active"
        value={mostActiveSession ?? "—"}
        subtext={
          mostActiveSession !== null
            ? `${mostActiveCount} trade${mostActiveCount > 1 ? "s" : ""} fermé${mostActiveCount > 1 ? "s" : ""}`
            : "Aucune session active"
        }
        variant="neutral"
      />

      {/* ── Carte 3 : Pire session ── */}
      <StatCard
        label="Pire Session"
        value={worstSession ?? "—"}
        subtext={
          worstSession !== null
            ? formatMoney(worstSessionPnl, currency)
            : "Données insuffisantes"
        }
        variant={
          worstSession !== null ? pnlVariant(worstSessionPnl) : "neutral"
        }
      />

      {/* ── Carte 4 : Meilleur win rate ── */}
      <StatCard
        label="Meilleur Win Rate"
        value={bestWinRateSession ?? "—"}
        subtext={
          bestWinRateSession !== null
            ? `${bestWinRate.toFixed(1)}%`
            : "≥ 5 trades requis"
        }
        variant={bestWinRateSession !== null ? "positive" : "neutral"}
      />
    </div>
  );
}
