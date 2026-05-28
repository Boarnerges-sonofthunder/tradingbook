// ============================================================
// Composant — PnLBreakdownTable
// ============================================================
// Tableau de décomposition du PnL par période temporelle.
// Trois onglets permettent de basculer entre : Mois / Semaine / Jour.
//
// Les données affichées sont pré-calculées par le service analytics
// (agrégation en mémoire, pas de requête SQL supplémentaire).
//
// Règle : aucune logique métier ici, seulement du formatage et de l'état UI.
// ============================================================

import { useState } from "react";
import type { PnLBreakdown, PnLPeriodEntry } from "../../../types";

// ============================================================
// Types
// ============================================================

type PeriodType = "month" | "week" | "day";

const PERIOD_LABELS: Record<PeriodType, string> = {
  month: "Par mois",
  week: "Par semaine",
  day: "Par jour",
};

// ============================================================
// Helpers de formatage
// ============================================================

/**
 * Formate un montant P&L avec signe et devise.
 */
function formatAmount(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/**
 * Convertit une clé de période en libellé lisible.
 *
 *   "2024-01-15" → "15 janv. 2024"
 *   "2024-W03"   → "Sem. 03 / 2024"
 *   "2024-01"    → "janvier 2024"
 */
function formatPeriodLabel(period: string): string {
  // Semaine ISO : "2024-W03"
  if (period.includes("W")) {
    const [year, week] = period.split("-W");
    return `Sem. ${week} / ${year}`;
  }

  // Mois : "2024-01"
  if (period.length === 7) {
    const [year, month] = period.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }

  // Jour : "2024-01-15"
  const [year, month, day] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Retourne la classe CSS de couleur selon le signe du PnL.
 */
function pnlClass(value: number): string {
  if (value > 0) return "pnl-table__td--positive";
  if (value < 0) return "pnl-table__td--negative";
  return "pnl-table__td--neutral";
}

// ============================================================
// Composant principal
// ============================================================

interface PnLBreakdownTableProps {
  breakdown: PnLBreakdown;
  currency: string;
}

export default function PnLBreakdownTable({
  breakdown,
  currency,
}: PnLBreakdownTableProps) {
  // État local : onglet actif (mois par défaut — vue la plus utile)
  const [period, setPeriod] = useState<PeriodType>("month");

  // Sélection des données selon l'onglet actif
  const data: PnLPeriodEntry[] =
    period === "day"
      ? breakdown.byDay
      : period === "week"
        ? breakdown.byWeek
        : breakdown.byMonth;

  // Affichage antéchronologique : la période la plus récente en premier
  const rows = [...data].reverse();

  return (
    <div className="pnl-breakdown">
      {/* ── Onglets de période ──────────────────────────── */}
      <div
        className="period-tabs"
        role="tablist"
        aria-label="Granularité de période"
      >
        {(["month", "week", "day"] as PeriodType[]).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={period === p}
            className={`period-tab${period === p ? " period-tab--active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* ── Tableau ou état vide ─────────────────────────── */}
      {rows.length === 0 ? (
        <p className="pnl-breakdown__empty">
          Aucune donnée pour cette granularité.
        </p>
      ) : (
        <div className="pnl-table-wrapper">
          <table className="pnl-table">
            <thead>
              <tr>
                <th className="pnl-table__th">Période</th>
                <th className="pnl-table__th pnl-table__th--right">Trades</th>
                <th className="pnl-table__th pnl-table__th--right">PnL Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.period} className="pnl-table__row">
                  <td className="pnl-table__td pnl-table__td--period">
                    {formatPeriodLabel(entry.period)}
                  </td>
                  <td className="pnl-table__td pnl-table__td--right">
                    {entry.tradeCount}
                  </td>
                  <td
                    className={`pnl-table__td pnl-table__td--right ${pnlClass(entry.netPnl)}`}
                  >
                    {formatAmount(entry.netPnl, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
