// ============================================================
// Composant — SessionPerformanceTable
// ============================================================
// Tableau de performance par session de trading.
//
// COLONNES :
//   Session | Trades | Win Rate | PnL Total | PnL Moyen |
//   Gain Moy. | Perte Moy. | Prof. Factor
//
// COMPORTEMENT SPÉCIAL :
//   - Ordre d'affichage fixe (Asia → London → Overlap → NY → Custom → Hors session)
//     le tableau n'est PAS triable par colonne car l'ordre des sessions
//     a une signification temporelle.
//   - Sessions avec 0 trades : affichées avec "—" dans toutes les colonnes numériques.
//   - "Hors session" : fond atténué + style italique.
//
// COULEURS (identiques aux autres tables analytics) :
//   PnL Total / Moyen : vert > 0, rouge < 0
//   Gain Moyen        : vert (≥ 0)
//   Perte Moyenne     : rouge (≤ 0)
//   Profit Factor     : ∞/≥1.5 vert | ≥1.0 orange | <1.0 rouge
//   Win Rate          : ≥60% vert | ≥40% orange | <40% rouge
//
// Règle : aucune logique métier ici — formatage uniquement.
// ============================================================

import { memo } from "react";
import type { SessionStats } from "../../../types";

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

// ── Helpers de classes CSS ────────────────────────────────

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
// Ligne de données
// ============================================================

interface SessionRowProps {
  session: SessionStats;
  currency: string;
}

const SessionRow = memo(function SessionRow({
  session,
  currency,
}: SessionRowProps) {
  const isEmpty = session.totalTrades === 0;
  const isOutOfSession = session.sessionId === "out_of_session";

  const rowClass = [
    "pnl-table__row",
    isOutOfSession ? "session-table__row--out-of-session" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isEmpty) {
    return (
      <tr className={rowClass}>
        <td className="pnl-table__td session-table__name">
          {session.sessionName}
        </td>
        <td
          colSpan={7}
          className="pnl-table__td pnl-table__td--neutral pnl-table__td--right"
          style={{ opacity: 0.4, fontStyle: "italic" }}
        >
          Aucun trade
        </td>
      </tr>
    );
  }

  return (
    <tr className={rowClass}>
      {/* Session */}
      <td className="pnl-table__td session-table__name">
        {session.sessionName}
        {session.sessionId === "out_of_session" && (
          <span className="session-table__badge--out"> Hors session</span>
        )}
      </td>

      {/* Trades */}
      <td className="pnl-table__td pnl-table__td--right">
        {session.totalTrades}
        <span className="symbol-table__wl">
          {" "}
          ({session.winningTrades}W/{session.losingTrades}L)
        </span>
      </td>

      {/* Win Rate */}
      <td
        className={`pnl-table__td pnl-table__td--right ${winRateClass(session.winRate)}`}
      >
        {formatWinRate(session.winRate)}
      </td>

      {/* PnL Total */}
      <td
        className={`pnl-table__td pnl-table__td--right ${pnlClass(session.netPnlTotal)}`}
      >
        {formatMoney(session.netPnlTotal, currency)}
      </td>

      {/* PnL Moyen */}
      <td
        className={`pnl-table__td pnl-table__td--right ${pnlClass(session.avgPnl)}`}
      >
        {formatMoney(session.avgPnl, currency)}
      </td>

      {/* Gain Moyen */}
      <td
        className={`pnl-table__td pnl-table__td--right ${avgWinClass(session.avgWin)}`}
      >
        {formatMoneyNeutral(session.avgWin, currency)}
      </td>

      {/* Perte Moyenne */}
      <td
        className={`pnl-table__td pnl-table__td--right ${avgLossClass(session.avgLoss)}`}
      >
        {formatMoneyNeutral(session.avgLoss, currency)}
      </td>

      {/* Profit Factor */}
      <td
        className={`pnl-table__td pnl-table__td--right ${pfClass(session.profitFactor)}`}
      >
        {formatRatio(session.profitFactor)}
      </td>
    </tr>
  );
});

// ============================================================
// Composant principal
// ============================================================

interface SessionPerformanceTableProps {
  sessions: SessionStats[];
  currency: string;
}

const COLUMNS = [
  { label: "Session", align: "left" },
  { label: "Trades", align: "right" },
  { label: "Win Rate", align: "right" },
  { label: "PnL Total", align: "right" },
  { label: "PnL Moyen", align: "right" },
  { label: "Gain Moy.", align: "right" },
  { label: "Perte Moy.", align: "right" },
  { label: "Prof. Factor", align: "right" },
] as const;

const SessionPerformanceTable = memo(function SessionPerformanceTable({
  sessions,
  currency,
}: SessionPerformanceTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="pnl-breakdown session-table-wrapper">
        <table className="pnl-table session-table">
          <thead className="pnl-table__head">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
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
                Aucune session à afficher
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="pnl-breakdown session-table-wrapper">
      <table className="pnl-table session-table">
        <thead className="pnl-table__head">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.label}
                className={`pnl-table__th${col.align === "right" ? " pnl-table__th--right" : ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <SessionRow
              key={session.sessionId}
              session={session}
              currency={currency}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default SessionPerformanceTable;
