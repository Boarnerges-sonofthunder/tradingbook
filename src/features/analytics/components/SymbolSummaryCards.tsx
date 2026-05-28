// ============================================================
// Composant — SymbolSummaryCards
// ============================================================
// Affiche les méta-statistiques de performance par symbole :
//   4 cartes de résumé tirées de SymbolOverviewStats.
//
//   1. Meilleur Symbole    — symbole avec le PnL net total le plus élevé
//   2. Pire Symbole        — symbole avec le PnL net total le plus bas
//   3. Plus Tradé          — symbole avec le plus de trades fermés
//   4. Meilleur Win Rate   — symbole avec le % gagnant le plus élevé
//                            (seuil minimum : 5 trades)
//
// Règle : aucune logique métier ici, seulement du formatage.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { SymbolOverviewStats } from "../../../types";

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

interface SymbolSummaryCardsProps {
  currency: string;
  overview: SymbolOverviewStats;
}

export default function SymbolSummaryCards({
  currency,
  overview,
}: SymbolSummaryCardsProps) {
  const {
    totalSymbols,
    bestSymbol,
    bestSymbolPnl,
    worstSymbol,
    worstSymbolPnl,
    mostTradedSymbol,
    mostTradedCount,
    bestWinRateSymbol,
    bestWinRate,
  } = overview;

  return (
    <div className="symbol-summary-cards">
      {/* ── Carte 1 : Meilleur symbole ── */}
      <StatCard
        label="Meilleur Symbole"
        value={bestSymbol ?? "—"}
        subtext={
          bestSymbol !== null
            ? formatMoney(bestSymbolPnl, currency)
            : `${totalSymbols} symbole${totalSymbols > 1 ? "s" : ""} analysé${totalSymbols > 1 ? "s" : ""}`
        }
        variant={bestSymbol !== null ? pnlVariant(bestSymbolPnl) : "neutral"}
      />

      {/* ── Carte 2 : Pire symbole ── */}
      <StatCard
        label="Pire Symbole"
        value={worstSymbol ?? "—"}
        subtext={
          worstSymbol !== null
            ? formatMoney(worstSymbolPnl, currency)
            : "Données insuffisantes"
        }
        variant={worstSymbol !== null ? pnlVariant(worstSymbolPnl) : "neutral"}
      />

      {/* ── Carte 3 : Symbole le plus tradé ── */}
      <StatCard
        label="Plus Tradé"
        value={mostTradedSymbol ?? "—"}
        subtext={
          mostTradedSymbol !== null
            ? `${mostTradedCount} trade${mostTradedCount > 1 ? "s" : ""} fermé${mostTradedCount > 1 ? "s" : ""}`
            : "Aucun trade"
        }
        variant="neutral"
      />

      {/* ── Carte 4 : Meilleur win rate ── */}
      <StatCard
        label="Meilleur Win Rate"
        value={bestWinRateSymbol ?? "—"}
        subtext={
          bestWinRateSymbol !== null
            ? formatWinRate(bestWinRate)
            : "≥ 5 trades requis"
        }
        variant={bestWinRateSymbol !== null ? "positive" : "neutral"}
      />
    </div>
  );
}
