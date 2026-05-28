// ============================================================
// Composant — PnLSummaryCards
// ============================================================
// Grille de 10 cartes résumant les statistiques PnL principales.
// Reçoit un PnLStats calculé par le service analytics.
//
// Mise en page : 5 colonnes × 2 lignes (responsive via CSS grid).
//
// Règle : aucune logique métier ici, seulement du formatage.
// ============================================================

import StatCard from "../../dashboard/components/StatCard";
import type { PnLStats } from "../../../types";

// ============================================================
// Helpers de formatage
// ============================================================

/**
 * Formate un montant avec signe et devise.
 * Ex : +1 234.56 USD | −456.78 USD | 0.00 USD
 */
function formatAmount(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/**
 * Formate un montant en valeur absolue avec devise (sans signe).
 * Utilisé pour les frais qui sont toujours un coût.
 */
function formatAmountAbs(value: number, currency: string): string {
  return `${Math.abs(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/**
 * Retourne la variante de couleur selon le signe d'une valeur P&L.
 */
function pnlVariant(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

// ============================================================
// Composant principal
// ============================================================

interface PnLSummaryCardsProps {
  currency: string;
  stats: PnLStats;
}

export default function PnLSummaryCards({
  stats,
  currency,
}: PnLSummaryCardsProps) {
  const cur = currency;

  return (
    <div className="pnl-summary-cards">
      {/* ── Ligne 1 : Totaux PnL ─────────────────────────── */}

      {/* PnL Net Total — résultat final après tous les frais */}
      <StatCard
        label="PnL Net Total"
        value={formatAmount(stats.totalNetPnl, cur)}
        subtext={`${stats.totalTrades} trade${stats.totalTrades > 1 ? "s" : ""} fermé${stats.totalTrades > 1 ? "s" : ""}`}
        variant={pnlVariant(stats.totalNetPnl)}
      />

      {/* PnL Brut Total — avant déduction des frais de courtage */}
      <StatCard
        label="PnL Brut Total"
        value={formatAmount(stats.totalGrossPnl, cur)}
        subtext="Avant déduction des frais"
        variant={pnlVariant(stats.totalGrossPnl)}
      />

      {/* PnL Positif Total — gains cumulés sur les trades gagnants */}
      <StatCard
        label="PnL Positif Total"
        value={
          stats.totalPositivePnl > 0
            ? formatAmount(stats.totalPositivePnl, cur)
            : "—"
        }
        subtext="Somme des trades gagnants"
        variant={stats.totalPositivePnl > 0 ? "positive" : "neutral"}
      />

      {/* PnL Négatif Total — pertes cumulées sur les trades perdants */}
      <StatCard
        label="PnL Négatif Total"
        value={
          stats.totalNegativePnl < 0
            ? formatAmount(stats.totalNegativePnl, cur)
            : "—"
        }
        subtext="Somme des trades perdants"
        variant={stats.totalNegativePnl < 0 ? "negative" : "neutral"}
      />

      {/* PnL Moyen par Trade */}
      <StatCard
        label="PnL Moyen / Trade"
        value={formatAmount(stats.averagePnl, cur)}
        subtext="Net par trade fermé"
        variant={pnlVariant(stats.averagePnl)}
      />

      {/* ── Ligne 2 : Extrêmes et frais ──────────────────── */}

      {/* Meilleur Trade */}
      <StatCard
        label="Meilleur Trade"
        value={formatAmount(stats.bestTrade, cur)}
        subtext="Trade le plus profitable"
        variant={pnlVariant(stats.bestTrade)}
      />

      {/* Pire Trade */}
      <StatCard
        label="Pire Trade"
        value={formatAmount(stats.worstTrade, cur)}
        subtext="Trade le plus coûteux"
        variant={pnlVariant(stats.worstTrade)}
      />

      {/* Commissions totales — frais de courtage */}
      <StatCard
        label="Commissions"
        value={
          stats.totalCommissions !== 0
            ? `−${formatAmountAbs(stats.totalCommissions, cur)}`
            : "—"
        }
        subtext="Frais de courtage cumulés"
        variant={stats.totalCommissions > 0 ? "warning" : "neutral"}
      />

      {/* Swap total — peut être positif (reçu) ou négatif (payé) */}
      <StatCard
        label="Swap Total"
        value={stats.totalSwap !== 0 ? formatAmount(stats.totalSwap, cur) : "—"}
        subtext="Frais de financement nocturne"
        variant={
          stats.totalSwap < 0
            ? "warning"
            : stats.totalSwap > 0
              ? "positive"
              : "neutral"
        }
      />

      {/* Autres frais */}
      <StatCard
        label="Autres Frais"
        value={
          stats.totalFees !== 0
            ? `−${formatAmountAbs(stats.totalFees, cur)}`
            : "—"
        }
        subtext="Frais divers cumulés"
        variant={stats.totalFees > 0 ? "warning" : "neutral"}
      />
    </div>
  );
}
