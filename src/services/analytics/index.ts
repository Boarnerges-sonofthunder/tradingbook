// ============================================================
// Service — Analytics
// ============================================================
// Point d'entrée unique pour tous les services analytics.
// Les composants React importent depuis ce module.
// Le cache reste ici pour éviter les relectures/recalculs répétés
// sans déplacer la logique métier hors des services spécialisés.
// ============================================================

import { withAnalyticsCache, withDashboardCache } from "../cache/domainCache";
import { getDashboardStats as loadDashboardStats } from "./dashboardAnalyticsService";
import { getPnLStats as loadPnLStats } from "./pnlAnalyticsService";
import { getWinRateStats as loadWinRateStats } from "./winRateAnalyticsService";
import { getRiskRewardStats as loadRiskRewardStats } from "./riskRewardAnalyticsService";
import { getDrawdownStats as loadDrawdownStats } from "./drawdownAnalyticsService";
import { getEquityCurveStats as loadEquityCurveStats } from "./equityCurveAnalyticsService";
import { getProfitFactorStats as loadProfitFactorStats } from "./profitFactorAnalyticsService";
import { getAvgWinLossStats as loadAvgWinLossStats } from "./averageWinLossAnalyticsService";
import { getSymbolStats as loadSymbolStats } from "./symbolAnalyticsService";
import { getStrategyStats as loadStrategyStats } from "./strategyAnalyticsService";
import { getSessionStats as loadSessionStats } from "./sessionAnalyticsService";
import { getEmotionStats as loadEmotionStats } from "./emotionAnalyticsService";
import { getHabitDetectionStats as loadHabitDetectionStats } from "./habitDetectionService";
import { getHeatmapStats as loadHeatmapStats } from "./heatmapAnalyticsService";
import { getPerformanceCalendarStats as loadPerformanceCalendarStats } from "./performanceCalendarAnalyticsService";
import { getPerformanceChartStats as loadPerformanceChartStats } from "./performanceChartAnalyticsService";
import { getProfitLossDistributionStats as loadProfitLossDistributionStats } from "./profitLossDistributionAnalyticsService";
import { getBrokerStats as loadBrokerStats } from "./brokerAnalyticsService";
import type { TradeFilters } from "../../repositories/tradesRepository";

export function getDashboardStats(
  filters: Omit<TradeFilters, "status"> = {},
) {
  return withDashboardCache("getDashboardStats", [filters], () =>
    loadDashboardStats(filters),
  );
}

export function getPnLStats(filters?: Omit<TradeFilters, "status">) {
  return withAnalyticsCache("getPnLStats", [filters ?? null], () =>
    loadPnLStats(filters),
  );
}

export function getWinRateStats(filters?: Omit<TradeFilters, "status">) {
  return withAnalyticsCache("getWinRateStats", [filters ?? null], () =>
    loadWinRateStats(filters),
  );
}

export function getRiskRewardStats(filters?: Omit<TradeFilters, "status">) {
  return withAnalyticsCache("getRiskRewardStats", [filters ?? null], () =>
    loadRiskRewardStats(filters),
  );
}

export function getDrawdownStats(filters?: Omit<TradeFilters, "status">) {
  return withAnalyticsCache("getDrawdownStats", [filters ?? null], () =>
    loadDrawdownStats(filters),
  );
}

export function getEquityCurveStats(filters?: Omit<TradeFilters, "status">) {
  return withAnalyticsCache("getEquityCurveStats", [filters ?? null], () =>
    loadEquityCurveStats(filters),
  );
}

export function getProfitFactorStats(filters?: Omit<TradeFilters, "status">) {
  return withAnalyticsCache("getProfitFactorStats", [filters ?? null], () =>
    loadProfitFactorStats(filters),
  );
}

export function getAvgWinLossStats(filters?: Omit<TradeFilters, "status">) {
  return withAnalyticsCache("getAvgWinLossStats", [filters ?? null], () =>
    loadAvgWinLossStats(filters),
  );
}

export function getSymbolStats(filters?: Omit<TradeFilters, "status">) {
  return withAnalyticsCache("getSymbolStats", [filters ?? null], () =>
    loadSymbolStats(filters),
  );
}

export function getStrategyStats(filters?: TradeFilters) {
  return withAnalyticsCache("getStrategyStats", [filters ?? null], () =>
    loadStrategyStats(filters),
  );
}

export function getSessionStats(filters?: TradeFilters) {
  return withAnalyticsCache("getSessionStats", [filters ?? null], () =>
    loadSessionStats(filters),
  );
}

export function getEmotionStats(filters?: TradeFilters) {
  return withAnalyticsCache("getEmotionStats", [filters ?? null], () =>
    loadEmotionStats(filters),
  );
}

export function getHabitDetectionStats(filters?: TradeFilters) {
  return withAnalyticsCache("getHabitDetectionStats", [filters ?? null], () =>
    loadHabitDetectionStats(filters),
  );
}

export function getHeatmapStats(filters?: TradeFilters) {
  return withAnalyticsCache("getHeatmapStats", [filters ?? null], () =>
    loadHeatmapStats(filters),
  );
}

export function getPerformanceCalendarStats(filters?: TradeFilters) {
  return withAnalyticsCache(
    "getPerformanceCalendarStats",
    [filters ?? null],
    () => loadPerformanceCalendarStats(filters),
  );
}

export function getPerformanceChartStats(
  filters?: Omit<TradeFilters, "status">,
) {
  return withAnalyticsCache("getPerformanceChartStats", [filters ?? null], () =>
    loadPerformanceChartStats(filters),
  );
}

export function getProfitLossDistributionStats(
  filters?: Omit<TradeFilters, "status">,
) {
  return withAnalyticsCache(
    "getProfitLossDistributionStats",
    [filters ?? null],
    () => loadProfitLossDistributionStats(filters),
  );
}

export function getBrokerStats(filters?: Omit<TradeFilters, "status">) {
  return withAnalyticsCache("getBrokerStats", [filters ?? null], () =>
    loadBrokerStats(filters),
  );
}
