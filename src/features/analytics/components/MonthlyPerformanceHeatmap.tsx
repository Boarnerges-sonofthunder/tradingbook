// ============================================================
// Composant — MonthlyPerformanceHeatmap
// ============================================================
// Heatmap de performance mensuelle (Janvier → Décembre).
//
// VISUEL :
//   12 cellules disposées horizontalement (une par mois).
//   Chaque cellule affiche :
//     - Nom abrégé du mois (Jan, Fév, …, Déc)
//     - PnL net total du mois (coloré)
//     - Nombre de trades
//
// IMPORTANT : les trades de TOUTES les années sont agrégés ensemble.
//   Ex : tous les "Janvier" (2023, 2024, 2025…) sont fusionnés.
//   Pour voir l'évolution année par année, utiliser le calendrier quotidien.
//
// Les trades sont groupés par mois de clôture (closedAt).
//
// COULEURS : identiques aux autres heatmaps (3 niveaux × positif/négatif).
//
// Règle : aucune logique métier ici — formatage et affichage uniquement.
// ============================================================

import { memo, useMemo } from "react";
import type { HeatmapCell } from "../../../types";

// ============================================================
// Helpers
// ============================================================

function fmt(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

function getColorClass(netPnl: number, maxAbs: number, trades: number): string {
  if (trades === 0) return "heatmap-cell--empty";
  if (netPnl === 0) return "heatmap-cell--zero";
  const ratio = maxAbs > 0 ? Math.abs(netPnl) / maxAbs : 0;
  const level = ratio > 0.67 ? 3 : ratio > 0.33 ? 2 : 1;
  const dir = netPnl > 0 ? "pos" : "neg";
  return `heatmap-cell--${dir}-${level}`;
}

// ============================================================
// Props
// ============================================================

interface MonthlyPerformanceHeatmapProps {
  /** 12 cellules (index 0 = Janvier, 11 = Décembre). */
  cells: HeatmapCell[];
  currency: string;
}

// ============================================================
// Composant
// ============================================================

/**
 * Heatmap des 12 mois de l'année.
 * Affiche la performance mensuelle agrégée (toutes années confondues).
 */
const MonthlyPerformanceHeatmap = memo(function MonthlyPerformanceHeatmap({
  cells,
  currency,
}: MonthlyPerformanceHeatmapProps) {
  const maxAbs = useMemo(
    () => Math.max(...cells.map((c) => Math.abs(c.netPnl)), 0),
    [cells],
  );

  return (
    <div className="heatmap-monthly">
      {cells.map((cell) => {
        const colorClass = getColorClass(cell.netPnl, maxAbs, cell.trades);
        const pnlClass =
          cell.netPnl >= 0
            ? "heatmap-cell__pnl heatmap-cell__pnl--pos"
            : "heatmap-cell__pnl heatmap-cell__pnl--neg";

        return (
          <div
            key={cell.key}
            className={`heatmap-cell heatmap-monthly__cell ${colorClass}`}
          >
            <span className="heatmap-cell__label">{cell.label}</span>

            {cell.trades > 0 ? (
              <>
                <span className={pnlClass}>{fmt(cell.netPnl, currency)}</span>
                <span className="heatmap-cell__meta">
                  {cell.trades} trade{cell.trades > 1 ? "s" : ""}
                </span>
              </>
            ) : (
              <span className="heatmap-cell__meta heatmap-cell__meta--empty">
                —
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default MonthlyPerformanceHeatmap;
