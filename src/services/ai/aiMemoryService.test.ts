import { describe, expect, it } from "vitest";
import { __aiMemoryServiceTestUtils } from "./aiMemoryService";

describe("aiMemoryService", () => {
  it("extracts durable user preferences and rules", () => {
    expect(
      __aiMemoryServiceTestUtils.extractPersistentMemoryFact(
        "Je préfère des réponses courtes et concrètes.",
      ),
    ).toMatchObject({
      source: "user_preference",
    });

    expect(
      __aiMemoryServiceTestUtils.extractPersistentMemoryFact(
        "Ma règle: pas plus de 1% de risque par trade.",
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
      "Votre drawdown augmente surtout après des entrées impulsives en session US.",
    );

    expect(summary).toContain("Sujet:");
    expect(summary).toContain("Réponse:");
  });
});
