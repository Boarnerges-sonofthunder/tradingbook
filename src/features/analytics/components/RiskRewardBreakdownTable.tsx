// ============================================================
// Composant — RiskRewardBreakdownTable
// ============================================================
// Tableau Risk/Reward avec 2 onglets :
//   - Par symbole   : R/R moyen par instrument tradé
//   - Par stratégie : R/R moyen par stratégie utilisée
//
// Les données sont pré-calculées par riskRewardAnalyticsService.
// Règle : aucune logique métier ici, seulement du formatage et état UI.
// ============================================================

import { useState } from "react";
import type { RiskRewardBySymbol, RiskRewardByStrategy } from "../../../types";

// ============================================================
// Types
// ============================================================

type TabType = "symbol" | "strategy";

const TAB_LABELS: Record<TabType, string> = {
  symbol: "Par symbole",
  strategy: "Par stratégie",
};

// ============================================================
// Helpers de formatage
// ============================================================

/**
 * Formate un ratio R/R avec 2 décimales.
 * Retourne "—" si null (trade non exploitable).
 */
function formatRR(value: number | null): string {
  return value !== null ? value.toFixed(2) : "—";
}

/**
 * Classe CSS de couleur selon le ratio R/R.
 *   ≥ 1.5 → positif (vert)
 *   ≥ 1.0 → warning (orange)
 *   < 1.0 → négatif (rouge)
 *   null  → neutre (gris)
 */
function rrClass(rr: number | null): string {
  if (rr === null) return "pnl-table__td--neutral";
  if (rr >= 1.5) return "pnl-table__td--positive";
  if (rr >= 1) return "rr-table__td--warning";
  return "pnl-table__td--negative";
}

// ============================================================
// Sous-composant tableau générique
// ============================================================

interface RRRow {
  label: string;
  totalTrades: number;
  exploitableTrades: number;
  avgRR: number | null;
}

function RRTable({ rows }: { rows: RRRow[] }) {
  if (rows.length === 0) {
    return <p className="pnl-breakdown__empty">Aucune donnée disponible.</p>;
  }

  return (
    <div className="pnl-table-wrapper">
      <table className="pnl-table">
        <thead>
          <tr>
            <th className="pnl-table__th">Libellé</th>
            <th className="pnl-table__th pnl-table__th--right">Total</th>
            <th className="pnl-table__th pnl-table__th--right">Analysés</th>
            <th className="pnl-table__th pnl-table__th--right">R/R Moyen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="pnl-table__row">
              <td className="pnl-table__td pnl-table__td--period">
                {row.label}
              </td>
              <td className="pnl-table__td pnl-table__td--right">
                {row.totalTrades}
              </td>
              <td className="pnl-table__td pnl-table__td--right">
                {row.exploitableTrades}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${rrClass(row.avgRR)}`}
              >
                {formatRR(row.avgRR)}
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

interface RiskRewardBreakdownTableProps {
  bySymbol: RiskRewardBySymbol[];
  byStrategy: RiskRewardByStrategy[];
}

export default function RiskRewardBreakdownTable({
  bySymbol,
  byStrategy,
}: RiskRewardBreakdownTableProps) {
  const [activeTab, setActiveTab] = useState<TabType>("symbol");

  const symbolRows: RRRow[] = bySymbol.map((s) => ({
    label: s.symbol,
    totalTrades: s.totalTrades,
    exploitableTrades: s.exploitableTrades,
    avgRR: s.avgRR,
  }));

  const strategyRows: RRRow[] = byStrategy.map((s) => ({
    label: s.strategyName,
    totalTrades: s.totalTrades,
    exploitableTrades: s.exploitableTrades,
    avgRR: s.avgRR,
  }));

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
      {activeTab === "symbol" && <RRTable rows={symbolRows} />}
      {activeTab === "strategy" && <RRTable rows={strategyRows} />}
    </div>
  );
}
