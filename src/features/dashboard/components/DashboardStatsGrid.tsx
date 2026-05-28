// ============================================================
// Composant — DashboardStatsGrid
// ============================================================
// Grille de 12 cartes statistiques pour le dashboard principal.
// Reçoit un DashboardStatsResult du service analytics.
//
// Gestion des états :
//   isEmpty  → affiche un message d'état vide (aucun trade fermé)
//   stats    → affiche les 12 cartes formatées
// ============================================================

import { memo } from "react";
import { BarChart2 } from "lucide-react";
import StatCard from "./StatCard";
import type { DashboardStats, DashboardStatsResult } from "../../../types";

// ============================================================
// Helpers de formatage (aucune logique métier ici)
// ============================================================

/**
 * Formate un montant P&L avec signe et devise.
 * Ex : +1 234.56 USD | −456.78 USD
 */
function formatPnl(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/**
 * Formate un pourcentage arrondi à une décimale.
 * Ex : "65.4%"
 */
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Formate un ratio (profit factor) à deux décimales.
 * Gère les cas Infinity (aucune perte) et 0 (aucun gain).
 */
function formatRatio(value: number): string {
  if (!isFinite(value)) return "∞";
  return value.toFixed(2);
}

/**
 * Détermine la variante de couleur en fonction du signe d'une valeur P&L.
 */
function pnlVariant(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

/**
 * Détermine la variante de couleur du win rate.
 * ≥ 50% → positive, < 50% → warning, 0% → negative
 */
function winRateVariant(winRate: number): "positive" | "warning" | "negative" {
  if (winRate >= 50) return "positive";
  if (winRate > 0) return "warning";
  return "negative";
}

/**
 * Détermine la variante de couleur du profit factor.
 * > 1 → positive, entre 0 et 1 → warning, 0 → negative
 */
function pfVariant(pf: number): "positive" | "warning" | "negative" {
  if (!isFinite(pf) || pf > 1) return "positive";
  if (pf > 0) return "warning";
  return "negative";
}

// ============================================================
// Sous-composant — État vide
// ============================================================

const EmptyState = memo(function EmptyState() {
  return (
    <div className="dashboard-empty">
      <div className="dashboard-empty__icon">
        <BarChart2 size={48} strokeWidth={1.25} />
      </div>
      <h2 className="dashboard-empty__title">Aucun trade clôturé</h2>
      <p className="dashboard-empty__text">
        Ajoutez ou importez des trades pour voir vos statistiques de performance
        apparaître ici.
      </p>
    </div>
  );
});

// ============================================================
// Composant principal
// ============================================================

interface DashboardStatsGridProps {
  currency: string;
  result: DashboardStatsResult;
}

const DashboardStatsGrid = memo(function DashboardStatsGrid({
  currency,
  result,
}: DashboardStatsGridProps) {
  if (result.isEmpty || result.stats === null) {
    return <EmptyState />;
  }

  const s: DashboardStats = result.stats;
  const cur = currency;

  return (
    <div className="dashboard-stats-grid">
      {/* ── Ligne 1 : Vue globale ─────────────────────────── */}
      <StatCard
        label="P&L Net Total"
        value={formatPnl(s.totalNetPnl, cur)}
        subtext={`${s.totalTrades} trade${s.totalTrades > 1 ? "s" : ""} fermé${s.totalTrades > 1 ? "s" : ""}`}
        variant={pnlVariant(s.totalNetPnl)}
      />
      <StatCard
        label="Win Rate"
        value={formatPercent(s.winRate)}
        subtext={`${s.winningTrades}W · ${s.losingTrades}L · ${s.breakevenTrades}BE`}
        variant={winRateVariant(s.winRate)}
      />
      <StatCard
        label="Profit Factor"
        value={formatRatio(s.profitFactor)}
        subtext={
          s.profitFactor >= 1 ? "Stratégie rentable" : "Stratégie déficitaire"
        }
        variant={pfVariant(s.profitFactor)}
      />
      <StatCard
        label="Drawdown Maximum"
        value={formatPnl(-s.maxDrawdown, cur)}
        subtext="Pic → creux cumulé"
        variant={s.maxDrawdown > 0 ? "negative" : "neutral"}
      />

      {/* ── Ligne 2 : Compteurs ───────────────────────────── */}
      <StatCard
        label="Trades Gagnants"
        value={String(s.winningTrades)}
        subtext={
          s.totalTrades > 0
            ? `${formatPercent((s.winningTrades / s.totalTrades) * 100)} du total`
            : undefined
        }
        variant="positive"
      />
      <StatCard
        label="Trades Perdants"
        value={String(s.losingTrades)}
        subtext={
          s.totalTrades > 0
            ? `${formatPercent((s.losingTrades / s.totalTrades) * 100)} du total`
            : undefined
        }
        variant={s.losingTrades > 0 ? "negative" : "neutral"}
      />
      <StatCard
        label="Gain Moyen"
        value={s.winningTrades > 0 ? formatPnl(s.averageWin, cur) : "—"}
        subtext={
          s.winningTrades > 0 ? `par trade gagnant` : "aucun trade gagnant"
        }
        variant={s.winningTrades > 0 ? "positive" : "neutral"}
      />
      <StatCard
        label="Perte Moyenne"
        value={s.losingTrades > 0 ? formatPnl(s.averageLoss, cur) : "—"}
        subtext={
          s.losingTrades > 0 ? `par trade perdant` : "aucun trade perdant"
        }
        variant={s.losingTrades > 0 ? "negative" : "neutral"}
      />

      {/* ── Ligne 3 : Extrêmes ───────────────────────────── */}
      <StatCard
        label="Meilleur Trade"
        value={formatPnl(s.bestTrade, cur)}
        subtext="Trade le plus profitable"
        variant={pnlVariant(s.bestTrade)}
      />
      <StatCard
        label="Pire Trade"
        value={formatPnl(s.worstTrade, cur)}
        subtext="Trade le plus coûteux"
        variant={pnlVariant(s.worstTrade)}
      />
      <StatCard
        label="Total Trades"
        value={String(s.totalTrades)}
        subtext={`${s.breakevenTrades} à l'équilibre`}
        variant="default"
      />
      <StatCard
        label="Devise d'affichage"
        value={cur}
        subtext="Format global sans conversion FX automatique"
        variant="neutral"
      />
    </div>
  );
});

export default DashboardStatsGrid;
