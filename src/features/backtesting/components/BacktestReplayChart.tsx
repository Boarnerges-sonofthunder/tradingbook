import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import { createTradingBookLightweightTheme } from "../../../components/charts/chartTheme";
import type { BacktestTrade, MarketDataCandle } from "../../../types";

interface BacktestReplayChartProps {
  candles: MarketDataCandle[];
  trades: BacktestTrade[];
}

function toUnix(value: string): UTCTimestamp {
  return Math.floor(new Date(value).getTime() / 1000) as UTCTimestamp;
}

export default function BacktestReplayChart({
  candles,
  trades,
}: BacktestReplayChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const chartCandles = useMemo<CandlestickData<UTCTimestamp>[]>(
    () =>
      candles.map((candle) => ({
        time: toUnix(candle.timestamp),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [candles],
  );

  const markers = useMemo<SeriesMarker<UTCTimestamp>[]>(() => {
    const data: SeriesMarker<UTCTimestamp>[] = [];

    for (const trade of trades) {
      data.push({
        time: toUnix(trade.openedAt),
        position: "belowBar",
        shape: "arrowUp",
        color: trade.side === "buy" ? "#19b16f" : "#d14f4f",
        text: `IN ${trade.side.toUpperCase()}`,
      });

      data.push({
        time: toUnix(trade.closedAt),
        position: "aboveBar",
        shape: "arrowDown",
        color: trade.netPnl >= 0 ? "#19b16f" : "#d14f4f",
        text: `OUT ${trade.exitReason}`,
      });
    }

    return data;
  }, [trades]);

  useEffect(() => {
    if (!containerRef.current || chartCandles.length === 0) {
      return;
    }

    const chart = createChart(containerRef.current, {
      ...createTradingBookLightweightTheme(),
      width: Math.max(containerRef.current.clientWidth, 320),
      height: 360,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#19b16f",
      downColor: "#d14f4f",
      wickUpColor: "#19b16f",
      wickDownColor: "#d14f4f",
      borderUpColor: "#19b16f",
      borderDownColor: "#d14f4f",
      priceLineVisible: false,
    });

    series.setData(chartCandles);
    const markerLayer = createSeriesMarkers(series, markers, {
      autoScale: true,
      zOrder: "top",
    });

    for (const trade of trades) {
      series.createPriceLine({
        id: `sl-${trade.id}`,
        price: trade.stopLoss,
        title: "SL",
        color: "#d14f4f",
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
      });

      series.createPriceLine({
        id: `tp-${trade.id}`,
        price: trade.takeProfit,
        title: "TP",
        color: "#19b16f",
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
      });
    }

    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      chart.applyOptions({
        width: Math.max(entry.contentRect.width, 320),
      });
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      markerLayer.detach();
      chart.remove();
    };
  }, [chartCandles, markers, trades]);

  return (
    <section className="card backtest-card">
      <h2 className="backtest-card__title">Replay visuel</h2>

      {chartCandles.length === 0 ? (
        <p className="text-muted">
          Importez donnees historiques puis lancez run pour afficher replay.
        </p>
      ) : (
        <div ref={containerRef} className="backtest-replay-chart" />
      )}
    </section>
  );
}
