import { ICP_VERTICALS } from "@/types";
import { ProviderCall, ProviderError, type ProviderUsage } from "@/lib/llm-pricing";

export interface OpenAIIcpResponse {
  vertical_match: boolean;
  matched_vertical: string | null;
  reasoning: string;
}

export interface BatchLeadInput {
  leadId: string;
  leadBlock: string;
}

export interface BatchIcpResult extends OpenAIIcpResponse {
  leadId: string;
}

export const OPENAI_MODELS = ["gpt-4.1-mini-2025-04-14", "gpt-5.6-luna", "gpt-5.4-mini"] as const;
export const OPENAI_DEFAULT_MODEL = "gpt-4.1-mini-2025-04-14";

function buildIcpSchema() {
  return {
    type: "object" as const,
    properties: {
      vertical_match: {
        type: "boolean",
        description: "Whether the company matches a target ICP vertical",
      },
      matched_vertical: {
        type: ["string", "null"],
        description: "The matched vertical name or null if no match",
      },
      reasoning: {
        type: "string",
        description: "Short explanation of the ICP classification",
      },
    },
    required: ["vertical_match", "matched_vertical", "reasoning"],
    additionalProperties: false,
  };
}

function buildBatchSchema() {
  return {
    type: "object" as const,
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            lead_id: { type: "string" },
            vertical_match: { type: "boolean" },
            matched_vertical: { type: ["string", "null"] },
            reasoning: { type: "string" },
          },
          required: ["lead_id", "vertical_match", "matched_vertical", "reasoning"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  };
}

function parseResponse(text: string, leadId?: string): OpenAIIcpResponse {
  const trimmed = text.trim();

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Try extracting JSON from markdown code blocks
    const codeMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeMatch) {
      try {
        parsed = JSON.parse(codeMatch[1].trim());
      } catch {
        const context = leadId ? ` for lead ${leadId}` : "";
        throw new Error(`Invalid JSON from OpenAI${context}`);
      }
    } else {
      const context = leadId ? ` for lead ${leadId}` : "";
      throw new Error(`Invalid JSON from OpenAI${context}`);
    }
  }

  if (typeof parsed.vertical_match !== "boolean") {
    throw new Error("Invalid OpenAI response: vertical_match must be a boolean");
  }

  if (typeof parsed.reasoning !== "string") {
    throw new Error("Invalid OpenAI response: reasoning must be a string");
  }

  const matchedVertical = parsed.matched_vertical;
  const validVerticals: readonly string[] = ICP_VERTICALS;

  if (matchedVertical === null) {
    return { vertical_match: false, matched_vertical: null, reasoning: parsed.reasoning };
  }

  if (typeof matchedVertical !== "string") {
    throw new Error("Invalid OpenAI response: matched_vertical must be a string or null");
  }

  const isInList = validVerticals.includes(matchedVertical);

  return {
    vertical_match: parsed.vertical_match === true && isInList,
    matched_vertical: isInList ? matchedVertical : null,
    reasoning: parsed.reasoning,
  };
}

export async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<ProviderCall<OpenAIIcpResponse>> {
  if (!userPrompt || userPrompt.trim().length === 0) {
    throw new Error("Prompt cannot be empty");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.2,
      max_completion_tokens: options?.maxTokens ?? 512,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "icp_classification",
          schema: buildIcpSchema(),
          strict: true,
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    let errorDetail = err;
    let rawError: unknown = err;
    try {
      const parsed = JSON.parse(err);
      errorDetail = parsed.error?.message || err;
      rawError = parsed;
    } catch {}
    throw new ProviderError(
      `OpenAI API error (${res.status}): ${errorDetail.slice(0, 200)}`,
      rawError
    );
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Empty OpenAI response");
  }

  return {
    data: parseResponse(content),
    usage: extractOpenAIUsage(data),
  };
}

export async function callOpenAIBatch(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userCriteria: string,
  leads: BatchLeadInput[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<ProviderCall<BatchIcpResult[]>> {
  if (leads.length === 0) {
    return {
      data: [],
      usage: {
        requestId: null,
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        totalTokens: null,
        rawResponse: null,
      },
    };
  }

  const leadEntries = leads
    .map((l) => l.leadBlock)
    .join("\n\n---\n\n");

  const batchPrompt = `${userCriteria.trim()}

LEADS TO CLASSIFY

${leadEntries}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: batchPrompt },
      ],
      temperature: options?.temperature ?? 0.2,
      max_completion_tokens: options?.maxTokens ?? 2048,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "icp_classification_batch",
          schema: buildBatchSchema(),
          strict: true,
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    let errorDetail = err;
    let rawError: unknown = err;
    try {
      const parsed = JSON.parse(err);
      errorDetail = parsed.error?.message || err;
      rawError = parsed;
    } catch {}
    throw new ProviderError(
      `OpenAI batch API error (${res.status}): ${errorDetail.slice(0, 200)}`,
      rawError
    );
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Empty OpenAI batch response");
  }

  let parsed: any;
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Invalid JSON from OpenAI batch");
  }

  const items = parsed?.results ?? parsed;
  if (!Array.isArray(items)) {
    throw new Error("OpenAI batch response is not an array");
  }

  if (items.length !== leads.length) {
    throw new Error(
      `Batch size mismatch: expected ${leads.length} results, got ${items.length}`
    );
  }

  const expectedIds = new Set(leads.map((l) => l.leadId));
  const seenIds = new Set<string>();
  const results: BatchIcpResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (!expectedIds.has(item.lead_id)) {
      throw new Error(`Unknown lead_id in batch response: ${item.lead_id}`);
    }

    if (seenIds.has(item.lead_id)) {
      throw new Error(`Duplicate lead_id in batch response: ${item.lead_id}`);
    }

    seenIds.add(item.lead_id);

    if (typeof item.vertical_match !== "boolean") {
      throw new Error(`Invalid vertical_match for lead ${item.lead_id}`);
    }

    if (typeof item.reasoning !== "string") {
      throw new Error(`Invalid reasoning for lead ${item.lead_id}`);
    }

    const matchedVertical = item.matched_vertical;
    const validVerticals: readonly string[] = ICP_VERTICALS;

    if (matchedVertical === null) {
      results.push({
        leadId: item.lead_id,
        vertical_match: false,
        matched_vertical: null,
        reasoning: item.reasoning,
      });
      continue;
    }

    if (typeof matchedVertical !== "string") {
      throw new Error(`Invalid matched_vertical for lead ${item.lead_id}`);
    }

    const isInList = validVerticals.includes(matchedVertical);

    results.push({
      leadId: item.lead_id,
      vertical_match: item.vertical_match === true && isInList,
      matched_vertical: isInList ? matchedVertical : null,
      reasoning: item.reasoning,
    });
  }

  for (const lead of leads) {
    if (!seenIds.has(lead.leadId)) {
      throw new Error(`Missing lead_id in batch response: ${lead.leadId}`);
    }
  }

  return {
    data: results,
    usage: extractOpenAIUsage(data),
  };
}

function extractOpenAIUsage(data: any): ProviderUsage {
  const usage = data?.usage;
  const promptTokens = usage?.prompt_tokens ?? null;
  const completionTokens = usage?.completion_tokens ?? null;
  const totalTokens = usage?.total_tokens ?? null;

  // OpenAI reports prompt_tokens as the full prompt total, and
  // prompt_tokens_details.cached_tokens as the subset that hit cache.
  // For billing, non-cached input = prompt_tokens - cached_tokens.
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? null;
  const nonCachedInputTokens =
    promptTokens !== null && cachedTokens !== null
      ? promptTokens - cachedTokens
      : promptTokens;

  return {
    requestId: data?.id ?? null,
    inputTokens: nonCachedInputTokens,
    cachedInputTokens: cachedTokens,
    outputTokens: completionTokens,
    totalTokens: totalTokens,
    // Keep the full provider response for audit; it still contains the raw
    // prompt_tokens and cached_tokens values.
    rawResponse: data,
  };
}
