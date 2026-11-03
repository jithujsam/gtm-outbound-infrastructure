export type ErrorClass = "retryable" | "fatal" | "system";

export function classifyError(errorMessage: string): ErrorClass {
  if (
    errorMessage.includes("401") ||
    errorMessage.includes("403") ||
    errorMessage.includes("not configured") ||
    errorMessage.includes("API key") ||
    errorMessage.includes("insufficient_quota") ||
    errorMessage.includes("invalid_api_key")
  ) {
    return "system";
  }

  if (
    errorMessage.includes("429") ||
    errorMessage.includes("500") ||
    errorMessage.includes("502") ||
    errorMessage.includes("503") ||
    errorMessage.includes("504") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("ETIMEDOUT") ||
    errorMessage.includes("ENOTFOUND") ||
    errorMessage.includes("network") ||
    errorMessage.includes("rate_limit_exceeded") ||
    errorMessage.includes("Empty OpenAI") ||
    errorMessage.includes("Invalid JSON") ||
    errorMessage.includes("Invalid OpenAI response") ||
    errorMessage.includes("Invalid vertical_match") ||
    errorMessage.includes("Invalid reasoning") ||
    errorMessage.includes("Invalid matched_vertical") ||
    errorMessage.includes("Batch size mismatch") ||
    errorMessage.includes("Unknown lead_id") ||
    errorMessage.includes("Duplicate lead_id") ||
    errorMessage.includes("Missing lead_id")
  ) {
    return "retryable";
  }

  return "fatal";
}

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

export function backoffDelay(attempt: number): number {
  const idx = Math.min(attempt, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[idx];
}

export function shouldPauseJob(
  failedCount: number,
  completedCount: number,
  minItems: number = 5
): boolean {
  const total = failedCount + completedCount;
  if (total < minItems) return false;
  return failedCount / total > 0.5;
}
