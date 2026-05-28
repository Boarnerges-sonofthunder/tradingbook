import type { BacktestTrade } from "../../../types";

interface BacktestTradesTableProps {
  trades: BacktestTrade[];
}

export default function BacktestTradesTable({
  trades,
}: BacktestTradesTableProps) {
  return (
    <section className="card backtest-card">
      <h2 className="backtest-card__title">Tableau trades simules</h2>

      {trades.length === 0 ? (
        <p className="text-muted">Aucun trade simule sur ce run.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Ouvert</th>
                <th>Ferme</th>
                <th>Side</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>SL</th>
                <th>TP</th>
                <th>PnL net</th>
                <th>Sortie</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.id}>
                  <td>{new Date(trade.openedAt).toLocaleString("fr-FR")}</td>
                  <td>{new Date(trade.closedAt).toLocaleString("fr-FR")}</td>
                  <td>{trade.side.toUpperCase()}</td>
                  <td>{trade.entryPrice.toFixed(5)}</td>
                  <td>{trade.exitPrice.toFixed(5)}</td>
                  <td>{trade.stopLoss.toFixed(5)}</td>
                  <td>{trade.takeProfit.toFixed(5)}</td>
                  <td
                    className={
                      trade.netPnl >= 0 ? "text-positive" : "text-negative"
                    }
                  >
                    {trade.netPnl.toFixed(2)}
                  </td>
                  <td>{trade.exitReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
