// ============================================================
// Composant — SymbolPerformanceTable
// ============================================================
// Tableau de performance par symbole/instrument.
//
// Colonnes :
//   Symbole | Trades | Win Rate | PnL Total | PnL Moyen |
//   Gain Moy | Perte Moy | Prof. Factor | R/R Moy
//
// TRI :
//   - Clic sur un en-tête de colonne active le tri sur cette colonne.
//   - Premier clic → décroissant (meilleurs en tête).
//   - Deuxième clic sur la même colonne → croissant.
//   - Troisième clic → retour au tri par défaut (PnL décroissant).
//   - Indicateur visuel ↑ / ↓ sur la colonne active.
//
// COULEURS :
//   PnL Total / PnL Moyen : vert si > 0, rouge si < 0
//   Gain Moyen             : toujours vert (valeur ≥ 0)
//   Perte Moyenne          : toujours rouge (valeur ≤ 0), gris si 0
//   Profit Factor          : ≥ 1.5 → vert | ≥ 1.0 → orange | < 1.0 → rouge | ∞ → vert
//   R/R Moyen              : ≥ 2.0 → vert | ≥ 1.0 → orange | < 1.0 → rouge | — → gris
//   Win Rate               : ≥ 60% → vert | ≥ 40% → orange | < 40% → rouge
//
// Règle : aucune logique métier ici — tri et formatage uniquement.
// ============================================================

import { memo, useCallback, useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { SymbolStats, SymbolSortKey } from "../../../types";

// ============================================================
// Configuration du tableau
// ============================================================

interface ColumnConfig {
  key: SymbolSortKey;
  label: string;
  /** Alignement de la cellule body (header est toujours left pour la 1ère col). */
  align: "left" | "right";
}

const COLUMNS: ColumnConfig[] = [
  { key: "symbol", label: "Symbole", align: "left" },
  { key: "totalTrades", label: "Trades", align: "right" },
  { key: "winRate", label: "Win Rate", align: "right" },
  { key: "netPnl", label: "PnL Total", align: "right" },
  { key: "avgPnl", label: "PnL Moyen", align: "right" },
  { key: "avgWin", label: "Gain Moy.", align: "right" },
  { key: "avgLoss", label: "Perte Moy.", align: "right" },
  { key: "profitFactor", label: "Prof. Factor", align: "right" },
  { key: "avgRR", label: "R/R Moy.", align: "right" },
];

// ============================================================
// Helpers de formatage
// ============================================================

function formatMoney(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

function formatMoneyNeutral(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

function formatWinRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatRatio(value: number | null): string {
  if (value === null) return "∞";
  return value.toFixed(2);
}

function formatRR(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(2);
}

// ============================================================
// Helpers de classes CSS
// ============================================================

function pnlClass(value: number): string {
  if (value > 0) return "pnl-table__td--positive";
  if (value < 0) return "pnl-table__td--negative";
  return "pnl-table__td--neutral";
}

function avgWinClass(value: number): string {
  return value > 0 ? "pnl-table__td--positive" : "";
}

function avgLossClass(value: number): string {
  return value < 0 ? "pnl-table__td--negative" : "";
}

function pfClass(pf: number | null): string {
  if (pf === null) return "pnl-table__td--positive"; // ∞
  if (pf >= 1.5) return "pnl-table__td--positive";
  if (pf >= 1.0) return "rr-table__td--warning";
  return "pnl-table__td--negative";
}

function rrClass(rr: number | null): string {
  if (rr === null) return "pnl-table__td--neutral";
  if (rr >= 2.0) return "pnl-table__td--positive";
  if (rr >= 1.0) return "rr-table__td--warning";
  return "pnl-table__td--negative";
}

function winRateClass(wr: number): string {
  if (wr >= 60) return "pnl-table__td--positive";
  if (wr >= 40) return "rr-table__td--warning";
  return "pnl-table__td--negative";
}

// ============================================================
// Logique de tri
// ============================================================

type SortDirection = "desc" | "asc" | "default";

interface SortState {
  key: SymbolSortKey;
  dir: SortDirection;
}

/** Extrait la valeur numérique (ou string) servant à la comparaison. */
function getValue(row: SymbolStats, key: SymbolSortKey): number | string {
  switch (key) {
    case "symbol":
      return row.symbol;
    case "totalTrades":
      return row.totalTrades;
    case "winRate":
      return row.winRate;
    case "netPnl":
      return row.netPnlTotal;
    case "avgPnl":
      return row.avgPnl;
    case "avgWin":
      return row.avgWin;
    case "avgLoss":
      return row.avgLoss;
    case "profitFactor":
      return row.profitFactor ?? Infinity; // null = ∞ → haut du classement
    case "avgRR":
      return row.avgRR ?? -Infinity; // null = inconnu → bas du classement
  }
}

function sortRows(
  rows: SymbolStats[],
  sort: SortState,
  defaultRows: SymbolStats[],
): SymbolStats[] {
  if (sort.dir === "default") return defaultRows;

  return [...rows].sort((a, b) => {
    const va = getValue(a, sort.key);
    const vb = getValue(b, sort.key);

    let cmp: number;
    if (typeof va === "string" && typeof vb === "string") {
      cmp = va.localeCompare(vb, undefined, { sensitivity: "base" });
    } else {
      cmp = (va as number) - (vb as number);
    }

    return sort.dir === "asc" ? cmp : -cmp;
  });
}

/** Cycle de direction pour un clic sur une colonne déjà active. */
function nextDir(current: SortDirection): SortDirection {
  if (current === "desc") return "asc";
  if (current === "asc") return "default";
  return "desc"; // ne devrait pas arriver (nouvelle colonne = toujours desc)
}

// ============================================================
// Sous-composant : en-tête de colonne triable
// ============================================================

interface SortableThProps {
  col: ColumnConfig;
  sort: SortState;
  onSort: (key: SymbolSortKey) => void;
}

const SortableTh = memo(function SortableTh({
  col,
  sort,
  onSort,
}: SortableThProps) {
  const isActive = sort.key === col.key && sort.dir !== "default";
  const alignClass = col.align === "right" ? " pnl-table__th--right" : "";

  return (
    <th
      className={`pnl-table__th symbol-table__th--sortable${alignClass}${isActive ? " symbol-table__th--active" : ""}`}
      onClick={() => onSort(col.key)}
      title={`Trier par ${col.label}`}
    >
      <span className="symbol-table__th-inner">
        {col.label}
        <span className="symbol-table__sort-icon">
          {isActive && sort.dir === "asc" && <ChevronUp size={12} />}
          {isActive && sort.dir === "desc" && <ChevronDown size={12} />}
          {!isActive && (
            <ChevronsUpDown
              size={12}
              className="symbol-table__sort-icon--muted"
            />
          )}
        </span>
      </span>
    </th>
  );
});

// ============================================================
// Composant principal
// ============================================================

interface SymbolPerformanceTableProps {
  rows: SymbolStats[];
  currency: string;
}

const SymbolPerformanceTable = memo(function SymbolPerformanceTable({
  rows,
  currency,
}: SymbolPerformanceTableProps) {
  // Le tableau reçoit les lignes déjà triées par défaut (PnL décroissant)
  // On en garde une copie stable pour le "retour au défaut".
  const defaultRows = useMemo(() => rows, [rows]);

  const [sort, setSort] = useState<SortState>({
    key: "netPnl",
    dir: "default", // = ordre reçu du service (PnL desc)
  });

  const handleSort = useCallback((key: SymbolSortKey) => {
    setSort((prev) => {
      if (prev.key !== key) {
        // Nouvelle colonne → tri décroissant
        return { key, dir: "desc" };
      }
      // Même colonne → cycle desc → asc → default
      return { key, dir: nextDir(prev.dir) };
    });
  }, []);

  const sortedRows = useMemo(
    () => sortRows(rows, sort, defaultRows),
    [rows, sort, defaultRows],
  );

  if (sortedRows.length === 0) {
    return (
      <div className="pnl-breakdown">
        <table className="pnl-table symbol-table">
          <thead className="pnl-table__head">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`pnl-table__th${col.align === "right" ? " pnl-table__th--right" : ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="pnl-table__td pnl-table__td--neutral pnl-table__td--empty"
              >
                Aucun symbole à afficher
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="pnl-breakdown symbol-table-wrapper">
      <table className="pnl-table symbol-table">
        <thead className="pnl-table__head">
          <tr>
            {COLUMNS.map((col) => (
              <SortableTh
                key={col.key}
                col={col}
                sort={sort}
                onSort={handleSort}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.symbol} className="pnl-table__row">
              {/* Symbole */}
              <td className="pnl-table__td pnl-table__symbol symbol-table__symbol">
                {row.symbol}
              </td>

              {/* Trades */}
              <td className="pnl-table__td pnl-table__td--right">
                {row.totalTrades}
                <span className="symbol-table__wl">
                  {" "}
                  ({row.winningTrades}W/{row.losingTrades}L)
                </span>
              </td>

              {/* Win Rate */}
              <td
                className={`pnl-table__td pnl-table__td--right ${winRateClass(row.winRate)}`}
              >
                {formatWinRate(row.winRate)}
              </td>

              {/* PnL Total */}
              <td
                className={`pnl-table__td pnl-table__td--right ${pnlClass(row.netPnlTotal)}`}
              >
                {formatMoney(row.netPnlTotal, currency)}
              </td>

              {/* PnL Moyen */}
              <td
                className={`pnl-table__td pnl-table__td--right ${pnlClass(row.avgPnl)}`}
              >
                {formatMoney(row.avgPnl, currency)}
              </td>

              {/* Gain Moyen */}
              <td
                className={`pnl-table__td pnl-table__td--right ${avgWinClass(row.avgWin)}`}
              >
                {formatMoneyNeutral(row.avgWin, currency)}
              </td>

              {/* Perte Moyenne */}
              <td
                className={`pnl-table__td pnl-table__td--right ${avgLossClass(row.avgLoss)}`}
              >
                {formatMoneyNeutral(row.avgLoss, currency)}
              </td>

              {/* Profit Factor */}
              <td
                className={`pnl-table__td pnl-table__td--right ${pfClass(row.profitFactor)}`}
              >
                {formatRatio(row.profitFactor)}
              </td>

              {/* R/R Moyen */}
              <td
                className={`pnl-table__td pnl-table__td--right ${rrClass(row.avgRR)}`}
              >
                {formatRR(row.avgRR)}
                {row.tradesWithRR > 0 && row.tradesWithRR < row.totalTrades && (
                  <span className="symbol-table__wl">
                    {" "}
                    ({row.tradesWithRR}/{row.totalTrades})
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default SymbolPerformanceTable;
