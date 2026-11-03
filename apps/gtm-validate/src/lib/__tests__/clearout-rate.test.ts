import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLEAROUT_RPM,
  DEFAULT_CLEAROUT_TIMEOUT_SECONDS,
  hasClearoutRateSettingsErrors,
  sanitizeClearoutRateSettings,
  spacingSeconds,
} from "@/lib/clearout-rate";

describe("sanitizeClearoutRateSettings", () => {
  it("accepts numeric strings from form input", () => {
    const { settings, errors } = sanitizeClearoutRateSettings({
      requestsPerMinute: "20",
      timeoutSeconds: "30",
    });
    expect(settings).toEqual({ requestsPerMinute: 20, timeoutSeconds: 30 });
    expect(hasClearoutRateSettingsErrors(errors)).toBe(false);
  });

  it("uses defaults when values are missing", () => {
    const { settings, errors } = sanitizeClearoutRateSettings({});
    expect(settings).toEqual({
      requestsPerMinute: DEFAULT_CLEAROUT_RPM,
      timeoutSeconds: DEFAULT_CLEAROUT_TIMEOUT_SECONDS,
    });
    expect(hasClearoutRateSettingsErrors(errors)).toBe(false);
  });

  it("rejects out-of-range values and falls back to defaults", () => {
    const { settings, errors } = sanitizeClearoutRateSettings({
      requestsPerMinute: 0,
      timeoutSeconds: 500,
    });
    expect(settings).toEqual({
      requestsPerMinute: DEFAULT_CLEAROUT_RPM,
      timeoutSeconds: DEFAULT_CLEAROUT_TIMEOUT_SECONDS,
    });
    expect(errors.requestsPerMinute).toBeDefined();
    expect(errors.timeoutSeconds).toBeDefined();
  });
});

describe("spacingSeconds", () => {
  it("spreads requests evenly across a minute", () => {
    expect(spacingSeconds(3)).toBe(20);
    expect(spacingSeconds(60)).toBe(1);
  });
});
