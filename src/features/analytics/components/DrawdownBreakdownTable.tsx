// ============================================================
// Composant — DrawdownBreakdownTable
// ============================================================
// Tableau drawdown avec 2 onglets :
//   - Courbe d'équité  : 50 derniers points chronologiques
//                        (Date | Equity | Pic | Drawdown | DD%)
//   - Pires drawdowns  : 10 points de drawdown les plus sévères,
//                        triés du plus profond au moins profond
//
// Les données sont pré-calculées par drawdownAnalyticsService.
// Règle : aucune logique métier ici, seulement du formatage et état UI.
// ============================================================

import { useState } from "react";
import type { DrawdownPoint } from "../../../types";

// ============================================================
// Configuration
// ============================================================

type TabType = "curve" | "worst";

const TAB_LABELS: Record<TabType, string> = {
  curve: "Courbe d'équité",
  worst: "Pires drawdowns",
};

/** Nombre maximum de points affichés dans l'onglet "Courbe d'équité". */
const MAX_CURVE_ROWS = 50;
/** Nombre maximum de points affichés dans l'onglet "Pires drawdowns". */
const MAX_WORST_ROWS = 10;

// ============================================================
// Helpers de formatage
// ============================================================

function formatMoney(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function equityClass(equity: number): string {
  if (equity > 0) return "pnl-table__td--positive";
  if (equity < 0) return "pnl-table__td--negative";
  return "pnl-table__td--neutral";
}

function ddClass(drawdown: number): string {
  if (drawdown < 0) return "pnl-table__td--negative";
  return "pnl-table__td--neutral";
}

// ============================================================
// Sous-composant tableau générique
// ============================================================

interface DrawdownTableProps {
  rows: DrawdownPoint[];
  currency: string;
  emptyMessage?: string;
  /** Message informatif affiché au-dessus du tableau (ex : troncature). */
  noteMessage?: string;
}

function DrawdownTable({
  rows,
  currency,
  emptyMessage = "Aucun point à afficher.",
  noteMessage,
}: DrawdownTableProps) {
  if (rows.length === 0) {
    return <p className="pnl-breakdown__empty">{emptyMessage}</p>;
  }

  return (
    <>
      {noteMessage && <p className="pnl-breakdown__empty">{noteMessage}</p>}
      <div className="pnl-table-wrapper">
        <table className="pnl-table">
          <thead>
            <tr>
              <th className="pnl-table__th">Date</th>
              <th className="pnl-table__th pnl-table__th--right">Equity</th>
              <th className="pnl-table__th pnl-table__th--right">Pic</th>
              <th className="pnl-table__th pnl-table__th--right">Drawdown</th>
              <th className="pnl-table__th pnl-table__th--right">DD%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr
                key={i}
                className={`pnl-table__row${p.drawdown < 0 ? " dd-table__row--negative" : ""}`}
              >
                <td className="pnl-table__td pnl-table__td--period">
                  {formatDate(p.date)}
                </td>
                <td
                  className={`pnl-table__td pnl-table__td--right ${equityClass(p.equity)}`}
                >
                  {formatMoney(p.equity, currency)}
                </td>
                <td className="pnl-table__td pnl-table__td--right pnl-table__td--neutral">
                  {formatMoney(p.peak, currency)}
                </td>
                <td
                  className={`pnl-table__td pnl-table__td--right ${ddClass(p.drawdown)}`}
                >
                  {p.drawdown === 0
                    ? `0.00 ${currency}`
                    : formatMoney(p.drawdown, currency)}
                </td>
                <td
                  className={`pnl-table__td pnl-table__td--right ${ddClass(p.drawdownPct)}`}
                >
                  {p.drawdownPct === 0 ? "0.00%" : formatPct(p.drawdownPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============================================================
// Composant principal
// ============================================================

interface DrawdownBreakdownTableProps {
  curve: DrawdownPoint[];
  currency: string;
}

export default function DrawdownBreakdownTable({
  curve,
  currency,
}: DrawdownBreakdownTableProps) {
  const [activeTab, setActiveTab] = useState<TabType>("curve");

  // ── Onglet "Courbe d'équité" : derniers MAX_CURVE_ROWS points ──
  const curveRows =
    curve.length > MAX_CURVE_ROWS ? curve.slice(-MAX_CURVE_ROWS) : curve;
  const curveNote =
    curve.length > MAX_CURVE_ROWS
      ? `Derniers ${MAX_CURVE_ROWS} trades affichés sur ${curve.length}`
      : undefined;

  // ── Onglet "Pires drawdowns" : top MAX_WORST_ROWS points (drawdown < 0)
  const worstRows = [...curve]
    .filter((p) => p.drawdown < 0)
    .sort((a, b) => a.drawdown - b.drawdown) // du plus profond au moins profond
    .slice(0, MAX_WORST_ROWS);

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
      {activeTab === "curve" && (
        <DrawdownTable
          rows={curveRows}
          currency={currency}
          noteMessage={curveNote}
        />
      )}
      {activeTab === "worst" && (
        <DrawdownTable
          rows={worstRows}
          currency={currency}
          emptyMessage="Aucun drawdown enregistré. Tous les trades sont profitables !"
        />
      )}
    </div>
  );
}
