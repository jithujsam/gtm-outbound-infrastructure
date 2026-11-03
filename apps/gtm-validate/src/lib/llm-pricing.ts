/**
 * LLM pricing and usage-cost helpers.
 *
 * Prices are per 1,000,000 tokens. Costs are derived from actual provider
 * usage values, never from character counts or lead counts.
 */

export interface LlmPrice {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
}

export interface LlmUsage {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

/** Raw provider metadata plus actual token usage, kept separate from cost. */
export interface ProviderUsage {
  requestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  rawResponse: unknown;
}

/** Wraps a parsed provider result with its usage metadata. */
export interface ProviderCall<T> {
  data: T;
  usage: ProviderUsage;
}

/** Error carrying the raw provider error body for diagnostics (no secrets). */
export class ProviderError extends Error {
  rawError: unknown;

  constructor(message: string, rawError?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.rawError = rawError;
  }
}

// GPT-4.1-mini official OpenAI pricing (per 1M tokens), as of 2026.
const OPENAI_PRICING: Record<string, LlmPrice> = {
  "gpt-4.1-mini-2025-04-14": {
    inputPerMillion: 0.4,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 1.6,
  },
  "gpt-5.6-luna": {
    inputPerMillion: 0.2,
    cachedInputPerMillion: 0.02,
    outputPerMillion: 1.2,
  },
  "gpt-5.4-mini": {
    inputPerMillion: 0.375,
    cachedInputPerMillion: 0.0375,
    outputPerMillion: 2.25,
  },
};

export function getModelPrice(model: string): LlmPrice | null {
  return OPENAI_PRICING[model] ?? null;
}

export interface LlmCost {
  inputCost: number | null;
  cachedInputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
}

function perMillionCost(tokens: number | null, price: number): number | null {
  if (tokens === null || tokens === undefined) return null;
  return (tokens * price) / 1_000_000;
}

export function calculateCost(
  model: string,
  usage: LlmUsage
): LlmCost {
  const price = getModelPrice(model);

  if (!price) {
    return {
      inputCost: null,
      cachedInputCost: null,
      outputCost: null,
      totalCost: null,
    };
  }

  const inputCost = perMillionCost(usage.inputTokens, price.inputPerMillion);
  const cachedInputCost = perMillionCost(
    usage.cachedInputTokens,
    price.cachedInputPerMillion
  );
  const outputCost = perMillionCost(usage.outputTokens, price.outputPerMillion);

  const parts = [inputCost, cachedInputCost, outputCost].filter(
    (v): v is number => v !== null
  );
  const totalCost =
    parts.length > 0 ? parts.reduce((sum, v) => sum + v, 0) : null;

  return { inputCost, cachedInputCost, outputCost, totalCost };
}
