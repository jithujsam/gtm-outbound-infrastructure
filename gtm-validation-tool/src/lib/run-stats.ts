import type { RunStats } from "@/lib/format";

/**
 * Fetches get_validation_run_stats for one job and maps the SQL row
 * (snake_case, numeric strings) to the RunStats shape the UI uses.
 * Returns null when the RPC returns no row.
 */
export async function fetchRunStats(supabase: any, jobId: string): Promise<RunStats | null> {
  const { data } = await supabase.rpc("get_validation_run_stats", { p_job_id: jobId });
  return toRunStats(Array.isArray(data) ? data[0] : null);
}

export function toRunStats(row: any): RunStats | null {
  if (!row) return null;
  const nullableNumber = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    leadsRequested: Number(row.leads_requested ?? 0),
    leadsProcessed: Number(row.leads_processed ?? 0),
    successful: Number(row.successful ?? 0),
    failed: Number(row.failed ?? 0),
    matched: Number(row.matched ?? 0),
    noMatch: Number(row.no_match ?? 0),
    apiRequests: Number(row.api_requests ?? 0),
    inputTokens: nullableNumber(row.input_tokens),
    cachedInputTokens: nullableNumber(row.cached_input_tokens),
    outputTokens: nullableNumber(row.output_tokens),
    totalTokens: nullableNumber(row.total_tokens),
    totalCost: nullableNumber(row.total_cost),
    totalDurationMs: Number(row.total_duration_ms ?? 0),
  };
}
