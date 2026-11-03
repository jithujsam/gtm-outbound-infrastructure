import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClearoutError,
  clearoutRateLimitResetAt,
  isClearoutProviderRateLimit,
  parseClearout,
} from "@/lib/clearout";

describe("parseClearout", () => {
  it("reads nested detail_info fields and Clearout's own score", () => {
    const parsed = parseClearout({
      data: {
        status: "valid",
        safe_to_send: "yes",
        score: 92,
        detail_info: {
          smtp_provider: "google",
          mx_record: "aspmx.l.google.com",
          account: "jane",
          domain: "acme.com",
        },
      },
    });

    expect(parsed).toEqual({
      status: "valid",
      safe_to_send: true,
      smtp_provider: "google",
      mx_record: "aspmx.l.google.com",
      score: 92,
      account: "jane",
      domain: "acme.com",
    });
  });

  it.each([
    [true, true],
    ["YES", true],
    ["true", true],
    ["1", true],
    ["no", false],
    [false, false],
    [undefined, false],
  ])("normalises safe_to_send %j to %s", (raw, expected) => {
    expect(parseClearout({ data: { safe_to_send: raw } }).safe_to_send).toBe(expected);
  });

  it("returns safe defaults for an empty response", () => {
    expect(parseClearout(null)).toMatchObject({
      status: "unknown",
      safe_to_send: false,
      score: null,
    });
  });
});

describe("isClearoutProviderRateLimit", () => {
  it("only matches a 429 with Clearout error code 1030", () => {
    expect(isClearoutProviderRateLimit(new ClearoutError("limit", 429, null, 1030))).toBe(true);
    expect(isClearoutProviderRateLimit(new ClearoutError("limit", 429, null, 1000))).toBe(false);
    expect(isClearoutProviderRateLimit(new ClearoutError("bad", 400, null, 1030))).toBe(false);
    expect(isClearoutProviderRateLimit(new Error("429"))).toBe(false);
  });
});

describe("clearoutRateLimitResetAt", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the provider's reset time when present", () => {
    const err = new ClearoutError("limit", 429, null, 1030, "2026-10-18T12:00:00.000Z");
    expect(clearoutRateLimitResetAt(err)).toBe("2026-10-18T12:00:00.000Z");
  });

  it("falls back to 15 minutes from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00.000Z"));
    const err = new ClearoutError("limit", 429, null, 1030);
    expect(clearoutRateLimitResetAt(err)).toBe("2026-10-18T12:15:00.000Z");
  });
});
