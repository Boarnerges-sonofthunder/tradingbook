// ============================================================
// Composant — ProfitFactorBreakdownTable
// ============================================================
// Tableau Profit Factor avec 3 onglets :
//   - Par symbole   : PF et gains/pertes par instrument
//   - Par stratégie : PF et gains/pertes par stratégie
//   - Par mois      : PF mensuel (du plus récent au plus ancien)
//
// Colonnes : Libellé | Trades (W/L) | Gains | Pertes | PF
//
// Seuils de couleur du PF :
//   null (∞) → vert  |  ≥ 1.5 → vert  |  ≥ 1.0 → orange
//   < 1.0    → rouge |  = 0   → rouge
//
// Les données sont pré-calculées par profitFactorAnalyticsService.
// Règle : aucune logique métier ici, seulement du formatage et état UI.
// ============================================================

import { useState } from "react";
import type {
  ProfitFactorBySymbol,
  ProfitFactorByStrategy,
  ProfitFactorByMonth,
} from "../../../types";

// ============================================================
// Configuration
// ============================================================

type TabType = "symbol" | "strategy" | "month";

const TAB_LABELS: Record<TabType, string> = {
  symbol: "Par symbole",
  strategy: "Par stratégie",
  month: "Par mois",
};

// ============================================================
// Helpers de formatage
// ============================================================

function formatMoney(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

/**
 * Formate un Profit Factor avec 2 décimales.
 * null → "∞" (aucune perte).
 */
function formatPF(value: number | null): string {
  if (value === null) return "∞";
  return value.toFixed(2);
}

/**
 * Classe CSS pour la cellule Profit Factor.
 *   null (∞) → positive  |  ≥ 1.5 → positive  |  ≥ 1.0 → warning
 *   < 1.0   → negative   |  = 0   → negative
 */
function pfClass(pf: number | null): string {
  if (pf === null) return "pnl-table__td--positive";
  if (pf >= 1.5) return "pnl-table__td--positive";
  if (pf >= 1.0) return "rr-table__td--warning";
  return "pnl-table__td--negative";
}

/**
 * Formate un mois "YYYY-MM" en libellé lisible.
 * Ex : "2024-03" → "mars 2024"
 */
function formatMonth(month: string): string {
  if (!month || month === "0000-00") return "—";
  const [year, m] = month.split("-");
  const d = new Date(Number(year), Number(m) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ============================================================
// Ligne générique (type interne)
// ============================================================

interface PFRow {
  label: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalGains: number;
  totalLosses: number;
  profitFactor: number | null;
}

// ============================================================
// Sous-composant tableau générique
// ============================================================

interface PFTableProps {
  rows: PFRow[];
  currency: string;
  emptyMessage?: string;
}

function PFTable({
  rows,
  currency,
  emptyMessage = "Aucune donnée disponible.",
}: PFTableProps) {
  if (rows.length === 0) {
    return <p className="pnl-breakdown__empty">{emptyMessage}</p>;
  }

  return (
    <div className="pnl-table-wrapper">
      <table className="pnl-table">
        <thead>
          <tr>
            <th className="pnl-table__th">Libellé</th>
            <th className="pnl-table__th pnl-table__th--right">Trades (W/L)</th>
            <th className="pnl-table__th pnl-table__th--right">Gains</th>
            <th className="pnl-table__th pnl-table__th--right">Pertes</th>
            <th className="pnl-table__th pnl-table__th--right">PF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="pnl-table__row">
              <td className="pnl-table__td pnl-table__td--period">
                {row.label}
              </td>
              <td className="pnl-table__td pnl-table__td--right pnl-table__td--neutral">
                {row.totalTrades}&nbsp;
                <span className="pf-table__wl">
                  ({row.winningTrades}W / {row.losingTrades}L)
                </span>
              </td>
              <td className="pnl-table__td pnl-table__td--right pnl-table__td--positive">
                {formatMoney(row.totalGains, currency)}
              </td>
              <td className="pnl-table__td pnl-table__td--right pnl-table__td--negative">
                {formatMoney(row.totalLosses, currency)}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${pfClass(row.profitFactor)}`}
              >
                {formatPF(row.profitFactor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Composant principal
// ============================================================

interface ProfitFactorBreakdownTableProps {
  bySymbol: ProfitFactorBySymbol[];
  byStrategy: ProfitFactorByStrategy[];
  byMonth: ProfitFactorByMonth[];
  currency: string;
}

export default function ProfitFactorBreakdownTable({
  bySymbol,
  byStrategy,
  byMonth,
  currency,
}: ProfitFactorBreakdownTableProps) {
  const [activeTab, setActiveTab] = useState<TabType>("symbol");

  // Adapter chaque source en PFRow[]
  const symbolRows: PFRow[] = bySymbol.map((r) => ({
    label: r.symbol,
    totalTrades: r.totalTrades,
    winningTrades: r.winningTrades,
    losingTrades: r.losingTrades,
    totalGains: r.totalGains,
    totalLosses: r.totalLosses,
    profitFactor: r.profitFactor,
  }));

  const strategyRows: PFRow[] = byStrategy.map((r) => ({
    label: r.strategyName,
    totalTrades: r.totalTrades,
    winningTrades: r.winningTrades,
    losingTrades: r.losingTrades,
    totalGains: r.totalGains,
    totalLosses: r.totalLosses,
    profitFactor: r.profitFactor,
  }));

  const monthRows: PFRow[] = byMonth.map((r) => ({
    label: formatMonth(r.month),
    totalTrades: r.totalTrades,
    winningTrades: r.winningTrades,
    losingTrades: r.losingTrades,
    totalGains: r.totalGains,
    totalLosses: r.totalLosses,
    profitFactor: r.profitFactor,
  }));

  const currentRows: Record<TabType, PFRow[]> = {
    symbol: symbolRows,
    strategy: strategyRows,
    month: monthRows,
  };

  const emptyMessages: Record<TabType, string> = {
    symbol: "Aucun symbole disponible.",
    strategy: "Aucune stratégie associée aux trades fermés.",
    month: "Aucune donnée mensuelle disponible.",
  };

  return (
    <div className="pnl-breakdown">
      {/* ── Onglets ──────────────────────────────────────── */}
      <div className="period-tabs" role="tablist">
        {(Object.keys(TAB_LABELS) as TabType[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`period-tab${activeTab === tab ? " period-tab--active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ── Contenu ──────────────────────────────────────── */}
      <PFTable
        rows={currentRows[activeTab]}
        currency={currency}
        emptyMessage={emptyMessages[activeTab]}
      />
    </div>
  );
}
