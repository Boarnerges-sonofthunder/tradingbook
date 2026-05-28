// ============================================================
// Composant — WeekdayHeatmap
// ============================================================
// Heatmap de performance par jour de la semaine (Lun → Dim).
//
// VISUEL :
//   7 cellules disposées horizontalement.
//   Chaque cellule affiche :
//     - Nom abrégé du jour (Lun, Mar, …, Dim)
//     - PnL net total coloré selon la valeur
//     - Nombre de trades + win rate (si trades > 0)
//
// COULEURS (intensité relative au max absolu du dataset) :
//   Positif fort   → vert opaque
//   Positif moyen  → vert semi-transparent
//   Positif faible → vert léger
//   Négatif fort   → rouge opaque
//   Négatif moyen  → rouge semi-transparent
//   Négatif faible → rouge léger
//   Aucun trade    → fond atténué (gris)
//
// Les trades sont groupés par jour d'ouverture (openedAt UTC).
// Cela reflète le moment de la décision de trading.
//
// Règle : aucune logique métier ici — formatage et affichage uniquement.
// ============================================================

import { memo, useMemo } from "react";
import type { HeatmapCell } from "../../../types";

// ============================================================
// Helpers de formatage et de couleur
// ============================================================

/** Formatte un montant avec signe et devise. */
function fmt(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

/** Formatte un win rate en pourcentage entier. */
function fmtWR(value: number): string {
  return `${value.toFixed(0)}%`;
}

/**
 * Retourne la classe CSS BEM de couleur d'une cellule heatmap.
 *
 * L'intensité est calculée relativement au maximum absolu du dataset
 * pour éviter les effets de perspective trompeurs.
 *
 * @param netPnl  - PnL net de la cellule
 * @param maxAbs  - Maximum absolu du dataset (pour normalisation)
 * @param trades  - Nombre de trades (0 = cellule vide → gris)
 */
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

interface WeekdayHeatmapProps {
  /** 7 cellules (index 0 = Lundi, 6 = Dimanche). */
  cells: HeatmapCell[];
  currency: string;
}

// ============================================================
// Composant
// ============================================================

/**
 * Heatmap des 7 jours de la semaine.
 * Affiche la performance par jour d'ouverture.
 */
const WeekdayHeatmap = memo(function WeekdayHeatmap({
  cells,
  currency,
}: WeekdayHeatmapProps) {
  // Maximum absolu sur le dataset pour la normalisation des couleurs
  const maxAbs = useMemo(
    () => Math.max(...cells.map((c) => Math.abs(c.netPnl)), 0),
    [cells],
  );

  return (
    <div className="heatmap-weekday">
      {cells.map((cell) => {
        const colorClass = getColorClass(cell.netPnl, maxAbs, cell.trades);
        const pnlClass =
          cell.netPnl >= 0
            ? "heatmap-cell__pnl heatmap-cell__pnl--pos"
            : "heatmap-cell__pnl heatmap-cell__pnl--neg";

        return (
          <div
            key={cell.key}
            className={`heatmap-cell heatmap-weekday__cell ${colorClass}`}
          >
            <span className="heatmap-cell__label">{cell.label}</span>

            {cell.trades > 0 ? (
              <>
                <span className={pnlClass}>{fmt(cell.netPnl, currency)}</span>
                <span className="heatmap-cell__meta">
                  {cell.trades} trade{cell.trades > 1 ? "s" : ""}&nbsp;·&nbsp;
                  {fmtWR(cell.winRate)}
                </span>
              </>
            ) : (
              <span className="heatmap-cell__meta heatmap-cell__meta--empty">
                Aucun trade
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default WeekdayHeatmap;
