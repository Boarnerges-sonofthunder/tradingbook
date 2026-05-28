// ============================================================
// Composant — EmotionPerformanceTable
// ============================================================
// Tableau de performance par émotion.
//
// Colonnes :
//   Émotion | Trades | Win Rate | PnL Total | PnL Moyen |
//   Gain Moy | Perte Moy | Prof. Factor | Meilleur | Pire
//
// NOTE MULTI-ASSOCIATION :
//   Un trade avec plusieurs émotions apparaît dans chaque ligne
//   correspondante. Les PnL par émotion ne sont pas additifs.
//   Une note explicative est affichée en bas du tableau.
//
// CAS SPÉCIAL "Sans émotion" :
//   - Toujours affiché en dernière ligne (indépendamment du tri).
//   - Fond légèrement atténué + badge pour le différencier.
//   - Exclu du tri interactif (sa position est fixée).
//
// TRI (sur les émotions réelles uniquement) :
//   - Clic sur en-tête → décroissant.
//   - 2e clic → croissant.
//   - 3e clic → retour au défaut (PnL décroissant).
//   - "Sans émotion" reste toujours en dernier.
//
// COULEURS (identiques aux autres tableaux analytics) :
//   PnL Total / Moyen : vert > 0, rouge < 0
//   Gain Moyen        : vert (≥ 0)
//   Perte Moyenne     : rouge (≤ 0), gris si 0
//   Profit Factor     : ∞/≥1.5 vert | ≥1.0 orange | <1.0 rouge
//   Win Rate          : ≥60% vert | ≥40% orange | <40% rouge
//
// Règle : aucune logique métier ici — tri et formatage uniquement.
// ============================================================

import { memo, useCallback, useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { EmotionStats, EmotionSortKey } from "../../../types";

// ============================================================
// Configuration des colonnes
// ============================================================

interface ColumnConfig {
  key: EmotionSortKey;
  label: string;
  align: "left" | "right";
}

const COLUMNS: ColumnConfig[] = [
  { key: "emotionName", label: "Émotion", align: "left" },
  { key: "totalTrades", label: "Trades", align: "right" },
  { key: "winRate", label: "Win Rate", align: "right" },
  { key: "netPnl", label: "PnL Total", align: "right" },
  { key: "avgPnl", label: "PnL Moyen", align: "right" },
  { key: "avgWin", label: "Gain Moy.", align: "right" },
  { key: "avgLoss", label: "Perte Moy.", align: "right" },
  { key: "profitFactor", label: "Prof. Factor", align: "right" },
  { key: "bestTrade", label: "Meilleur", align: "right" },
  { key: "worstTrade", label: "Pire", align: "right" },
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

function winRateClass(wr: number): string {
  if (wr >= 60) return "pnl-table__td--positive";
  if (wr >= 40) return "rr-table__td--warning";
  return "pnl-table__td--negative";
}

// ============================================================
// Logique de tri (sur les émotions réelles uniquement)
// ============================================================

type SortDirection = "desc" | "asc" | "default";

interface SortState {
  key: EmotionSortKey;
  dir: SortDirection;
}

function getValue(row: EmotionStats, key: EmotionSortKey): number | string {
  switch (key) {
    case "emotionName":
      return row.emotionName;
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
    case "bestTrade":
      return row.bestTrade;
    case "worstTrade":
      return row.worstTrade;
  }
}

function sortRows(
  real: EmotionStats[],
  sort: SortState,
  defaultReal: EmotionStats[],
): EmotionStats[] {
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
  onSort: (key: EmotionSortKey) => void;
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

interface EmotionRowProps {
  row: EmotionStats;
  currency: string;
}

const EmotionRow = memo(function EmotionRow({ row, currency }: EmotionRowProps) {
  return (
    <tr
      className={`pnl-table__row${row.isUnassigned ? " strategy-table__row--unassigned" : ""}`}
    >
      {/* Émotion */}
      <td className="pnl-table__td strategy-table__name">
        {row.isUnassigned ? (
          <span className="strategy-table__badge--unassigned">
            {row.emotionName}
          </span>
        ) : (
          row.emotionName
        )}
      </td>

      {/* Trades (W/L) */}
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

      {/* Meilleur trade */}
      <td
        className={`pnl-table__td pnl-table__td--right ${pnlClass(row.bestTrade)}`}
      >
        {formatMoney(row.bestTrade, currency)}
      </td>

      {/* Pire trade */}
      <td
        className={`pnl-table__td pnl-table__td--right ${pnlClass(row.worstTrade)}`}
      >
        {formatMoney(row.worstTrade, currency)}
      </td>
    </tr>
  );
});

// ============================================================
// Composant principal
// ============================================================

interface EmotionPerformanceTableProps {
  rows: EmotionStats[];
  currency: string;
}

const EmotionPerformanceTable = memo(function EmotionPerformanceTable({
  rows,
  currency,
}: EmotionPerformanceTableProps) {
  const [sort, setSort] = useState<SortState>({
    key: "netPnl",
    dir: "default",
  });

  // Sépare les émotions réelles du groupe "Sans émotion"
  const realRows = useMemo(() => rows.filter((r) => !r.isUnassigned), [rows]);
  const unassigned = useMemo(() => rows.find((r) => r.isUnassigned), [rows]);

  // Ordre par défaut (PnL décroissant) pour les émotions réelles
  const defaultReal = useMemo(
    () => [...realRows].sort((a, b) => b.netPnlTotal - a.netPnlTotal),
    [realRows],
  );

  // Lignes triées (émotions réelles uniquement)
  const sortedReal = useMemo(
    () => sortRows(realRows, sort, defaultReal),
    [realRows, sort, defaultReal],
  );

  // "Sans émotion" toujours en dernier
  const displayRows = useMemo(
    () => (unassigned ? [...sortedReal, unassigned] : sortedReal),
    [sortedReal, unassigned],
  );

  const handleSort = useCallback((key: EmotionSortKey) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key ? nextDir(prev.dir) : "desc",
    }));
  }, []);

  if (rows.length === 0) {
    return (
      <p className="pnl-table__empty">
        Aucune donnée d&apos;émotion disponible.
      </p>
    );
  }

  return (
    <div className="pnl-table-wrapper">
      <div className="pnl-table-scroll">
        <table className="pnl-table">
          <thead>
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
              <EmotionRow key={row.emotionId} row={row} currency={currency} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Note explicative sur la nature multi-association des émotions */}
      {realRows.length > 0 && (
        <p className="pnl-table__note">
          Un trade avec plusieurs émotions est compté dans chaque groupe
          correspondant. Les totaux par émotion ne sont pas additifs.
        </p>
      )}
    </div>
  );
});

export default EmotionPerformanceTable;
