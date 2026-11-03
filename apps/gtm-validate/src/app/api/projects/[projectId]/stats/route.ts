import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Counted in the database: fetching rows and filtering in JS silently
  // stopped at PostgREST's 1000-row limit, so large projects showed wrong totals.
  const countLeads = async (apply: (q: any) => any = (q) => q): Promise<number> => {
    const { count, error } = await apply(
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("user_id", user.id)
    );
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  let counts: number[];
  try {
    counts = await Promise.all([
      countLeads(),
      countLeads((q) => q.not("vertical_match", "is", null)),
      countLeads((q) => q.eq("vertical_match", true)),
      countLeads((q) => q.eq("vertical_match", false)),
      countLeads((q) => q.not("email_check", "is", null)),
      countLeads((q) => q.eq("email_check", "Valid")),
      countLeads((q) => q.eq("email_check", "Invalid")),
      countLeads((q) => q.eq("email_check", "Unknown")),
      countLeads((q) => q.eq("safe_to_send", true)),
    ]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  const [total, icpValidated, icpMatch, icpNoMatch, emailValidated, emailValid, emailInvalid, emailUnknown, safeToSend] = counts;
  const icpNotValidated = total - icpValidated;
  const emailNotValidated = total - emailValidated;

  // Usage aggregation from api_operation_logs, read in pages for the same reason.
  const LOG_PAGE = 1000;
  const usageRowsRaw: any[] = [];
  for (let from = 0; ; from += LOG_PAGE) {
    const { data, error: usageErr } = await supabase
      .from("api_operation_logs")
      .select("status, input_tokens, cached_input_tokens, output_tokens, total_tokens, total_cost, duration_ms")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .order("id")
      .range(from, from + LOG_PAGE - 1);
    if (usageErr) {
      return NextResponse.json({ error: usageErr.message }, { status: 500 });
    }
    usageRowsRaw.push(...(data ?? []));
    if ((data?.length ?? 0) < LOG_PAGE) break;
  }

  const logs = usageRowsRaw;
  const totalSuccessfulValidations = logs.filter((l) => l.status === "success").length;
  const totalFailedValidations = logs.filter((l) => l.status !== "success").length;
  const totalApiRequests = logs.length;
  const hasUsage = logs.some(
    (l) =>
      l.input_tokens != null ||
      l.cached_input_tokens != null ||
      l.output_tokens != null ||
      l.total_tokens != null ||
      l.total_cost != null
  );

  const sumOrNull = (fn: (l: any) => number | null): number | null => {
    if (!hasUsage) return null;
    return logs.reduce((sum, l) => sum + (fn(l) ?? 0), 0);
  };

  const totalInputTokens = sumOrNull((l) => l.input_tokens);
  const totalCachedTokens = sumOrNull((l) => l.cached_input_tokens);
  const totalOutputTokens = sumOrNull((l) => l.output_tokens);
  const totalTokens = sumOrNull((l) => l.total_tokens);
  const totalCost = sumOrNull((l) => l.total_cost);
  const totalDurationMs = logs.reduce((sum, l) => sum + (l.duration_ms ?? 0), 0);

  const processedLeads = icpValidated + emailValidated;
  const successRate = totalSuccessfulValidations + totalFailedValidations > 0
    ? totalSuccessfulValidations / (totalSuccessfulValidations + totalFailedValidations)
    : 0;
  const averageCostPerLead = totalCost != null && processedLeads > 0
    ? totalCost / processedLeads
    : null;
  const averageDurationMs = totalApiRequests > 0 ? totalDurationMs / totalApiRequests : null;

  return NextResponse.json({
    leads: {
      total,
      icpValidated,
      icpNotValidated,
      icpMatch,
      icpNoMatch,
      emailValidated,
      emailNotValidated,
      emailValid,
      emailInvalid,
      emailUnknown,
      safeToSend,
    },
    usage: {
      totalSuccessfulValidations,
      totalFailedValidations,
      successRate,
      totalApiRequests,
      totalInputTokens,
      totalCachedTokens,
      totalOutputTokens,
      totalTokens,
      totalCost,
      averageCostPerLead,
      averageDurationMs,
    },
  });
}
