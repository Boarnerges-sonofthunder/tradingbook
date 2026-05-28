import { useEffect, useMemo, useRef, useState } from "react";
import { CandlestickChart } from "lucide-react";
import { formatDateTimeForSettings } from "../../../services/settings/settingsFormatService";
import { getTradeReplayChartModel } from "../../../services/charts/marketDataService";
import { fetchMT5Candles } from "../../../services/mt5/mt5CandlesService";
import { upsertMarketOhlcCandles } from "../../../repositories";
import type {
  ChartTimeframe,
  TradeReplayChartModel,
  TradeReplayFrame,
  UserSettings,
} from "../../../types";
import TradingViewChart from "./TradingViewChart";

interface TradeReplaySectionProps {
  selectedFrame: TradeReplayFrame | null;
  settings: UserSettings;
}

const TIMEFRAME_OPTIONS: ChartTimeframe[] = [
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D1",
];

function normalizeTimeframeCandidate(
  value: string | null | undefined,
): ChartTimeframe | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === "M1" ||
    normalized === "M5" ||
    normalized === "M15" ||
    normalized === "M30" ||
    normalized === "H1" ||
    normalized === "H4" ||
    normalized === "D1"
  ) {
    return normalized;
  }

  return null;
}

function inferTimeframe(frame: TradeReplayFrame | null): ChartTimeframe {
  if (!frame) {
    return "M5";
  }

  for (const screenshot of frame.screenshots) {
    const candidate = normalizeTimeframeCandidate(screenshot.timeframe);
    if (candidate) {
      return candidate;
    }
  }

  return "M5";
}

function formatMarkerTime(time: number, settings: UserSettings): string {
  return formatDateTimeForSettings(new Date(time * 1000), settings, "-");
}

/**
 * Section dediee au replay graphique d'un trade selectionne.
 * Keep it read-only: analyse uniquement, aucun ordre.
 */
export default function TradeReplaySection({
  selectedFrame,
  settings,
}: TradeReplaySectionProps) {
  const autoSyncAttemptKeyRef = useRef<string | null>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("M5");
  const [chartModel, setChartModel] = useState<TradeReplayChartModel | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [syncingCandles, setSyncingCandles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTimeframe(inferTimeframe(selectedFrame));
    autoSyncAttemptKeyRef.current = null;
  }, [selectedFrame]);

  useEffect(() => {
    if (!selectedFrame) {
      setChartModel(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void getTradeReplayChartModel(selectedFrame, {
      timeframe,
    })
      .then((model) => {
        if (!active) {
          return;
        }
        setChartModel(model);
      })
      .catch((err: unknown) => {
        if (!active) {
          return;
        }
        setChartModel(null);
        setError(
          err instanceof Error
            ? err.message
            : "Impossible de preparer le graphique TradingView.",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedFrame, timeframe]);

  const markerLegendItems = useMemo(() => {
    if (!chartModel) {
      return [];
    }
    return chartModel.markers.map((marker) => ({
      id: marker.id,
      text: marker.text ?? marker.kind,
      color: marker.color,
      timeText: formatMarkerTime(marker.time as number, settings),
    }));
  }, [chartModel, settings]);

  async function handleSyncCandles(): Promise<void> {
    if (!selectedFrame) {
      return;
    }

    if (selectedFrame.platform !== "mt5") {
      setError(
        "Sync candles direct disponible uniquement pour plateforme MT5.",
      );
      return;
    }

    setSyncingCandles(true);
    setError(null);

    try {
      // Fenêtre replay calculée par service chart existant.
      const previewModel = await getTradeReplayChartModel(selectedFrame, {
        timeframe,
      });

      const candlesResult = await fetchMT5Candles({
        symbol: selectedFrame.symbol,
        timeframe,
        fromIso: previewModel.replayWindow.from,
        toIso: previewModel.replayWindow.to,
        maxBars: 3000,
      });

      if (!candlesResult.success) {
        throw new Error(candlesResult.message);
      }

      if (candlesResult.candles.length === 0) {
        throw new Error("Aucune bougie MT5 retournée sur fenêtre demandée.");
      }

      await upsertMarketOhlcCandles(
        candlesResult.candles.map((candle) => ({
          platform: "mt5",
          broker: selectedFrame.broker,
          accountId: selectedFrame.accountId,
          symbol: selectedFrame.symbol,
          timeframe,
          candleTime: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          sourceLabel: `mt5_manual_sync:${timeframe}`,
        })),
      );

      const reloadedModel = await getTradeReplayChartModel(selectedFrame, {
        timeframe,
      });
      setChartModel(reloadedModel);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de synchroniser candles MT5.",
      );
    } finally {
      setSyncingCandles(false);
    }
  }

  useEffect(() => {
    if (!selectedFrame || loading || syncingCandles || !chartModel) {
      return;
    }

    if (selectedFrame.platform !== "mt5") {
      return;
    }

    if (chartModel.hasMarketData) {
      return;
    }

    const key = `${selectedFrame.tradeId}:${timeframe}`;
    if (autoSyncAttemptKeyRef.current === key) {
      return;
    }

    autoSyncAttemptKeyRef.current = key;
    void handleSyncCandles();
  }, [chartModel, loading, selectedFrame, syncingCandles, timeframe]);

  return (
    <section className="card trade-replay-section">
      <div className="trade-detail-heading" style={{ marginBottom: 8 }}>
        <CandlestickChart size={18} aria-hidden />
        <h3 className="trade-detail-section-title" style={{ margin: 0 }}>
          TradeReplay
        </h3>
        <div className="trade-replay-controls">
          <label
            className="trade-replay-control-label"
            htmlFor="trade-replay-timeframe"
          >
            Timeframe
          </label>
          <select
            id="trade-replay-timeframe"
            className="trade-replay-timeframe-select"
            value={timeframe}
            onChange={(event) =>
              setTimeframe(event.target.value as ChartTimeframe)
            }
          >
            {TIMEFRAME_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedFrame ? (
        <p className="td-muted">
          Selectionnez un trade pour charger le replay chart.
        </p>
      ) : loading ? (
        <p className="td-muted">Chargement du graphique TradingView...</p>
      ) : error ? (
        <div className="form-errors-banner" style={{ marginBottom: 0 }}>
          {error}
        </div>
      ) : (
        <>
          <div className="trade-replay-meta">
            <span>
              Source locale: <strong>{chartModel?.source ?? "none"}</strong>
            </span>
            <span>
              Timeframe: <strong>{chartModel?.timeframe ?? "-"}</strong>
            </span>
            <span>
              Marqueurs: <strong>{chartModel?.markers.length ?? 0}</strong>
            </span>
            <span>
              Fenetre:{" "}
              <strong>
                {formatDateTimeForSettings(
                  chartModel?.replayWindow.from ?? null,
                  settings,
                  "-",
                )}
              </strong>
              {" -> "}
              <strong>
                {formatDateTimeForSettings(
                  chartModel?.replayWindow.to ?? null,
                  settings,
                  "-",
                )}
              </strong>
            </span>
            <span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void handleSyncCandles()}
                disabled={
                  syncingCandles ||
                  !selectedFrame ||
                  selectedFrame.platform !== "mt5"
                }
                title={
                  selectedFrame?.platform === "mt5"
                    ? "Synchroniser les candles MT5 dans la base locale"
                    : "Sync candles direct disponible uniquement pour les trades MT5"
                }
              >
                {syncingCandles ? "Sync candles..." : "Sync candles MT5"}
              </button>
            </span>
          </div>

          <TradingViewChart model={chartModel} height={420} />

          {markerLegendItems.length > 0 && (
            <div className="trade-replay-markers">
              {markerLegendItems.map((item) => (
                <div key={item.id} className="trade-replay-marker-item">
                  <span
                    className="trade-replay-marker-dot"
                    style={{ backgroundColor: item.color }}
                    aria-hidden
                  />
                  <span className="trade-replay-marker-text">{item.text}</span>
                  <span className="trade-replay-marker-time">
                    {item.timeText}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
