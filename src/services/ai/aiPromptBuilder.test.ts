import { describe, expect, it } from "vitest";
import type {
  AIAnalyticsExport,
  AIChatMessage,
  AIMemoryState,
} from "../../types/ai";
import {
  buildConversationForModel,
  buildAISystemPrompt,
  sanitizeAIOutput,
} from "./aiPromptBuilder";

function buildExportStub(): AIAnalyticsExport {
  return {
    generatedAt: new Date().toISOString(),
    analytics: {
      winRate: 58,
      profitFactor: 1.8,
      drawdown: -4.2,
      totalNetPnl: 1200,
      totalTrades: 42,
      currency: "USD",
    },
    pnl: {
      totalNetPnl: 1200,
      totalGrossPnl: 1450,
      totalFees: 250,
      averagePnl: 28.5,
      bestTrade: 210,
      worstTrade: -120,
    },
    drawdown: {
      maxDrawdown: -510,
      maxDrawdownPct: -4.2,
      currentDrawdown: -120,
      currentDrawdownPct: -1.1,
      recoveryTrades: 5,
    },
    riskManagement: {
      avgRR: 1.4,
      pctWithSL: 88,
      pctWithTP: 75,
      profitFactor: 1.8,
    },
    habits: ["Perte frequente pendant New York afternoon"],
    emotions: ["FOMO"],
    errors: ["Entree impulsive"],
    tradeNotes: [
      {
        tradeId: 7,
        tradeSymbol: "EURUSD",
        content: "J'ai coupe trop tot.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    tradeMistakes: [
      {
        tradeId: 7,
        tradeSymbol: "EURUSD",
        mistakeName: "FOMO",
        notes: "Entree hors plan",
        createdAt: new Date().toISOString(),
      },
    ],
    strategies: [
      {
        strategyName: "Breakout",
        totalTrades: 12,
        winRate: 62,
        netPnl: 560,
      },
    ],
    sessions: [
      {
        sessionName: "London",
        totalTrades: 16,
        winRate: 61,
        netPnl: 700,
      },
    ],
    symbols: [
      {
        symbol: "EURUSD",
        totalTrades: 14,
        winRate: 64,
        netPnl: 640,
      },
    ],
    limitations: ["Lecture seule seulement"],
  };
}

function buildMemoryStub(): AIMemoryState {
  return {
    facts: [
      {
        id: "fact-1",
        content: "Je prefere des reponses courtes.",
        source: "user_preference",
        scopeKey: null,
        scopeLabel: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    summaries: [
      {
        id: "summary-1",
        content: "Sujet: drawdown | Reponse: attention aux entrees impulsives.",
        scopeKey: null,
        scopeLabel: null,
        createdAt: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

describe("aiPromptBuilder", () => {
  it("injects analytics and limitations in system prompt", () => {
    const prompt = buildAISystemPrompt(buildExportStub(), buildMemoryStub());

    expect(prompt).toContain("Contexte analytics JSON:");
    expect(prompt).toContain("Limitations sandbox:");
    expect(prompt).toContain("Breakout");
    expect(prompt).toContain(
      "Tu dois aussi prendre en compte les notes normales de trade",
    );
    expect(prompt).toContain("tradeNotes");
    expect(prompt).toContain("tradeMistakes");
    expect(prompt).toContain("Je prefere des reponses courtes.");
  });

  it("injects active memory scope in system prompt", () => {
    const prompt = buildAISystemPrompt(buildExportStub(), buildMemoryStub(), {
      key: "symbol:EURUSD",
      label: "Symbole EURUSD",
    });

    expect(prompt).toContain("Symbole EURUSD");
  });

  it("sanitizes forbidden trading instructions", () => {
    const sanitized = sanitizeAIOutput("Achete maintenant EURUSD");

    expect(sanitized).toContain("Je ne peux pas fournir de signal d'achat/vente");
  });

  it("keeps safe analytical response unchanged", () => {
    const text = "Votre drawdown augmente surtout sur session US.";
    expect(sanitizeAIOutput(text)).toBe(text);
  });

  it("limits history to 10 latest messages", () => {
    const history: AIChatMessage[] = Array.from({ length: 12 }).map(
      (_, idx) => ({
        id: `m-${idx}`,
        role: idx % 2 === 0 ? "user" : "assistant",
        content: `c-${idx}`,
        createdAt: new Date().toISOString(),
      }),
    );

    const messages = buildConversationForModel("system", history, "question");

    expect(messages[0]).toEqual({ role: "system", content: "system" });
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: "question",
    });
    expect(messages.length).toBe(12);
    expect(messages[1].content).toBe("c-2");
    expect(messages[10].content).toBe("c-11");
  });
});
