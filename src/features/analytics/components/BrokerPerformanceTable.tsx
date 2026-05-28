import type { BrokerStats } from "../../../types";

interface BrokerPerformanceTableProps {
  rows: BrokerStats[];
  currency: string;
}

function formatMoney(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

function formatRatio(value: number | null): string {
  if (value === null) return "∞";
  return value.toFixed(2);
}

function pnlClass(value: number): string {
  if (value > 0) return "pnl-table__td--positive";
  if (value < 0) return "pnl-table__td--negative";
  return "pnl-table__td--neutral";
}

export default function BrokerPerformanceTable({
  rows,
  currency,
}: BrokerPerformanceTableProps) {
  if (rows.length === 0) {
    return <p className="settings-empty">Aucun broker à afficher.</p>;
  }

  return (
    <div className="pnl-breakdown">
      <table className="pnl-table symbol-table">
        <thead className="pnl-table__head">
          <tr>
            <th className="pnl-table__th">Broker</th>
            <th className="pnl-table__th pnl-table__th--right">Trades</th>
            <th className="pnl-table__th pnl-table__th--right">Win Rate</th>
            <th className="pnl-table__th pnl-table__th--right">PnL Total</th>
            <th className="pnl-table__th pnl-table__th--right">PnL Moyen</th>
            <th className="pnl-table__th pnl-table__th--right">
              Profit Factor
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.brokerName} className="pnl-table__row">
              <td className="pnl-table__td pnl-table__symbol">
                {row.brokerName}
              </td>
              <td className="pnl-table__td pnl-table__td--right">
                {row.totalTrades}
              </td>
              <td className="pnl-table__td pnl-table__td--right">
                {row.winRate.toFixed(1)}%
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${pnlClass(row.netPnlTotal)}`}
              >
                {formatMoney(row.netPnlTotal, currency || row.currency)}
              </td>
              <td
                className={`pnl-table__td pnl-table__td--right ${pnlClass(row.avgPnl)}`}
              >
                {formatMoney(row.avgPnl, currency || row.currency)}
              </td>
              <td className="pnl-table__td pnl-table__td--right">
                {formatRatio(row.profitFactor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
