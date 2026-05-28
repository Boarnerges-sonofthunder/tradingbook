import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Film, Image as ImageIcon } from "lucide-react";
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
  if (value === null) {
    return "—";
  }
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
  if (value === null) {
    return "—";
  }

  const formatted = formatMoneyForSettings(value, settings, {
    fallback: "—",
    currency,
  });

  if (value > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

function ReplayTradeListItem({
  frame,
  selected,
  onSelect,
  settings,
}: {
  frame: TradeReplayFrame;
  selected: boolean;
  onSelect: (tradeId: number) => void;
  settings: ReturnType<typeof useUserSettings>;
}) {
  return (
    <button
      type="button"
      className={`trade-card trade-card--compact ${selected ? "trade-card--selected" : ""}`}
      onClick={() => onSelect(frame.tradeId)}
      aria-pressed={selected}
    >
      <div className="trade-card__top">
        <span className="trade-card__symbol">{frame.symbol}</span>
        <span className="badge badge-neutral">#{frame.tradeId}</span>
      </div>
      <div className="trade-card__meta">
        <span>{formatDate(frame.openedAt, settings)}</span>
        <span>{frame.side.toUpperCase()}</span>
      </div>
      <div className="trade-card__meta">
        <span>{frame.platform.toUpperCase()}</span>
        <span>{formatPnl(frame.netPnl, frame.currency, settings)}</span>
      </div>
    </button>
  );
}

function ReplayDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="trade-detail-row">
      <span className="trade-detail-label">{label}</span>
      <span className="trade-detail-value">{value}</span>
    </div>
  );
}

export default function ReplayPage() {
  const settings = useUserSettings();
  const [dataset, setDataset] = useState<TradeReplayDataset | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReplayDataset = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextDataset = await getTradeReplayDataset({
        includeOpenTrades: false,
        maxTrades: 300,
      });

      setDataset(nextDataset);
      setSelectedTradeId((current) => {
        if (current !== null) {
          const stillExists = nextDataset.frames.some(
            (frame) => frame.tradeId === current,
          );
          if (stillExists) {
            return current;
          }
        }

        return nextDataset.frames[0]?.tradeId ?? null;
      });
    } catch (err) {
      setDataset(null);
      setSelectedTradeId(null);
      setError(
        err instanceof Error
          ? err.message
          : tr(
              settings.language,
              "Impossible de charger les trades pour le replay.",
              "Unable to load trades for replay.",
            ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReplayDataset();
  }, [loadReplayDataset]);

  const selectedFrame = useMemo(() => {
    if (!dataset || selectedTradeId === null) {
      return null;
    }
    return (
      dataset.frames.find((frame) => frame.tradeId === selectedTradeId) ?? null
    );
  }, [dataset, selectedTradeId]);

  return (
    <div className="content-max">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Replay trades</h1>
          <p className="page-subtitle">
            {tr(
              settings.language,
              "Relecture visuelle des trades passés en mode analyse locale uniquement. Aucun trading live, aucun ordre.",
              "Visual replay of past trades in local analysis mode only. No live trading, no orders.",
            )}
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn-secondary btn-icon-text"
            onClick={() => void loadReplayDataset()}
            disabled={loading}
          >
            <RefreshCw size={14} aria-hidden />
            {tr(settings.language, "Rafraîchir", "Refresh")}
          </button>
        </div>
      </div>

      {error && <div className="form-errors-banner">{error}</div>}

      {loading ? (
        <p className="page-loading">
          {tr(
            settings.language,
            "Chargement du replay des trades…",
            "Loading trade replay...",
          )}
        </p>
      ) : !dataset || dataset.frames.length === 0 ? (
        <div className="trades-empty">
          <p className="trades-empty__title">
            {tr(
              settings.language,
              "Aucun trade replayable",
              "No replayable trade",
            )}
          </p>
          <p className="trades-empty__hint">
            {tr(
              settings.language,
              "Le replay affiche trades passés fermés ou annulés. Ajoutez des trades historiques puis rechargez.",
              "Replay shows past closed or canceled trades. Add historical trades then reload.",
            )}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 360px) 1fr",
            gap: "1rem",
            alignItems: "start",
          }}
        >
          <section className="card">
            <h2 className="trade-detail-section-title">Sélection trade</h2>
            <p className="td-muted" style={{ marginTop: 0 }}>
              {dataset.frames.length} / {dataset.totalTrades}{" "}
              {tr(settings.language, "trades chargés.", "loaded trades.")}
            </p>

            <div style={{ display: "grid", gap: 8 }}>
              {dataset.frames.map((frame) => (
                <ReplayTradeListItem
                  key={frame.tradeId}
                  frame={frame}
                  selected={frame.tradeId === selectedTradeId}
                  onSelect={setSelectedTradeId}
                  settings={settings}
                />
              ))}
            </div>
          </section>

          <section className="card trade-detail-section">
            <div className="trade-detail-heading" style={{ marginBottom: 16 }}>
              <Film size={18} aria-hidden />
              <h2 className="trade-detail-section-title" style={{ margin: 0 }}>
                {tr(settings.language, "Détails replay", "Replay details")}
              </h2>
            </div>

            {selectedFrame === null ? (
              <p className="td-muted">
                {tr(
                  settings.language,
                  "Sélectionnez un trade pour afficher replay.",
                  "Select a trade to display replay.",
                )}
              </p>
            ) : (
              <>
                <ReplayDetailRow label="Symbole" value={selectedFrame.symbol} />
                <ReplayDetailRow
                  label="Entrée"
                  value={formatPrice(selectedFrame.entryPrice)}
                />
                <ReplayDetailRow
                  label="Sortie"
                  value={formatPrice(selectedFrame.exitPrice)}
                />
                <ReplayDetailRow
                  label="SL"
                  value={formatPrice(selectedFrame.stopLoss)}
                />
                <ReplayDetailRow
                  label="TP"
                  value={formatPrice(selectedFrame.takeProfit)}
                />
                <ReplayDetailRow
                  label="Ouvert le"
                  value={formatDate(selectedFrame.openedAt, settings)}
                />
                <ReplayDetailRow
                  label="Fermé le"
                  value={formatDate(selectedFrame.closedAt, settings)}
                />
                <ReplayDetailRow
                  label="PnL net"
                  value={formatPnl(
                    selectedFrame.netPnl,
                    selectedFrame.currency,
                    settings,
                  )}
                />

                <div style={{ marginTop: 18 }}>
                  <h3
                    className="trade-detail-section-title"
                    style={{ marginBottom: 8 }}
                  >
                    Screenshots associés ({selectedFrame.screenshots.length})
                  </h3>
                  {selectedFrame.screenshots.length === 0 ? (
                    <p className="td-muted">Aucune capture liée à ce trade.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {selectedFrame.screenshots.map((screenshot) => (
                        <div key={screenshot.id} className="trade-detail-row">
                          <span className="trade-detail-label">
                            <ImageIcon size={12} aria-hidden />
                            {screenshot.label ?? screenshot.fileName}
                          </span>
                          <span className="trade-detail-value">
                            {screenshot.timeframe ?? "—"} ·{" "}
                            {formatDate(screenshot.createdAt, settings)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 18 }}>
                  <TradeReplaySection
                    selectedFrame={selectedFrame}
                    settings={settings}
                  />
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
