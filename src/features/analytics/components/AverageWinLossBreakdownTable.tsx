// ============================================================
// Composant — AverageWinLossBreakdownTable
// ============================================================
// Tableau Average Win/Loss avec 2 onglets :
//   - Par symbole   : avgWin, avgLoss, ratio par instrument
//   - Par stratégie : avgWin, avgLoss, ratio par stratégie
//
// Colonnes : Libellé | Gagnants | Perdants | Gain Moy. | Perte Moy. | Ratio G/P
//
// Seuils de couleur du Ratio G/P :
//   null (∞) → vert     |  ≥ 1.5 → vert
//   ≥ 1.0    → orange   |  < 1.0 → rouge
//
// Les données sont pré-calculées par averageWinLossAnalyticsService.
// Règle : aucune logique métier ici, seulement du formatage et état UI.
// ============================================================

import { useState } from "react";
import type { AvgWinLossBySymbol, AvgWinLossByStrategy } from "../../../types";

// ============================================================
// Configuration
// ============================================================

type TabType = "symbol" | "strategy";

const TAB_LABELS: Record<TabType, string> = {
  symbol: "Par symbole",
  strategy: "Par stratégie",
};

// ============================================================
// Helpers de formatage
// ============================================================

function formatMoney(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

/**
 * Formate le ratio gain/perte.
 * null → "∞" (aucun perdant = ratio infini).
 */
function formatRatio(value: number | null): string {
  if (value === null) return "∞";
  return value.toFixed(2);
}

// ============================================================
// Helpers de classes CSS
// ============================================================

/**
 * Classe CSS pour les cellules de montant positif (gain moyen).
 * Neutre si 0 (pas de trades gagnants sur cette ligne).
 */
function avgWinClass(value: number): string {
  return value > 0 ? "pnl-table__td--positive" : "";
}

/**
 * Classe CSS pour les cellules de montant négatif (perte moyenne).
 * Neutre si 0 (pas de trades perdants sur cette ligne).
 */
function avgLossClass(value: number): string {
  return value < 0 ? "pnl-table__td--negative" : "";
}

/**
 * Classe CSS pour la colonne Ratio G/P.
 *   null (∞)  → positive (vert)
 *   ≥ 1.5     → positive (vert)
 *   ≥ 1.0     → warning  (orange)
 *   < 1.0     → negative (rouge)
 */
function ratioClass(ratio: number | null): string {
  if (ratio === null) return "pnl-table__td--positive";
  if (ratio >= 1.5) return "pnl-table__td--positive";
  if (ratio >= 1.0) return "rr-table__td--warning";
  return "pnl-table__td--negative";
}

// ============================================================
// Sous-composants de tableau
// ============================================================

/** En-tête commun aux deux onglets. */
function TableHead({ currency }: { currency: string }) {
  return (
    <thead className="pnl-table__head">
      <tr>
        <th className="pnl-table__th">Libellé</th>
        <th className="pnl-table__th pnl-table__th--right">Gagnants</th>
        <th className="pnl-table__th pnl-table__th--right">Perdants</th>
        <th className="pnl-table__th pnl-table__th--right">
          Gain Moy. ({currency})
        </th>
        <th className="pnl-table__th pnl-table__th--right">
          Perte Moy. ({currency})
        </th>
        <th className="pnl-table__th pnl-table__th--right">Ratio G/P</th>
      </tr>
    </thead>
  );
}

/** Ligne d'état vide. */
function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="pnl-table__td pnl-table__td--neutral pnl-table__td--empty"
      >
        Aucune donnée disponible
      </td>
    </tr>
  );
}

// ── Tableau par symbole ────────────────────────────────────

interface BySymbolTableProps {
  rows: AvgWinLossBySymbol[];
  currency: string;
}

function BySymbolTable({ rows, currency }: BySymbolTableProps) {
  if (rows.length === 0) {
    return (
      <div className="pnl-breakdown">
        <table className="pnl-table">
          <TableHead currency={currency} />
          <tbody>
            <EmptyRow colSpan={6} />
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="pnl-breakdown">
      <table className="pnl-table">
        <TableHead currency={currency} />
        <tbody>
          {rows.map((row) => (
            <tr key={row.symbol} className="pnl-table__row">
              <td className="pnl-table__td pnl-table__symbol">{row.symbol}</td>
              <td className="pnl-table__td pnl-table__td--right">
                {row.winningTrades}
              </td>
              <td className="pnl-table__td pnl-table__td--right">
                {row.losingTrades}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${avgWinClass(row.avgWin)}`}
              >
                {formatMoney(row.avgWin, currency)}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${avgLossClass(row.avgLoss)}`}
              >
                {formatMoney(row.avgLoss, currency)}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${ratioClass(row.winLossRatio)}`}
              >
                {formatRatio(row.winLossRatio)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tableau par stratégie ──────────────────────────────────

interface ByStrategyTableProps {
  rows: AvgWinLossByStrategy[];
  currency: string;
}

function ByStrategyTable({ rows, currency }: ByStrategyTableProps) {
  if (rows.length === 0) {
    return (
      <div className="pnl-breakdown">
        <table className="pnl-table">
          <TableHead currency={currency} />
          <tbody>
            <EmptyRow colSpan={6} />
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="pnl-breakdown">
      <table className="pnl-table">
        <TableHead currency={currency} />
        <tbody>
          {rows.map((row) => (
            <tr key={row.strategyId} className="pnl-table__row">
              <td className="pnl-table__td">{row.strategyName}</td>
              <td className="pnl-table__td pnl-table__td--right">
                {row.winningTrades}
              </td>
              <td className="pnl-table__td pnl-table__td--right">
                {row.losingTrades}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${avgWinClass(row.avgWin)}`}
              >
                {formatMoney(row.avgWin, currency)}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${avgLossClass(row.avgLoss)}`}
              >
                {formatMoney(row.avgLoss, currency)}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${ratioClass(row.winLossRatio)}`}
              >
                {formatRatio(row.winLossRatio)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Props + Composant principal
// ============================================================

interface AverageWinLossBreakdownTableProps {
  bySymbol: AvgWinLossBySymbol[];
  byStrategy: AvgWinLossByStrategy[];
  /** Devise à afficher dans les en-têtes de colonnes. */
  currency: string;
}

export default function AverageWinLossBreakdownTable({
  bySymbol,
  byStrategy,
  currency,
}: AverageWinLossBreakdownTableProps) {
  const [activeTab, setActiveTab] = useState<TabType>("symbol");

  return (
    <div className="pnl-breakdown-section">
      {/* ── Onglets ── */}
      <div className="period-tabs">
        {(Object.keys(TAB_LABELS) as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`period-tab${activeTab === tab ? " period-tab--active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ── Contenu de l'onglet actif ── */}
      {activeTab === "symbol" && (
        <BySymbolTable rows={bySymbol} currency={currency} />
      )}
      {activeTab === "strategy" && (
        <ByStrategyTable rows={byStrategy} currency={currency} />
      )}
    </div>
  );
}
