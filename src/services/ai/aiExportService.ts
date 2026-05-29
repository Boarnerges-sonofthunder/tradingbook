import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  getDrawdownStats,
  getEmotionStats,
  getHabitDetectionStats,
  getPnLStats,
  getProfitFactorStats,
  getRiskRewardStats,
  getSessionStats,
  getStrategyStats,
  getSymbolStats,
  getWinRateStats,
} from "../analytics";
import { getMistakes } from "../mistakes/mistakesService";
import {
  findRecentNotesWithTradeContext,
} from "../../repositories/notesRepository";
import {
  findRecentTradeMistakes,
} from "../../repositories/mistakesRepository";
import type { AIAnalyticsExport } from "../../types/ai";
import {
  AI_RETENTION_DAYS,
  AI_SANDBOX_LIMITATIONS,
  ensureAISandboxFolders,
  getAIExportFilePath,
  pruneAIFiles,
} from "./aiSandboxService";

interface AIExportResult {
  data: AIAnalyticsExport;
  latestPath: string;
  versionedPath: string;
}

function buildVersionedFilename(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `analytics-${yyyy}${mm}${dd}-${hh}${min}${sec}.json`;
}

export async function exportAnalyticsForAI(): Promise<AIExportResult> {
  await ensureAISandboxFolders();
  await pruneAIFiles(AI_RETENTION_DAYS);

  const [
    pnl,
    drawdown,
    winRate,
    riskReward,
    profitFactor,
    habit,
    emotion,
    strategy,
    session,
    symbol,
    mistakes,
    tradeNotes,
    tradeMistakes,
  ] = await Promise.all([
    getPnLStats(),
    getDrawdownStats(),
    getWinRateStats(),
    getRiskRewardStats(),
    getProfitFactorStats(),
    getHabitDetectionStats(),
    getEmotionStats({ status: "closed" }),
    getStrategyStats({ status: "closed" }),
    getSessionStats({ status: "closed" }),
    getSymbolStats(),
    getMistakes(),
    findRecentNotesWithTradeContext(30),
    findRecentTradeMistakes(30),
  ]);

  const currency = pnl.stats?.currency ?? "USD";

  const data: AIAnalyticsExport = {
    generatedAt: new Date().toISOString(),
    analytics: {
      winRate: winRate.stats?.winRate ?? 0,
      profitFactor: profitFactor.stats?.profitFactor ?? null,
      drawdown: drawdown.stats?.maxDrawdownPct ?? 0,
      totalNetPnl: pnl.stats?.totalNetPnl ?? 0,
      totalTrades: pnl.stats?.totalTrades ?? 0,
      currency,
    },
    pnl: {
      totalNetPnl: pnl.stats?.totalNetPnl ?? 0,
      totalGrossPnl: pnl.stats?.totalGrossPnl ?? 0,
      totalFees: pnl.stats?.totalFees ?? 0,
      averagePnl: pnl.stats?.averagePnl ?? 0,
      bestTrade: pnl.stats?.bestTrade ?? 0,
      worstTrade: pnl.stats?.worstTrade ?? 0,
    },
    drawdown: {
      maxDrawdown: drawdown.stats?.maxDrawdown ?? 0,
      maxDrawdownPct: drawdown.stats?.maxDrawdownPct ?? 0,
      currentDrawdown: drawdown.stats?.currentDrawdown ?? 0,
      currentDrawdownPct: drawdown.stats?.currentDrawdownPct ?? 0,
      recoveryTrades: drawdown.stats?.recoveryTrades ?? null,
    },
    riskManagement: {
      avgRR: riskReward.stats?.avgRR ?? null,
      pctWithSL: riskReward.stats?.pctWithSL ?? 0,
      pctWithTP: riskReward.stats?.pctWithTP ?? 0,
      profitFactor: profitFactor.stats?.profitFactor ?? null,
    },
    habits: habit.observations.map((item) => item.summary),
    emotions: emotion.byEmotion
      .filter((item) => !item.isUnassigned)
      .slice(0, 8)
      .map((item) => item.emotionName),
    errors: mistakes.slice(0, 12).map((item) => item.name),
    tradeNotes,
    tradeMistakes,
    strategies: strategy.byStrategy.slice(0, 8).map((item) => ({
      strategyName: item.strategyName,
      totalTrades: item.totalTrades,
      winRate: item.winRate,
      netPnl: item.netPnlTotal,
    })),
    sessions: session.bySessions.map((item) => ({
      sessionName: item.sessionName,
      totalTrades: item.totalTrades,
      winRate: item.winRate,
      netPnl: item.netPnlTotal,
    })),
    symbols: symbol.bySymbol.slice(0, 10).map((item) => ({
      symbol: item.symbol,
      totalTrades: item.totalTrades,
      winRate: item.winRate,
      netPnl: item.netPnlTotal,
    })),
    limitations: AI_SANDBOX_LIMITATIONS,
  };

  const latestPath = await getAIExportFilePath("latest-analytics.json");
  const versionedPath = await getAIExportFilePath(
    buildVersionedFilename(new Date()),
  );

  const payload = JSON.stringify(data, null, 2);
  await Promise.all([
    writeTextFile(latestPath, payload, { create: true }),
    writeTextFile(versionedPath, payload, { create: true }),
  ]);

  return { data, latestPath, versionedPath };
}
