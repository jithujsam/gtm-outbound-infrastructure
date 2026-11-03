import { describe, expect, it } from "vitest";
import { calculateCost } from "@/lib/llm-pricing";

describe("calculateCost", () => {
  it("prices non-cached input, cached input and output separately", () => {
    const cost = calculateCost("gpt-4.1-mini-2025-04-14", {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 3_000_000,
    });
    expect(cost.inputCost).toBeCloseTo(0.4);
    expect(cost.cachedInputCost).toBeCloseTo(0.1);
    expect(cost.outputCost).toBeCloseTo(1.6);
    expect(cost.totalCost).toBeCloseTo(2.1);
  });

  it("returns nulls for a model with no known price instead of guessing", () => {
    expect(
      calculateCost("unknown-model", {
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
        totalTokens: 200,
      })
    ).toEqual({ inputCost: null, cachedInputCost: null, outputCost: null, totalCost: null });
  });

  it("totals only the parts the provider reported", () => {
    const cost = calculateCost("gpt-4.1-mini-2025-04-14", {
      inputTokens: 500_000,
      cachedInputTokens: null,
      outputTokens: null,
      totalTokens: null,
    });
    expect(cost.cachedInputCost).toBeNull();
    expect(cost.totalCost).toBeCloseTo(0.2);
  });
});
