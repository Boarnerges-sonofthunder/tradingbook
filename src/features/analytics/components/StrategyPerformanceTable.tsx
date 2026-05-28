// ============================================================
// Composant — StrategyPerformanceTable
// ============================================================
// Tableau de performance par stratégie/playbook.
//
// Colonnes :
//   Stratégie | Trades | Win Rate | PnL Total | PnL Moyen |
//   Gain Moy | Perte Moy | Prof. Factor | R/R Moy
//
// CAS SPÉCIAL "Sans stratégie" :
//   - Toujours affiché en dernière ligne (indépendamment du tri).
//   - Fond légèrement atténué + badge "Sans stratégie" pour le différencier.
//   - Exclu du tri interactif (sa position est fixée).
//
// TRI (sur les stratégies réelles uniquement) :
//   - Clic sur en-tête → décroissant.
//   - 2e clic → croissant.
//   - 3e clic → retour au défaut (PnL décroissant).
//   - "Sans stratégie" reste toujours en dernier.
//
// COULEURS (identiques à SymbolPerformanceTable) :
//   PnL Total / Moyen : vert > 0, rouge < 0
//   Gain Moyen        : vert (≥ 0)
//   Perte Moyenne     : rouge (≤ 0), gris si 0
//   Profit Factor     : ∞/≥1.5 vert | ≥1.0 orange | <1.0 rouge
//   R/R Moyen         : ≥2.0 vert | ≥1.0 orange | <1.0 rouge | — gris
//   Win Rate          : ≥60% vert | ≥40% orange | <40% rouge
//
// Règle : aucune logique métier ici — tri et formatage uniquement.
// ============================================================

import { memo, useCallback, useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { StrategyStats, StrategySortKey } from "../../../types";

// ============================================================
// Configuration
// ============================================================

interface ColumnConfig {
  key: StrategySortKey;
  label: string;
  align: "left" | "right";
}

const COLUMNS: ColumnConfig[] = [
  { key: "strategyName", label: "Stratégie", align: "left" },
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
  if (pf === null) return "pnl-table__td--positive";
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
// Logique de tri (sur les lignes réelles uniquement)
// ============================================================

type SortDirection = "desc" | "asc" | "default";

interface SortState {
  key: StrategySortKey;
  dir: SortDirection;
}

function getValue(row: StrategyStats, key: StrategySortKey): number | string {
  switch (key) {
    case "strategyName":
      return row.strategyName;
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
      return row.profitFactor ?? Infinity;
    case "avgRR":
      return row.avgRR ?? -Infinity;
  }
}

function sortRows(
  real: StrategyStats[],
  sort: SortState,
  defaultReal: StrategyStats[],
): StrategyStats[] {
  if (sort.dir === "default") return defaultReal;

  return [...real].sort((a, b) => {
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

function nextDir(current: SortDirection): SortDirection {
  if (current === "desc") return "asc";
  if (current === "asc") return "default";
  return "desc";
}

// ============================================================
// Sous-composants
// ============================================================

interface SortableThProps {
  col: ColumnConfig;
  sort: SortState;
  onSort: (key: StrategySortKey) => void;
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

// ── Ligne de données ──────────────────────────────────────

interface StrategyRowProps {
  row: StrategyStats;
  currency: string;
}

const StrategyRow = memo(function StrategyRow({
  row,
  currency,
}: StrategyRowProps) {
  return (
    <tr
      className={`pnl-table__row${row.isUnassigned ? " strategy-table__row--unassigned" : ""}`}
    >
      {/* Stratégie */}
      <td className="pnl-table__td strategy-table__name">
        {row.isUnassigned ? (
          <span className="strategy-table__badge--unassigned">
            {row.strategyName}
          </span>
        ) : (
          row.strategyName
        )}
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
  );
});

// ============================================================
// Composant principal
// ============================================================

interface StrategyPerformanceTableProps {
  rows: StrategyStats[];
  currency: string;
}

const StrategyPerformanceTable = memo(function StrategyPerformanceTable({
  rows,
  currency,
}: StrategyPerformanceTableProps) {
  // Séparer les lignes réelles du groupe "Sans stratégie"
  const realRows = useMemo(() => rows.filter((r) => !r.isUnassigned), [rows]);
  const unassignedRow = useMemo(
    () => rows.find((r) => r.isUnassigned) ?? null,
    [rows],
  );

  // Copie stable pour le "retour au défaut" (PnL desc du service)
  const defaultReal = useMemo(() => realRows, [realRows]);

  const [sort, setSort] = useState<SortState>({
    key: "netPnl",
    dir: "default",
  });

  const handleSort = useCallback((key: StrategySortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "desc" };
      return { key, dir: nextDir(prev.dir) };
    });
  }, []);

  const sortedReal = useMemo(
    () => sortRows(realRows, sort, defaultReal),
    [realRows, sort, defaultReal],
  );

  // Tableau final : réels triés + "Sans stratégie" toujours en dernier
  const displayRows = useMemo(
    () =>
      unassignedRow !== null ? [...sortedReal, unassignedRow] : sortedReal,
    [sortedReal, unassignedRow],
  );

  if (displayRows.length === 0) {
    return (
      <div className="pnl-breakdown">
        <table className="pnl-table strategy-table">
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
                Aucune stratégie à afficher
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="pnl-breakdown strategy-table-wrapper">
      <table className="pnl-table strategy-table">
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
          {displayRows.map((row) => (
            <StrategyRow key={row.strategyId} row={row} currency={currency} />
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default StrategyPerformanceTable;
