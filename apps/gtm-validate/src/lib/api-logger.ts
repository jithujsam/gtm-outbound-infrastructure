import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export interface ApiLogEntry {
  user_id: string;
  project_id: string;
  lead_id?: string | null;
  job_id?: string | null;
  job_item_id?: string | null;
  provider: "clearout" | "openai";
  operation: string;
  status: "success" | "failed" | "retryable_error" | "fatal_error";
  attempt?: number;
  duration_ms?: number | null;
  http_status?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  model?: string | null;
  request_id?: string | null;
  leads_in_request?: number | null;
  input_tokens?: number | null;
  cached_input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  input_cost?: number | null;
  cached_input_cost?: number | null;
  output_cost?: number | null;
  total_cost?: number | null;
  request_metadata?: Json | null;
  response_metadata?: Json | null;
  raw_response?: unknown;
  raw_error?: unknown;
}

export async function createApiLog(entry: ApiLogEntry): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_operation_logs")
    .insert({
      ...entry,
      attempt: entry.attempt ?? 1,
      raw_response: toJson(entry.raw_response),
      raw_error: toJson(entry.raw_error),
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create API log: ${error.message}`);
  return data.id;
}

export async function updateApiLog(
  logId: string,
  update: {
    status?: "success" | "failed" | "retryable_error" | "fatal_error";
    duration_ms?: number;
    http_status?: number | null;
    error_code?: string | null;
    error_message?: string | null;
    model?: string | null;
    request_id?: string | null;
    leads_in_request?: number | null;
    input_tokens?: number | null;
    cached_input_tokens?: number | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
    input_cost?: number | null;
    cached_input_cost?: number | null;
    output_cost?: number | null;
    total_cost?: number | null;
    response_metadata?: Json | null;
    raw_response?: unknown;
    raw_error?: unknown;
  }
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("api_operation_logs")
    .update({
      ...update,
      raw_response: toJson(update.raw_response),
      raw_error: toJson(update.raw_error),
    })
    .eq("id", logId);

  if (error) throw new Error(`Failed to update API log: ${error.message}`);
}

// Provider payloads arrive as parsed JSON (unknown); store them as jsonb.
function toJson(value: unknown): Json | null | undefined {
  return value as Json | null | undefined;
}
