import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CLEAROUT_RPM, DEFAULT_CLEAROUT_TIMEOUT_SECONDS } from "@/lib/clearout-rate";

export interface EmailRunStats {
  valid: number;
  invalid: number;
  unknown: number;
}

export async function getEmailRunStats(
  supabase: any,
  jobId: string
): Promise<EmailRunStats> {
  const { data: items } = await supabase
    .from("validation_job_items")
    .select("lead_id")
    .eq("job_id", jobId)
    .eq("status", "completed");

  if (!items || items.length === 0) {
    return { valid: 0, invalid: 0, unknown: 0 };
  }

  const leadIds = items.map((i: any) => i.lead_id);
  const { data: leads } = await supabase
    .from("leads")
    .select("id, email_check")
    .in("id", leadIds);

  const stats: EmailRunStats = { valid: 0, invalid: 0, unknown: 0 };
  for (const lead of leads ?? []) {
    if (lead.email_check === "Valid") stats.valid++;
    else if (lead.email_check === "Invalid") stats.invalid++;
    else if (lead.email_check === "Unknown") stats.unknown++;
  }

  return stats;
}

export async function createValidationJob(params: {
  userId: string;
  projectId: string;
  type: "icp" | "email";
  mode: "selected" | "continuous";
  leadIds: string[];
  prompt?: string;
  model?: string;
  llmProvider?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ jobId: string; totalLeads: number; skippedLeads: number; resumed?: boolean }> {
  const { userId, projectId, type, mode, leadIds, prompt, model, llmProvider, temperature, maxTokens } = params;
  const supabase = await createClient();

  const { data: leads, error: fetchErr } = await supabase
    .from("leads")
    .select("id, vertical_match, email_check")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .in("id", leadIds);

  if (fetchErr || !leads) {
    throw new Error("Failed to fetch leads for job creation");
  }

  const isAlreadyValidated = (lead: typeof leads[0]): boolean => {
    if (type === "icp") return lead.vertical_match !== null;
    return lead.email_check !== null;
  };

  const pendingLeads = leads.filter((l) => !isAlreadyValidated(l));
  const skippedLeads = leads.filter((l) => isAlreadyValidated(l));

  let requestsPerMinute = DEFAULT_CLEAROUT_RPM;
  let timeoutSeconds = DEFAULT_CLEAROUT_TIMEOUT_SECONDS;
  if (type === "email") {
    const { data: rateSettings } = await supabase
      .from("integration_settings")
      .select("clearout_requests_per_minute, clearout_timeout_seconds")
      .eq("user_id", userId)
      .maybeSingle();
    requestsPerMinute = rateSettings?.clearout_requests_per_minute ?? DEFAULT_CLEAROUT_RPM;
    timeoutSeconds = rateSettings?.clearout_timeout_seconds ?? DEFAULT_CLEAROUT_TIMEOUT_SECONDS;
  }

  if (pendingLeads.length === 0) {
    throw new Error("All selected leads are already validated");
  }

  // Clean up any stale active jobs for this user+project+type before creating a new one.
  // A provider-rate-limited email job is NOT stale — preserve it instead of
  // destroying its pending items. Only mark genuinely superseded jobs failed.
  const { data: staleJobs } = await supabase
    .from("validation_jobs")
    .select("id, status, provider_reset_at, total_leads, skipped_leads")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("type", type)
    .in("status", ["queued", "running", "paused"]);

  const preserveIds: string[] = [];
  const supersededIds: string[] = [];

  for (const stale of staleJobs ?? []) {
    if (type === "email" && stale.status === "paused" && stale.provider_reset_at) {
      preserveIds.push(stale.id);
    } else {
      supersededIds.push(stale.id);
    }
  }

  if (preserveIds.length > 0 && type === "email") {
    const preserved = staleJobs?.find((j) => j.id === preserveIds[0]);
    if (!preserved) {
      throw new Error("Failed to load existing Clearout rate-limited job");
    }
    return {
      jobId: preserved.id,
      totalLeads: preserved.total_leads,
      skippedLeads: preserved.skipped_leads,
      resumed: true,
    };
  }

  if (supersededIds.length > 0) {
    await supabase
      .from("validation_jobs")
      .update({
        status: "failed",
        error_message: "Superseded by new validation job",
        completed_at: new Date().toISOString(),
      })
      .in("id", supersededIds);
  }

  const { data: job, error: jobErr } = await supabase
    .from("validation_jobs")
    .insert({
      user_id: userId,
      project_id: projectId,
      type,
      mode,
      prompt: prompt ?? null,
      model: model ?? null,
      llm_provider: llmProvider ?? null,
      temperature: temperature ?? null,
      max_tokens: maxTokens ?? null,
      total_leads: pendingLeads.length,
      skipped_leads: skippedLeads.length,
      status: "queued",
      requests_per_minute: type === "email" ? requestsPerMinute : null,
      timeout_seconds: type === "email" ? timeoutSeconds : null,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    throw new Error(`Failed to create job: ${jobErr?.message ?? "unknown"}`);
  }

  const items = pendingLeads.map((lead) => ({
    job_id: job.id,
    lead_id: lead.id,
  }));

  const { error: itemsErr } = await supabase
    .from("validation_job_items")
    .insert(items);

  if (itemsErr) {
    await supabase
      .from("validation_jobs")
      .update({ status: "failed", error_message: itemsErr.message })
      .eq("id", job.id);
    throw new Error(`Failed to create job items: ${itemsErr.message}`);
  }

  return {
    jobId: job.id,
    totalLeads: pendingLeads.length,
    skippedLeads: skippedLeads.length,
  };
}
