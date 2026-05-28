// ============================================================
// Composant - DailyPnLCalendarHeatmap
// ============================================================
// Heatmap calendrier mensuelle du PnL journalier.
// Les statistiques viennent de performanceCalendarAnalyticsService :
// l'UI construit uniquement la grille de dates et les interactions.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
} from "lucide-react";
import type {
  PerformanceCalendarDay,
  PerformanceCalendarMonthSummary,
  PerformanceCalendarTradeItem,
} from "../../../types";
import { ROUTES } from "../../../constants/routes";
import MonthlyPerformanceSummary from "./MonthlyPerformanceSummary";

const DAY_HEADERS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface CalendarCell {
  date: string | null;
  dayNumber: number;
  stats: PerformanceCalendarDay | null;
}

interface DailyPnLCalendarHeatmapProps {
  days: PerformanceCalendarDay[];
  months: PerformanceCalendarMonthSummary[];
  currency: string;
  isEmpty?: boolean;
}

function formatMoney(value: number, currency: string, signed = false): string {
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatCompact(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
  })}`;
}

function formatPct(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}%`;
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function detailPath(tradeId: number): string {
  return ROUTES.TRADE_DETAILS.replace(":id", String(tradeId));
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(year, monthNum - 1, 1);
  return date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function addMonth(month: string, offset: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(year, monthNum - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthRange(months: PerformanceCalendarMonthSummary[]): string[] {
  if (months.length === 0) return [];

  // Le mois courant reste navigable meme si aucune journee de trading
  // n'existe encore dans les donnees preparees.
  const current = currentMonthKey();
  const monthAnchors = [...months.map((month) => month.month), current].sort();
  const first = monthAnchors[0];
  const last = monthAnchors[monthAnchors.length - 1];
  const range: string[] = [];

  for (let month = first; month <= last; month = addMonth(month, 1)) {
    range.push(month);
  }

  return range;
}

function buildMonthGrid(
  month: string,
  daysByDate: Map<string, PerformanceCalendarDay>,
): CalendarCell[][] {
  const [year, monthNum] = month.split("-").map(Number);
  const monthIndex = monthNum - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const offset = (firstDay + 6) % 7; // lundi = 0
  const cells: CalendarCell[] = [];

  for (let i = 0; i < offset; i += 1) {
    cells.push({ date: null, dayNumber: 0, stats: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({
      date,
      dayNumber: day,
      stats: daysByDate.get(date) ?? null,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, dayNumber: 0, stats: null });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return weeks;
}

function intensityClass(stats: PerformanceCalendarDay | null, maxAbs: number): string {
  if (!stats) return "daily-pnl-calendar__day--empty";
  if (stats.netPnl === 0) return "daily-pnl-calendar__day--neutral";

  const ratio = maxAbs > 0 ? Math.abs(stats.netPnl) / maxAbs : 0;
  const level = ratio >= 0.67 ? 3 : ratio >= 0.33 ? 2 : 1;
  const direction = stats.netPnl > 0 ? "positive" : "negative";
  return `daily-pnl-calendar__day--${direction}-${level}`;
}

function dayTitle(
  date: string | null,
  stats: PerformanceCalendarDay | null,
  currency: string,
): string {
  if (!date) return "";
  if (!stats) return `${date}\nAucun trade fermé`;

  return [
    date,
    `PnL net: ${formatMoney(stats.netPnl, currency, true)}`,
    `Trades: ${stats.trades}`,
    `Gagnants: ${stats.winningTrades}`,
    `Perdants: ${stats.losingTrades}`,
    `Win rate: ${formatPct(stats.winRate)}`,
    `Meilleur trade: ${formatMoney(stats.bestTrade, currency, true)}`,
    `Pire trade: ${formatMoney(stats.worstTrade, currency, true)}`,
  ].join("\n");
}

function TradeSideLabel({ side }: { side: PerformanceCalendarTradeItem["side"] }) {
  return (
    <span className={`daily-pnl-calendar__trade-side daily-pnl-calendar__trade-side--${side}`}>
      {side === "buy" ? "Buy" : "Sell"}
    </span>
  );
}

function DayTradesDialog({
  selectedDate,
  day,
  currency,
  onClose,
}: {
  selectedDate: string | null;
  day: PerformanceCalendarDay | null;
  currency: string;
  onClose: () => void;
}) {
  if (!selectedDate) return null;

  if (!day) {
    return (
      <div
        className="daily-pnl-calendar__dialog-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-pnl-calendar-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="daily-pnl-calendar__dialog">
          <div className="daily-pnl-calendar__dialog-header">
            <h3 id="daily-pnl-calendar-dialog-title">
              {formatDateLabel(selectedDate)}
            </h3>
            <button
              type="button"
              className="daily-pnl-calendar__dialog-close"
              onClick={onClose}
              aria-label="Fermer"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="daily-pnl-calendar__dialog-empty">
            Aucun trade fermé pour cette journée.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="daily-pnl-calendar__dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-pnl-calendar-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="daily-pnl-calendar__dialog">
        <div className="daily-pnl-calendar__dialog-header">
          <h3 id="daily-pnl-calendar-dialog-title">
            {formatDateLabel(day.date)}
          </h3>
          <button
            type="button"
            className="daily-pnl-calendar__dialog-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="daily-pnl-calendar__dialog-summary">
          <div>
            <span>PnL net</span>
            <strong className={day.netPnl >= 0 ? "daily-pnl-calendar__pnl--positive" : "daily-pnl-calendar__pnl--negative"}>
              {formatMoney(day.netPnl, currency, true)}
            </strong>
          </div>
          <div>
            <span>Trades</span>
            <strong>{day.trades}</strong>
          </div>
          <div>
            <span>Win rate</span>
            <strong>{formatPct(day.winRate)}</strong>
          </div>
          <div>
            <span>Meilleur trade</span>
            <strong className={day.bestTrade >= 0 ? "daily-pnl-calendar__pnl--positive" : "daily-pnl-calendar__pnl--negative"}>
              {formatMoney(day.bestTrade, currency, true)}
            </strong>
          </div>
          <div>
            <span>Pire trade</span>
            <strong className={day.worstTrade >= 0 ? "daily-pnl-calendar__pnl--positive" : "daily-pnl-calendar__pnl--negative"}>
              {formatMoney(day.worstTrade, currency, true)}
            </strong>
          </div>
        </div>

        <div className="daily-pnl-calendar__trade-table-wrap">
          <table className="daily-pnl-calendar__trade-table">
            <thead>
              <tr>
                <th>Trade</th>
                <th>Type</th>
                <th>Cloture</th>
                <th>Symbole</th>
                <th className="daily-pnl-calendar__trade-num">Volume</th>
                <th>Duree</th>
                <th className="daily-pnl-calendar__trade-num">Entrée</th>
                <th className="daily-pnl-calendar__trade-num">Sortie</th>
                <th className="daily-pnl-calendar__trade-num">SL</th>
                <th className="daily-pnl-calendar__trade-num">TP</th>
                <th className="daily-pnl-calendar__trade-num">PnL</th>
                <th aria-label="Detail"></th>
              </tr>
            </thead>
            <tbody>
              {day.tradeItems.map((trade) => (
                <tr key={trade.id}>
                  <td className="daily-pnl-calendar__trade-id">
                    {trade.externalId ?? `#${trade.id}`}
                  </td>
                  <td>
                    <TradeSideLabel side={trade.side} />
                  </td>
                  <td>{formatTime(trade.closedAt)}</td>
                  <td className="daily-pnl-calendar__trade-symbol">
                    {trade.symbol}
                  </td>
                  <td className="daily-pnl-calendar__trade-num">
                    {formatNumber(trade.volume, 2)}
                  </td>
                  <td>{formatDuration(trade.durationSeconds)}</td>
                  <td className="daily-pnl-calendar__trade-num">
                    {formatNumber(trade.entryPrice, 5)}
                  </td>
                  <td className="daily-pnl-calendar__trade-num">
                    {formatNumber(trade.exitPrice, 5)}
                  </td>
                  <td className="daily-pnl-calendar__trade-num">
                    {formatNumber(trade.stopLoss, 5)}
                  </td>
                  <td className="daily-pnl-calendar__trade-num">
                    {formatNumber(trade.takeProfit, 5)}
                  </td>
                  <td className="daily-pnl-calendar__trade-num">
                    <span className={trade.netPnl >= 0 ? "daily-pnl-calendar__pnl--positive" : "daily-pnl-calendar__pnl--negative"}>
                      {formatMoney(trade.netPnl, currency, true)}
                    </span>
                  </td>
                  <td>
                    <Link
                      to={detailPath(trade.id)}
                      className="daily-pnl-calendar__trade-link"
                      aria-label={`Voir le trade ${trade.id}`}
                    >
                      <ExternalLink size={15} aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function DailyPnLCalendarHeatmap({
  days,
  months,
  currency,
  isEmpty = false,
}: DailyPnLCalendarHeatmapProps) {
  const monthKeys = useMemo(() => buildMonthRange(months), [months]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hasUserSelectedMonth, setHasUserSelectedMonth] = useState(false);
  const defaultMonth = monthKeys[monthKeys.length - 1] ?? "";
  const selectedMonthIsValid =
    selectedMonth !== null && monthKeys.includes(selectedMonth);
  const activeMonth =
    hasUserSelectedMonth === true && selectedMonthIsValid
      ? selectedMonth
      : defaultMonth;

  useEffect(() => {
    if (
      hasUserSelectedMonth === true &&
      selectedMonth !== null &&
      !monthKeys.includes(selectedMonth)
    ) {
      setHasUserSelectedMonth(false);
      setSelectedMonth(null);
    }
  }, [hasUserSelectedMonth, monthKeys, selectedMonth]);

  useEffect(() => {
    if (!selectedDate) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedDate(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDate]);

  const daysByDate = useMemo(() => {
    const map = new Map<string, PerformanceCalendarDay>();
    for (const day of days) map.set(day.date, day);
    return map;
  }, [days]);
  const summariesByMonth = useMemo(
    () => new Map(months.map((month) => [month.month, month])),
    [months],
  );

  const currentMonthDays = useMemo(
    () => days.filter((day) => day.month === activeMonth),
    [activeMonth, days],
  );

  // Normalisation visuelle uniquement : les calculs metier restent dans le service.
  const maxAbs = useMemo(
    () => Math.max(...currentMonthDays.map((day) => Math.abs(day.netPnl)), 0),
    [currentMonthDays],
  );

  const weeks = useMemo(() => {
    if (!activeMonth) return [];
    return buildMonthGrid(activeMonth, daysByDate);
  }, [activeMonth, daysByDate]);

  const selectedDay = selectedDate ? daysByDate.get(selectedDate) ?? null : null;
  const selectedIndex = monthKeys.indexOf(activeMonth);
  const selectedSummary = summariesByMonth.get(activeMonth) ?? null;
  const dayButtons = useMemo(
    () =>
      weeks.flatMap((week, weekIndex) =>
        week.map((cell, dayIndex) => {
          const isSelected = cell.date !== null && cell.date === selectedDate;
          return (
            <button
              key={`${weekIndex}-${dayIndex}-${cell.date ?? "outside"}`}
              type="button"
              className={`daily-pnl-calendar__day ${intensityClass(
                cell.stats,
                maxAbs,
              )}${cell.date ? "" : " daily-pnl-calendar__day--outside"}${
                isSelected ? " daily-pnl-calendar__day--selected" : ""
              }`}
              title={dayTitle(cell.date, cell.stats, currency)}
              disabled={!cell.date}
              onClick={() => setSelectedDate(cell.date)}
              role="gridcell"
            >
              {cell.date && (
                <>
                  <span className="daily-pnl-calendar__day-number">
                    {cell.dayNumber}
                  </span>
                  {cell.stats ? (
                    <span className="daily-pnl-calendar__day-body">
                      <strong>
                        {formatCompact(cell.stats.netPnl)} {currency}
                      </strong>
                      <span>
                        Trades: {cell.stats.trades}
                      </span>
                    </span>
                  ) : (
                    <span className="daily-pnl-calendar__day-empty-label">-</span>
                  )}
                </>
              )}
            </button>
          );
        }),
      ),
    [currency, maxAbs, selectedDate, weeks],
  );

  if (isEmpty || months.length === 0 || monthKeys.length === 0) {
    return (
      <div className="daily-pnl-calendar daily-pnl-calendar--empty">
        <span className="chart-empty-state__icon">
          <CalendarDays size={20} aria-hidden />
        </span>
        <span>Aucun trade fermé à afficher.</span>
      </div>
    );
  }

  function goToMonth(offset: number) {
    const next = monthKeys[selectedIndex + offset];
    if (!next) return;
    setHasUserSelectedMonth(true);
    setSelectedMonth(next);
    setSelectedDate(null);
  }

  return (
    <div className="daily-pnl-calendar">
      <div className="daily-pnl-calendar__toolbar">
        <button
          type="button"
          className="daily-pnl-calendar__nav"
          onClick={() => goToMonth(-1)}
          disabled={selectedIndex <= 0}
          title="Mois précédent"
          aria-label="Mois précédent"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>

        <select
          className="daily-pnl-calendar__select"
          value={activeMonth}
          onChange={(event) => {
            setHasUserSelectedMonth(true);
            setSelectedMonth(event.target.value);
            setSelectedDate(null);
          }}
          aria-label="Mois affiche"
        >
          {monthKeys.map((month) => (
            <option key={month} value={month}>
              {formatMonthLabel(month)}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="daily-pnl-calendar__nav"
          onClick={() => goToMonth(1)}
          disabled={selectedIndex >= monthKeys.length - 1}
          title="Mois suivant"
          aria-label="Mois suivant"
        >
          <ChevronRight size={16} aria-hidden />
        </button>

        <div className="daily-pnl-calendar__month-stats">
          <span>{selectedSummary?.trades ?? 0} trades</span>
          <strong
            className={
              (selectedSummary?.netPnl ?? 0) >= 0
                ? "daily-pnl-calendar__pnl--positive"
                : "daily-pnl-calendar__pnl--negative"
            }
          >
            {formatMoney(selectedSummary?.netPnl ?? 0, currency, true)}
          </strong>
        </div>
      </div>

      {selectedSummary ? (
        <MonthlyPerformanceSummary summary={selectedSummary} />
      ) : (
        <div className="daily-pnl-calendar__month-empty">
          Aucun trade fermé ce mois-ci.
        </div>
      )}

      <div className="daily-pnl-calendar__grid" role="grid">
        {DAY_HEADERS.map((day) => (
          <div key={day} className="daily-pnl-calendar__weekday">
            {day}
          </div>
        ))}

        {dayButtons}
      </div>

      <DayTradesDialog
        selectedDate={selectedDate}
        day={selectedDay}
        currency={currency}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}
