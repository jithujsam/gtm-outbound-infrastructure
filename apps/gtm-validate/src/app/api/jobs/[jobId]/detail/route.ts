import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEmailRunStats } from "@/lib/jobs";
import { toRunStats } from "@/lib/run-stats";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: job, error: jobError } = await supabase
    .from("validation_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const [requestsRes, itemsRes, statsRes] = await Promise.all([
    supabase
      .from("api_operation_logs")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true }),
    supabase
      .from("validation_job_items")
      .select("id, lead_id, status, attempt, max_attempts, error_message, completed_at, next_attempt_at, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true }),
    supabase.rpc("get_validation_run_stats", { p_job_id: jobId } as any),
  ]);

  const items = itemsRes.data ?? [];
  const leadIds = items.map((i: any) => i.lead_id);

  const { data: leads } = await supabase
    .from("leads")
    .select("id, full_name, company_name, email, industry, vertical_match, matched_vertical, reasoning, email_check, safe_to_send")
    .in("id", leadIds);

  const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));

  const itemsWithLeads = items.map((item: any) => ({
    ...item,
    lead: leadMap.get(item.lead_id) ?? null,
  }));

  const statsRow = (statsRes.data as any)?.[0];

  let emailRunStats = null;
  if (job.type === "email") {
    emailRunStats = await getEmailRunStats(supabase, jobId);
  }

  return NextResponse.json({
    job,
    requests: requestsRes.data ?? [],
    items: itemsWithLeads,
    emailRunStats,
    runStats: toRunStats(statsRow),
  });
}
