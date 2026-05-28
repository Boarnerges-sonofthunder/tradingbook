// ============================================================
// Composant — WinRateBreakdownTable
// ============================================================
// Tableau de win rate avec 3 onglets :
//   - Par symbole   : win rate par instrument tradé
//   - Par stratégie : win rate par stratégie utilisée
//   - Par mois      : win rate mensuel chronologique
//
// Les données sont pré-calculées par winRateAnalyticsService.
// Règle : aucune logique métier ici, seulement du formatage et état UI.
// ============================================================

import { useState } from "react";
import type {
  WinRateBySymbol,
  WinRateByStrategy,
  WinRatePeriodEntry,
} from "../../../types";

// ============================================================
// Types
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

/**
 * Formate un taux en pourcentage avec une décimale.
 */
function formatRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Formate un mois ISO "2024-01" → "janvier 2024".
 */
function formatMonthLabel(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/**
 * Classe CSS de couleur selon le win rate.
 */
function winRateClass(winRate: number): string {
  if (winRate >= 50) return "pnl-table__td--positive";
  if (winRate > 0) return "winrate-table__td--warning";
  return "pnl-table__td--negative";
}

// ============================================================
// Sous-composant : ligne commune du tableau
// ============================================================

interface TableRowData {
  label: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
}

function WinRateTable({ rows }: { rows: TableRowData[] }) {
  if (rows.length === 0) {
    return (
      <p className="pnl-breakdown__empty">
        Aucune donnée pour cette catégorie.
      </p>
    );
  }

  return (
    <div className="pnl-table-wrapper">
      <table className="pnl-table">
        <thead>
          <tr>
            <th className="pnl-table__th">Libellé</th>
            <th className="pnl-table__th pnl-table__th--right">Total</th>
            <th className="pnl-table__th pnl-table__th--right">Gagnants</th>
            <th className="pnl-table__th pnl-table__th--right">Perdants</th>
            <th className="pnl-table__th pnl-table__th--right">BE</th>
            <th className="pnl-table__th pnl-table__th--right">Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="pnl-table__row">
              <td className="pnl-table__td pnl-table__td--period">
                {row.label}
              </td>
              <td className="pnl-table__td pnl-table__td--right">
                {row.totalTrades}
              </td>
              <td className="pnl-table__td pnl-table__td--right pnl-table__td--positive">
                {row.winningTrades}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${
                  row.losingTrades > 0
                    ? "pnl-table__td--negative"
                    : "pnl-table__td--neutral"
                }`}
              >
                {row.losingTrades}
              </td>
              <td className="pnl-table__td pnl-table__td--right pnl-table__td--neutral">
                {row.breakevenTrades}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${winRateClass(row.winRate)}`}
              >
                {formatRate(row.winRate)}
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

interface WinRateBreakdownTableProps {
  bySymbol: WinRateBySymbol[];
  byStrategy: WinRateByStrategy[];
  byMonth: WinRatePeriodEntry[];
}

export default function WinRateBreakdownTable({
  bySymbol,
  byStrategy,
  byMonth,
}: WinRateBreakdownTableProps) {
  // Onglet actif — "symbol" par défaut
  const [tab, setTab] = useState<TabType>("symbol");

  // Normalisation des données selon l'onglet actif
  const rows: TableRowData[] =
    tab === "symbol"
      ? bySymbol.map((s) => ({ label: s.symbol, ...s }))
      : tab === "strategy"
        ? byStrategy.map((s) => ({ label: s.strategyName, ...s }))
        : [...byMonth]
            .reverse() // Antéchronologique : mois le plus récent en premier
            .map((m) => ({ label: formatMonthLabel(m.period), ...m }));

  return (
    <div className="pnl-breakdown">
      {/* ── Onglets ─────────────────────────────────────── */}
      <div
        className="period-tabs"
        role="tablist"
        aria-label="Catégorie d'analyse"
      >
        {(["symbol", "strategy", "month"] as TabType[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`period-tab${tab === t ? " period-tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── Tableau ──────────────────────────────────────── */}
      <WinRateTable rows={rows} />
    </div>
  );
}
