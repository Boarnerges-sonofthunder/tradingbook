import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
} from "lightweight-charts";
import { createTradingBookLightweightTheme } from "../../../components/charts/chartTheme";
import { DASHED_LINE_STYLE } from "../../../services/charts/marketDataService";
import type { TradeReplayChartModel } from "../../../types";

interface TradingViewChartProps {
  model: TradeReplayChartModel | null;
  height?: number;
}

/**
 * Rend chart TradingView en lecture seule.
 * Toute preparation des donnees (candles, markers, niveaux) vient du service.
 */
export default function TradingViewChart({
  model,
  height = 420,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !model || !model.hasMarketData) {
      return;
    }

    const container = containerRef.current;
    const width = Math.max(container.clientWidth, 320);

    const chart = createChart(container, {
      ...createTradingBookLightweightTheme(),
      width,
      height,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#4CAF50",
      downColor: "#F44336",
      borderDownColor: "#F44336",
      borderUpColor: "#4CAF50",
      wickDownColor: "#F44336",
      wickUpColor: "#4CAF50",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    candleSeries.setData(model.candles);

    const seriesMarkers = createSeriesMarkers(candleSeries, model.markers, {
      zOrder: "top",
      autoScale: true,
    });

    for (const level of model.priceLevels) {
      candleSeries.createPriceLine({
        id: level.id,
        title: level.label,
        price: level.price,
        color: level.color,
        lineWidth: 1,
        axisLabelVisible: true,
        lineVisible: true,
        lineStyle: level.dashed ? DASHED_LINE_STYLE : LineStyle.Solid,
      });
    }

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      chart.applyOptions({
        width: Math.max(entry.contentRect.width, 320),
        height,
      });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      seriesMarkers.detach();
      chart.remove();
    };
  }, [height, model]);

  const hasMarketData = model?.hasMarketData ?? false;

  return (
    <div className="tradingview-chart">
      <div
        ref={containerRef}
        className={`tradingview-chart__canvas ${!hasMarketData ? "tradingview-chart__canvas--hidden" : ""}`}
      />

      {!hasMarketData && (
        <div className="tradingview-chart__empty">
          <p className="tradingview-chart__empty-title">
            Aucune chandelle disponible
          </p>
          <p className="tradingview-chart__empty-text">
            {model?.emptyStateMessage ??
              "Selectionnez un trade pour charger le replay du graphique."}
          </p>
        </div>
      )}
    </div>
  );
}
