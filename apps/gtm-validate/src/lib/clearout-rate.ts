export const DEFAULT_CLEAROUT_RPM = 3;
export const DEFAULT_CLEAROUT_TIMEOUT_SECONDS = 45;

export const CLEAROUT_RPM_MIN = 1;
export const CLEAROUT_RPM_MAX = 1000;
export const CLEAROUT_TIMEOUT_MIN_SECONDS = 5;
export const CLEAROUT_TIMEOUT_MAX_SECONDS = 120;

export interface ClearoutRateSettings {
  requestsPerMinute: number;
  timeoutSeconds: number;
}

export interface ClearoutRateSettingsError {
  requestsPerMinute?: string;
  timeoutSeconds?: string;
}

export function spacingSeconds(requestsPerMinute: number): number {
  return 60 / requestsPerMinute;
}

export function sanitizeClearoutRateSettings(input: {
  requestsPerMinute?: unknown;
  timeoutSeconds?: unknown;
}): { settings: ClearoutRateSettings; errors: ClearoutRateSettingsError } {
  const errors: ClearoutRateSettingsError = {};

  let requestsPerMinute = toPositiveInteger(
    input.requestsPerMinute,
    DEFAULT_CLEAROUT_RPM
  );
  if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < CLEAROUT_RPM_MIN || requestsPerMinute > CLEAROUT_RPM_MAX) {
    errors.requestsPerMinute = `Requests per minute must be a whole number between ${CLEAROUT_RPM_MIN} and ${CLEAROUT_RPM_MAX}.`;
    requestsPerMinute = DEFAULT_CLEAROUT_RPM;
  }

  let timeoutSeconds = toPositiveInteger(
    input.timeoutSeconds,
    DEFAULT_CLEAROUT_TIMEOUT_SECONDS
  );
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < CLEAROUT_TIMEOUT_MIN_SECONDS || timeoutSeconds > CLEAROUT_TIMEOUT_MAX_SECONDS) {
    errors.timeoutSeconds = `Timeout must be a whole number between ${CLEAROUT_TIMEOUT_MIN_SECONDS} and ${CLEAROUT_TIMEOUT_MAX_SECONDS} seconds.`;
    timeoutSeconds = DEFAULT_CLEAROUT_TIMEOUT_SECONDS;
  }

  return {
    settings: { requestsPerMinute, timeoutSeconds },
    errors,
  };
}

export function clearoutTimeoutMs(timeoutSeconds: number): number {
  return timeoutSeconds * 1000;
}

export function hasClearoutRateSettingsErrors(errors: ClearoutRateSettingsError): boolean {
  return Boolean(errors.requestsPerMinute || errors.timeoutSeconds);
}

function toPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return fallback;
}
