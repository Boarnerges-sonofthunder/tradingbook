import { memo, useCallback, useMemo } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ROUTES } from "../../../constants/routes";
import { useVirtualList } from "../../../hooks";
import {
  formatDateForSettings,
  formatMoneyForSettings,
} from "../../../services/settings/settingsFormatService";
import { TRADE_SORT_LABELS, toggleTradesSort } from "../../../services/sorting";
import type {
  Trade,
  TradeSortField,
  TradesSort,
  UserSettings,
} from "../../../types";

interface TradesTableProps {
  trades: Trade[];
  sort: TradesSort;
  settings: UserSettings;
  onSortChange: (sort: TradesSort) => void;
}

interface SortableHeaderProps {
  field: TradeSortField;
  label: string;
  className?: string;
  sort: TradesSort;
  onSortChange: (sort: TradesSort) => void;
}

function formatNum(value: number | null, decimals = 2): string {
  if (value === null) return "-";
  return value.toFixed(decimals);
}

const SideBadge = memo(function SideBadge({ side }: { side: "buy" | "sell" }) {
  return (
    <span
      className={`badge ${side === "buy" ? "badge-positive" : "badge-negative"}`}
    >
      {side === "buy" ? "Buy" : "Sell"}
    </span>
  );
});

const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "open"
      ? "badge-accent"
      : status === "cancelled"
        ? "badge-warning"
        : "badge-neutral";
  const label =
    status === "open" ? "Ouvert" : status === "closed" ? "Fermé" : "Annulé";
  return <span className={`badge ${cls}`}>{label}</span>;
});

const SortableHeader = memo(function SortableHeader({
  field,
  label,
  className,
  sort,
  onSortChange,
}: SortableHeaderProps) {
  const isActive = sort.field === field;
  const icon = isActive ? (
    sort.direction === "asc" ? (
      <ArrowUp size={12} aria-hidden />
    ) : (
      <ArrowDown size={12} aria-hidden />
    )
  ) : (
    <ArrowUpDown size={12} aria-hidden />
  );

  return (
    <th
      scope="col"
      className={className}
      aria-sort={
        isActive
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        className={`trades-table__sort-btn${isActive ? " trades-table__sort-btn--active" : ""}`}
        onClick={() => onSortChange(toggleTradesSort(sort, field))}
        title={`Trier par ${TRADE_SORT_LABELS[field]}`}
      >
        <span>{label}</span>
        {icon}
      </button>
    </th>
  );
});

interface TradeRowProps {
  trade: Trade;
  settings: UserSettings;
  onOpenTrade: (tradeId: number) => void;
}

const TRADE_ROW_HEIGHT = 45;
const TRADE_TABLE_MAX_HEIGHT = 560;
const TRADE_VIRTUALIZATION_THRESHOLD = 40;

const TradeTableRow = memo(function TradeTableRow({
  trade,
  settings,
  onOpenTrade,
}: TradeRowProps) {
  const detailPath = ROUTES.TRADE_DETAILS.replace(":id", String(trade.id));
  const netPnl = trade.netPnl;

  return (
    <tr
      className={`trades-table__row trades-table__row--${trade.status}`}
      onClick={() => onOpenTrade(trade.id)}
      title={`Trade #${trade.id} - ${trade.symbol}`}
    >
      <td>
        <span className="text-mono">{trade.symbol}</span>
      </td>
      <td>
        <span className="text-mono">{trade.broker ?? "-"}</span>
      </td>
      <td>
        <SideBadge side={trade.side} />
      </td>
      <td>
        <StatusBadge status={trade.status} />
      </td>
      <td className="trades-table__date">
        {formatDateForSettings(trade.openedAt, settings)}
      </td>
      <td className="trades-table__date">
        {formatDateForSettings(trade.closedAt, settings)}
      </td>
      <td className="trades-table__col-num text-mono">
        {formatNum(trade.entryPrice)}
      </td>
      <td className="trades-table__col-num text-mono">
        {trade.exitPrice !== null ? (
          formatNum(trade.exitPrice)
        ) : (
          <span className="text-muted">-</span>
        )}
      </td>
      <td className="trades-table__col-num text-mono">{trade.volume}</td>
      <td className="trades-table__col-num">
        {netPnl !== null ? (
          <span
            className={
              netPnl >= 0
                ? "text-positive text-mono"
                : "text-negative text-mono"
            }
          >
            {formatMoneyForSettings(netPnl, settings, {
              signed: true,
            })}
          </span>
        ) : (
          <span className="text-muted">-</span>
        )}
      </td>
      <td className="trades-table__col-actions">
        <Link
          to={detailPath}
          className="btn-ghost btn-icon-text"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Voir le trade ${trade.symbol} #${trade.id}`}
        >
          <Eye size={13} aria-hidden />
          Voir
        </Link>
      </td>
    </tr>
  );
});

export const TradesTable = memo(function TradesTable({
  trades,
  sort,
  settings,
  onSortChange,
}: TradesTableProps) {
  const navigate = useNavigate();
  const shouldVirtualize = trades.length > TRADE_VIRTUALIZATION_THRESHOLD;
  const {
    containerRef,
    handleScroll,
    startIndex,
    endIndex,
    offsetTop,
    offsetBottom,
  } = useVirtualList({
    itemCount: trades.length,
    itemHeight: TRADE_ROW_HEIGHT,
    overscan: 8,
    enabled: shouldVirtualize,
  });
  const openTrade = useCallback(
    (tradeId: number) => {
      navigate(ROUTES.TRADE_DETAILS.replace(":id", String(tradeId)));
    },
    [navigate],
  );
  const visibleTrades = useMemo(
    () => (shouldVirtualize ? trades.slice(startIndex, endIndex) : trades),
    [endIndex, shouldVirtualize, startIndex, trades],
  );

  return (
    <div
      ref={containerRef}
      className={`table-wrapper${shouldVirtualize ? " table-wrapper--virtualized" : ""}`}
      onScroll={handleScroll}
      style={
        shouldVirtualize
          ? { maxHeight: `${TRADE_TABLE_MAX_HEIGHT}px` }
          : undefined
      }
    >
      <table className="trades-table" style={{ minWidth: "800px" }}>
        <thead>
          <tr>
            <SortableHeader
              field="symbol"
              label="Symbole"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              field="broker"
              label="Broker"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              field="side"
              label="Direction"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              field="status"
              label="Statut"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              field="openedAt"
              label="Ouvert le"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              field="closedAt"
              label="Fermé le"
              sort={sort}
              onSortChange={onSortChange}
            />
            <th scope="col" className="trades-table__col-num">
              Entrée
            </th>
            <th scope="col" className="trades-table__col-num">
              Sortie
            </th>
            <SortableHeader
              field="volume"
              label="Volume"
              className="trades-table__col-num"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              field="netPnl"
              label="P&L net"
              className="trades-table__col-num"
              sort={sort}
              onSortChange={onSortChange}
            />
            <th scope="col" className="trades-table__col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {shouldVirtualize && offsetTop > 0 && (
            <tr className="table-virtual-spacer" aria-hidden="true">
              <td colSpan={11} style={{ height: `${offsetTop}px` }} />
            </tr>
          )}
          {visibleTrades.map((trade) => (
            <TradeTableRow
              key={trade.id}
              trade={trade}
              settings={settings}
              onOpenTrade={openTrade}
            />
          ))}
          {shouldVirtualize && offsetBottom > 0 && (
            <tr className="table-virtual-spacer" aria-hidden="true">
              <td colSpan={11} style={{ height: `${offsetBottom}px` }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
