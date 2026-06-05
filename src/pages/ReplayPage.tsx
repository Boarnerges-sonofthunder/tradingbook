// ============================================================
// Page - Replay trades
// ============================================================
// Selection via calendrier compact : badges colores par jour,
// popover si plusieurs trades dans une meme journee.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Film, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useUserSettings } from "../hooks";
import {
  formatDateTimeForSettings,
  formatMoneyForSettings,
} from "../services/settings/settingsFormatService";
import { tr } from "../utils/i18n";
import { getTradeReplayDataset } from "../services/replay/tradeReplayService";
import TradeReplaySection from "../features/replay/components/TradeReplaySection";
import type { TradeReplayDataset, TradeReplayFrame } from "../types";

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(5);
}

function formatDate(
  value: string | null,
  settings: ReturnType<typeof useUserSettings>,
): string {
  return formatDateTimeForSettings(value, settings, "—");
}

function formatPnl(
  value: number | null,
  currency: string,
  settings: ReturnType<typeof useUserSettings>,
): string {
  if (value === null) return "—";
  const formatted = formatMoneyForSettings(value, settings, { fallback: "—", currency });
  return value > 0 ? `+${formatted}` : formatted;
}

// ============================================================
// Calendrier compact de selection de trades
// 1 trade/jour -> selection directe.
// N trades/jour -> popover liste inline.
// ============================================================

const MONTHS_FR = ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_HEADERS_FR = ["Lu","Ma","Me","Je","Ve","Sa","Di"];
const DAY_HEADERS_EN = ["Mo","Tu","We","Th","Fr","Sa","Su"];

function frameToDateKey(frame: TradeReplayFrame): string | null {
  const raw = frame.closedAt ?? frame.openedAt;
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function ReplayCalendar({
  frames,
  selectedTradeId,
  onSelect,
  settings,
}: {
  frames: TradeReplayFrame[];
  selectedTradeId: number | null;
  onSelect: (tradeId: number) => void;
  settings: ReturnType<typeof useUserSettings>;
}) {
  const today = new Date();

  const latestDate = useMemo(() => {
    const sorted = [...frames].sort((a, b) =>
      new Date(b.closedAt ?? b.openedAt ?? "").getTime() -
      new Date(a.closedAt ?? a.openedAt ?? "").getTime()
    );
    if (!sorted[0]) return null;
    const d = new Date(sorted[0].closedAt ?? sorted[0].openedAt ?? "");
    return isNaN(d.getTime()) ? null : d;
  }, [frames]);

  const [year,  setYear]      = useState<number>(() => latestDate?.getFullYear() ?? today.getFullYear());
  const [month, setMonth]     = useState<number>(() => latestDate?.getMonth()    ?? today.getMonth());
  const [popoverDay, setPopoverDay] = useState<string | null>(null);

  // Index frames par jour
  const framesByDay = useMemo(() => {
    const map = new Map<string, TradeReplayFrame[]>();
    for (const frame of frames) {
      const key = frameToDateKey(frame);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(frame);
    }
    return map;
  }, [frames]);

  // Grille 7 colonnes, semaine commence lundi
  const cells = useMemo(() => {
    const firstDay   = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (firstDay + 6) % 7;
    const grid: Array<{dayNum: number|null; key: string|null}> = [];
    for (let i = 0; i < offset; i++) grid.push({dayNum: null, key: null});
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push({
        dayNum: d,
        key: `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,
      });
    }
    while (grid.length % 7 !== 0) grid.push({dayNum: null, key: null});
    return grid;
  }, [year, month]);

  function prevMonth() {
    setPopoverDay(null);
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    setPopoverDay(null);
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const lang = settings.language;
  const monthLabel = lang === "fr" ? MONTHS_FR[month] : MONTHS_EN[month];
  const dayHeaders = lang === "fr" ? DAY_HEADERS_FR : DAY_HEADERS_EN;

  return (
    <div className="replay-calendar">
      {/* Navigation mois */}
      <div className="replay-calendar__nav">
        <button type="button" className="replay-calendar__nav-btn" onClick={prevMonth}
          aria-label={tr(lang, "Mois precedent", "Previous month")}>
          <ChevronLeft size={14} />
        </button>
        <span className="replay-calendar__month-label">{monthLabel} {year}</span>
        <button type="button" className="replay-calendar__nav-btn" onClick={nextMonth}
          aria-label={tr(lang, "Mois suivant", "Next month")}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Grille jours */}
      <div className="replay-calendar__grid">
        {dayHeaders.map(h => (
          <div key={h} className="replay-calendar__day-header">{h}</div>
        ))}

        {cells.map((cell, i) => {
          if (!cell.key || cell.dayNum === null) {
            return <div key={`e-${i}`} className="replay-calendar__cell replay-calendar__cell--empty" />;
          }

          const dayFrames      = framesByDay.get(cell.key) ?? [];
          const hasTradesHere  = dayFrames.length > 0;
          const hasPnlPositive = dayFrames.some(f => (f.netPnl ?? 0) > 0);
          const hasPnlNegative = dayFrames.some(f => (f.netPnl ?? 0) < 0);
          const isSelectedDay  = dayFrames.some(f => f.tradeId === selectedTradeId);
          const isPopoverOpen  = popoverDay === cell.key;

          let dotClass = "";
          if (hasTradesHere) {
            if      (hasPnlPositive && !hasPnlNegative) dotClass = "replay-calendar__dot--positive";
            else if (!hasPnlPositive && hasPnlNegative) dotClass = "replay-calendar__dot--negative";
            else                                         dotClass = "replay-calendar__dot--mixed";
          }

          return (
            <div key={cell.key} className="replay-calendar__cell-wrapper">
              <button
                type="button"
                disabled={!hasTradesHere}
                className={[
                  "replay-calendar__cell",
                  hasTradesHere ? "replay-calendar__cell--has-trades" : "",
                  isSelectedDay ? "replay-calendar__cell--selected"   : "",
                  isPopoverOpen ? "replay-calendar__cell--active"     : "",
                ].filter(Boolean).join(" ")}
                onClick={() => {
                  if (!hasTradesHere) return;
                  if (dayFrames.length === 1) { onSelect(dayFrames[0].tradeId); setPopoverDay(null); }
                  else setPopoverDay(isPopoverOpen ? null : cell.key);
                }}
              >
                <span className="replay-calendar__day-num">{cell.dayNum}</span>
                {hasTradesHere && (
                  <span className={`replay-calendar__dot ${dotClass}`}>
                    {dayFrames.length > 1 ? dayFrames.length : ""}
                  </span>
                )}
              </button>

              {/* Popover multi-trades */}
              {isPopoverOpen && (
                <div className="replay-calendar__popover">
                  <p className="replay-calendar__popover-title">
                    {dayFrames.length} {tr(lang, "trades ce jour", "trades this day")}
                  </p>
                  {dayFrames.map(frame => {
                    const pnl    = frame.netPnl ?? 0;
                    const pnlStr = `${pnl > 0 ? "+" : ""}${pnl.toFixed(2)} ${frame.currency}`;
                    const pnlCls = pnl > 0 ? "text-positive" : pnl < 0 ? "text-negative" : "text-muted";
                    return (
                      <button
                        key={frame.tradeId}
                        type="button"
                        className={[
                          "replay-calendar__popover-item",
                          frame.tradeId === selectedTradeId ? "replay-calendar__popover-item--selected" : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => { onSelect(frame.tradeId); setPopoverDay(null); }}
                      >
                        <span className="replay-calendar__popover-symbol">{frame.symbol}</span>
                        <span className="replay-calendar__popover-side">{frame.side.toUpperCase()}</span>
                        <span className={pnlCls}>{pnlStr}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Ligne label/valeur dans le panneau detail
// ============================================================

function ReplayDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="trade-detail-row">
      <span className="trade-detail-label">{label}</span>
      <span className="trade-detail-value">{value}</span>
    </div>
  );
}

// ============================================================
// Page principale
// ============================================================

export default function ReplayPage() {
  const settings = useUserSettings();
  const [dataset, setDataset]             = useState<TradeReplayDataset | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error,   setError]               = useState<string | null>(null);

  const loadReplayDataset = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextDataset = await getTradeReplayDataset({
        includeOpenTrades: false,
        maxTrades: 300,
      });

      setDataset(nextDataset);
      setSelectedTradeId(current => {
        if (current !== null) {
          const stillExists = nextDataset.frames.some(f => f.tradeId === current);
          if (stillExists) return current;
        }
        return nextDataset.frames[0]?.tradeId ?? null;
      });
    } catch (err) {
      setDataset(null);
      setSelectedTradeId(null);
      setError(
        err instanceof Error
          ? err.message
          : tr(settings.language,
              "Impossible de charger les trades pour le replay.",
              "Unable to load trades for replay."),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReplayDataset(); }, [loadReplayDataset]);

  const selectedFrame = useMemo(() => {
    if (!dataset || selectedTradeId === null) return null;
    return dataset.frames.find(f => f.tradeId === selectedTradeId) ?? null;
  }, [dataset, selectedTradeId]);

  const handleSelectTrade = useCallback((tradeId: number) => {
    setSelectedTradeId(tradeId);
  }, []);

  return (
    <div className="content-max">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Replay trades</h1>
          <p className="page-subtitle">
            {tr(
              settings.language,
              "Relecture visuelle des trades passes en mode analyse locale uniquement. Aucun trading live, aucun ordre.",
              "Visual replay of past trades in local analysis mode only. No live trading, no orders.",
            )}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn-secondary btn-icon-text"
            onClick={() => void loadReplayDataset()} disabled={loading}>
            <RefreshCw size={14} aria-hidden />
            {tr(settings.language, "Rafraichir", "Refresh")}
          </button>
        </div>
      </div>

      {error && <div className="form-errors-banner">{error}</div>}

      {loading ? (
        <p className="page-loading">
          {tr(settings.language, "Chargement du replay des trades…", "Loading trade replay...")}
        </p>
      ) : !dataset || dataset.frames.length === 0 ? (
        <div className="trades-empty">
          <p className="trades-empty__title">
            {tr(settings.language, "Aucun trade replayable", "No replayable trade")}
          </p>
          <p className="trades-empty__hint">
            {tr(
              settings.language,
              "Le replay affiche trades passes fermes ou annules. Ajoutez des trades historiques puis rechargez.",
              "Replay shows past closed or canceled trades. Add historical trades then reload.",
            )}
          </p>
        </div>
      ) : (
        <div className="replay-layout">
          {/* Panneau gauche : calendrier compact */}
          <section className="card replay-layout__calendar">
            <h2 className="trade-detail-section-title">
              {tr(settings.language, "Selection trade", "Select trade")}
            </h2>
            <p className="td-muted" style={{ marginTop: 0, marginBottom: 8 }}>
              {dataset.frames.length} / {dataset.totalTrades}{" "}
              {tr(settings.language, "trades charges.", "loaded trades.")}
            </p>
            <ReplayCalendar
              frames={dataset.frames}
              selectedTradeId={selectedTradeId}
              onSelect={handleSelectTrade}
              settings={settings}
            />
          </section>

          {/* Panneau droit : detail + replay */}
          <section className="card trade-detail-section">
            <div className="trade-detail-heading" style={{ marginBottom: 16 }}>
              <Film size={18} aria-hidden />
              <h2 className="trade-detail-section-title" style={{ margin: 0 }}>
                {tr(settings.language, "Details replay", "Replay details")}
              </h2>
            </div>

            {selectedFrame === null ? (
              <p className="td-muted">
                {tr(
                  settings.language,
                  "Selectionnez un trade dans le calendrier pour afficher le replay.",
                  "Select a trade in the calendar to display the replay.",
                )}
              </p>
            ) : (
              <>
                <ReplayDetailRow label="Symbole" value={selectedFrame.symbol} />
                <ReplayDetailRow label="Entree"  value={formatPrice(selectedFrame.entryPrice)} />
                <ReplayDetailRow label="Sortie"  value={formatPrice(selectedFrame.exitPrice)} />
                <ReplayDetailRow label="SL"      value={formatPrice(selectedFrame.stopLoss)} />
                <ReplayDetailRow label="TP"      value={formatPrice(selectedFrame.takeProfit)} />
                <ReplayDetailRow label="Ouvert le" value={formatDate(selectedFrame.openedAt, settings)} />
                <ReplayDetailRow label="Ferme le"  value={formatDate(selectedFrame.closedAt,  settings)} />
                <ReplayDetailRow label="PnL net"   value={formatPnl(selectedFrame.netPnl, selectedFrame.currency, settings)} />

                <div style={{ marginTop: 18 }}>
                  <h3 className="trade-detail-section-title" style={{ marginBottom: 8 }}>
                    Screenshots associes ({selectedFrame.screenshots.length})
                  </h3>
                  {selectedFrame.screenshots.length === 0 ? (
                    <p className="td-muted">Aucune capture liee a ce trade.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {selectedFrame.screenshots.map(screenshot => (
                        <div key={screenshot.id} className="trade-detail-row">
                          <span className="trade-detail-label">
                            <ImageIcon size={12} aria-hidden />
                            {screenshot.label ?? screenshot.fileName}
                          </span>
                          <span className="trade-detail-value">
                            {screenshot.timeframe ?? "—"} · {formatDate(screenshot.createdAt, settings)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 18 }}>
                  <TradeReplaySection selectedFrame={selectedFrame} settings={settings} />
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
