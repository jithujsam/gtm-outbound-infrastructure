import { describe, expect, it } from "vitest";
import { backoffDelay, classifyError, shouldPauseJob } from "@/lib/retry";

describe("classifyError", () => {
  it("treats auth and quota failures as system errors", () => {
    expect(classifyError("HTTP 401 Unauthorized")).toBe("system");
    expect(classifyError("insufficient_quota")).toBe("system");
    expect(classifyError("Clearout API key not configured")).toBe("system");
  });

  it("treats rate limits, server errors and malformed model output as retryable", () => {
    expect(classifyError("HTTP 429 Too Many Requests")).toBe("retryable");
    expect(classifyError("HTTP 503 Service Unavailable")).toBe("retryable");
    expect(classifyError("fetch failed: ETIMEDOUT")).toBe("retryable");
    expect(classifyError("Invalid JSON from OpenAI batch")).toBe("retryable");
    expect(classifyError("Batch size mismatch: expected 5, got 4")).toBe("retryable");
  });

  it("checks system errors before retryable ones", () => {
    expect(classifyError("403 after timeout")).toBe("system");
  });

  it("falls back to fatal for anything unrecognised", () => {
    expect(classifyError("Lead has no email")).toBe("fatal");
  });
});

describe("backoffDelay", () => {
  it("doubles per attempt and caps at the last step", () => {
    expect([0, 1, 2, 3, 4].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(backoffDelay(10)).toBe(16000);
  });
});

describe("shouldPauseJob", () => {
  it("never pauses before the minimum sample size", () => {
    expect(shouldPauseJob(4, 0)).toBe(false);
  });

  it("pauses only when more than half of processed items failed", () => {
    expect(shouldPauseJob(3, 2)).toBe(true);
    expect(shouldPauseJob(3, 3)).toBe(false);
    expect(shouldPauseJob(2, 8, 10)).toBe(false);
  });
});
