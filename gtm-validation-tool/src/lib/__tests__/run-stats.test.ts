import { describe, it, expect } from "vitest";
import { toRunStats } from "../run-stats";

describe("toRunStats", () => {
  it("returns null without a row", () => {
    expect(toRunStats(null)).toBeNull();
    expect(toRunStats(undefined)).toBeNull();
  });

  it("converts numeric strings and keeps missing usage as null", () => {
    const stats = toRunStats({
      leads_requested: "10",
      leads_processed: "8",
      successful: 7,
      failed: 1,
      matched: "3",
      no_match: "4",
      api_requests: 4,
      input_tokens: "1200",
      cached_input_tokens: null,
      output_tokens: "300",
      total_tokens: "1500",
      total_cost: "0.00096",
      total_duration_ms: null,
    });
    expect(stats).toMatchObject({
      leadsRequested: 10,
      leadsProcessed: 8,
      matched: 3,
      inputTokens: 1200,
      cachedInputTokens: null,
      totalCost: 0.00096,
      totalDurationMs: 0,
    });
  });
});
