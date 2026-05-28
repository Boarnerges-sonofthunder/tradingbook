// ============================================================
// Composant — HourlyHeatmap
// ============================================================
// Heatmap de performance par heure de la journée (0h–23h UTC).
//
// VISUEL :
//   Grille de 24 cellules (6 colonnes × 4 lignes).
//   Chaque cellule affiche :
//     - Heure en format "00h" → "23h"
//     - PnL net coloré (si trades > 0)
//     - Nombre de trades en exposant
//
// Les trades sont groupés par heure d'ouverture (openedAt UTC).
// Cela reflète l'heure de la prise de position.
//
// COULEURS (identiques à WeekdayHeatmap — intensité relative) :
//   Positif fort/moyen/faible → vert (3 niveaux)
//   Négatif fort/moyen/faible → rouge (3 niveaux)
//   Aucun trade               → gris atténué
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

interface HourlyHeatmapProps {
  /** 24 cellules (index 0 = 0h, 23 = 23h UTC). */
  cells: HeatmapCell[];
  currency: string;
}

// ============================================================
// Composant
// ============================================================

/**
 * Heatmap des 24 heures de la journée (UTC).
 * Affiche la performance par heure d'ouverture.
 */
const HourlyHeatmap = memo(function HourlyHeatmap({
  cells,
  currency,
}: HourlyHeatmapProps) {
  const maxAbs = useMemo(
    () => Math.max(...cells.map((c) => Math.abs(c.netPnl)), 0),
    [cells],
  );

  return (
    <div className="heatmap-hourly">
      {cells.map((cell) => {
        const colorClass = getColorClass(cell.netPnl, maxAbs, cell.trades);
        const pnlClass =
          cell.netPnl >= 0
            ? "heatmap-cell__pnl heatmap-cell__pnl--pos"
            : "heatmap-cell__pnl heatmap-cell__pnl--neg";

        return (
          <div
            key={cell.key}
            className={`heatmap-cell heatmap-hourly__cell ${colorClass}`}
          >
            <span className="heatmap-cell__label">{cell.label}</span>

            {cell.trades > 0 ? (
              <>
                <span className={pnlClass}>{fmt(cell.netPnl, currency)}</span>
                <span className="heatmap-cell__meta">{cell.trades}t</span>
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

export default HourlyHeatmap;
