import { describe, expect, it } from "vitest";
import { __aiMemoryServiceTestUtils } from "./aiMemoryService";

describe("aiMemoryService", () => {
  it("extracts durable user preferences and rules", () => {
    expect(
      __aiMemoryServiceTestUtils.extractPersistentMemoryFact(
        "Je prefere des reponses courtes et concretes.",
      ),
    ).toMatchObject({
      source: "user_preference",
    });

    expect(
      __aiMemoryServiceTestUtils.extractPersistentMemoryFact(
        "Ma regle: pas plus de 1% de risque par trade.",
      ),
    ).toMatchObject({
      source: "user_rule",
    });
  });

  it("ignores ordinary prompts that should not become memory", () => {
    expect(
      __aiMemoryServiceTestUtils.extractPersistentMemoryFact(
        "Analyse ma performance du jour.",
      ),
    ).toBeNull();
  });

  it("builds compact local memory summaries from interactions", () => {
    const summary = __aiMemoryServiceTestUtils.buildInteractionMemorySummary(
      "Pourquoi mes pertes montent en session US ?",
      "Votre drawdown augmente surtout apres des entrees impulsives en session US.",
    );

    expect(summary).toContain("Sujet:");
    expect(summary).toContain("session US");
  });

  it("keeps global memory and matching scoped memory only", () => {
    const scoped = __aiMemoryServiceTestUtils.buildScopedAIMemoryState(
      {
        facts: [
          {
            id: "fact-global",
            content: "Toujours repondre court.",
            source: "user_preference",
            scopeKey: null,
            scopeLabel: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "fact-symbol",
            content: "XAUUSD: attention London open.",
            source: "user_context",
            scopeKey: "symbol:XAUUSD",
            scopeLabel: "Symbole XAUUSD",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "fact-other",
            content: "EURUSD only.",
            source: "user_context",
            scopeKey: "symbol:EURUSD",
            scopeLabel: "Symbole EURUSD",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        summaries: [
          {
            id: "summary-symbol",
            content: "Sujet: XAUUSD | Reponse: garder patience.",
            scopeKey: "symbol:XAUUSD",
            scopeLabel: "Symbole XAUUSD",
            createdAt: new Date().toISOString(),
          },
        ],
        updatedAt: new Date().toISOString(),
      },
      {
        key: "symbol:XAUUSD",
        label: "Symbole XAUUSD",
      },
    );

    expect(scoped.facts).toHaveLength(2);
    expect(scoped.facts.map((fact) => fact.id)).toEqual([
      "fact-global",
      "fact-symbol",
    ]);
    expect(scoped.summaries).toHaveLength(1);
  });
});
