import { createClient } from "@/lib/supabase/server";
import { callOpenAI, callOpenAIBatch, OPENAI_DEFAULT_MODEL, type BatchLeadInput } from "@/lib/validation/openai";
import { ICP_SYSTEM_PROMPT, formatLeadForIcp, buildIcpUserPrompt } from "@/lib/validation/icp-prompt";
import { createApiLog, updateApiLog } from "@/lib/api-logger";
import { calculateCost, ProviderError, type ProviderUsage } from "@/lib/llm-pricing";
import { classifyError, backoffDelay, shouldPauseJob } from "@/lib/retry";
import { callClearout, parseClearout, ClearoutError, isClearoutProviderRateLimit, clearoutRateLimitResetAt } from "@/lib/clearout";
import type { Json } from "@/types/database";
import { clearoutTimeoutMs, DEFAULT_CLEAROUT_RPM, DEFAULT_CLEAROUT_TIMEOUT_SECONDS } from "@/lib/clearout-rate";

const BATCH_SIZE = 10;
const LLM_BATCH_SIZE = 3;
const MAX_CONCURRENT = 2;
const MAX_JOB_SIZE = 200;
const DEFAULT_MAX_TOKENS_PER_LEAD = 512;

// One /process request must finish inside the route's maxDuration (300s).
// The email loop stops starting new items once this budget is used and lets
// the client call /process again.
const EMAIL_TIME_BUDGET_MS = 45_000;

// A job in one of these states is never processed again.
const TERMINAL_JOB_STATUSES = ["completed", "completed_with_errors", "failed", "cancelled"];

export function getMaxJobSize(): number {
  return MAX_JOB_SIZE;
}

// Lead columns sent to the model (see formatLeadForIcp in icp-prompt.ts)
const LEAD_FIELDS_FOR_PROMPT =
  "id, full_name, company_name, email, industry, position, state, domain, employee_size, country, company_description, company_linkedin, linkedin_url, website";

// Columns needed from validation_jobs for processing decisions
const JOB_FIELDS =
  "id, user_id, project_id, status, llm_provider, model, temperature, max_tokens, prompt, failed_leads, completed_leads, type, provider_reset_at, requests_per_minute, timeout_seconds, started_at";

export async function processJobBatch(
  jobId: string,
  llmApiKey: string,
  prompt: string
): Promise<{
  processed: number;
  matched: number;
  errors: string[];
  complete: boolean;
  paused?: boolean;
  pausedReason?: string;
}> {
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("validation_jobs")
    .select(JOB_FIELDS)
    .eq("id", jobId)
    .single();

  if (!job) throw new Error("Job not found");

  if (TERMINAL_JOB_STATUSES.includes(job.status)) {
    return { processed: 0, matched: 0, errors: [], complete: true };
  }

  if (job.status === "queued" || job.status === "paused") {
    await supabase
      .from("validation_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);
  }

  const claimed = await claimBatch(supabase, jobId, BATCH_SIZE);

  if (claimed.length === 0) {
    if ((await countOpenItems(supabase, jobId)) === 0) {
      await finalizeJob(supabase, jobId);
      return { processed: 0, matched: 0, errors: [], complete: true };
    }

    // No items claimable (possibly all in retry backoff or still processing with valid leases)
    return { processed: 0, matched: 0, errors: [], complete: false };
  }

  const leadIds = claimed.map((c: any) => c.lead_id);
  const { data: leads } = await supabase
    .from("leads")
    .select(LEAD_FIELDS_FOR_PROMPT)
    .in("id", leadIds);

  if (!leads || leads.length === 0) {
    return { processed: 0, matched: 0, errors: ["No leads found"], complete: false };
  }

  const leadMap = new Map(leads.map((l: any) => [l.id, l]));

  const batchInputs: BatchLeadInput[] = [];
  for (const item of claimed) {
    const lead = leadMap.get(item.lead_id);
    if (lead) {
      batchInputs.push({
        leadId: item.lead_id,
        leadBlock: formatLeadForIcp(lead),
      });
    }
  }

  // OpenAI is the only supported provider; Gemini support was removed.
  const model = job.model || OPENAI_DEFAULT_MODEL;
  const maxTokensPerLead = job.max_tokens ?? DEFAULT_MAX_TOKENS_PER_LEAD;

  let processed = 0;
  let matched = 0;
  const errors: string[] = [];
  let batchFailures = 0;
  const allBatchResults: Array<{
    job_item_id: string;
    lead_id: string;
    vertical_match: boolean;
    matched_vertical: string | null;
    reasoning: string;
    ai_response: Json;
  }> = [];

  const batches: BatchLeadInput[][] = [];
  for (let i = 0; i < batchInputs.length; i += LLM_BATCH_SIZE) {
    batches.push(batchInputs.slice(i, i + LLM_BATCH_SIZE));
  }

  const processBatchFn = async (batch: BatchLeadInput[]) => {
    const startedAt = Date.now();

    const logId = await createApiLog({
      user_id: job.user_id,
      project_id: job.project_id,
      lead_id: null,
      job_id: job.id,
      job_item_id: null,
      provider: "openai",
      operation: "icp_validation_batch",
      status: "success",
      request_metadata: {
        model,
        lead_count: batch.length,
        lead_ids: batch.map((b) => b.leadId),
      },
    });

    try {
      // The token limit is per lead, so a batch of N leads gets N times the
      // budget. A fixed limit for the whole batch truncated the JSON output.
      const llmOptions = {
        temperature: job.temperature ?? undefined,
        maxTokens: maxTokensPerLead * batch.length,
      };

      let usage: ProviderUsage;
      let results: Array<{ leadId: string; vertical_match: boolean; matched_vertical: string | null; reasoning: string }>;

      if (batch.length === 1) {
        const call = await callOpenAI(
          llmApiKey,
          model,
          ICP_SYSTEM_PROMPT,
          buildIcpUserPrompt(prompt, [batch[0].leadBlock]),
          llmOptions
        );
        usage = call.usage;
        results = [{ leadId: batch[0].leadId, ...call.data }];
      } else {
        const call = await callOpenAIBatch(
          llmApiKey,
          model,
          ICP_SYSTEM_PROMPT,
          prompt,
          batch,
          llmOptions
        );
        usage = call.usage;
        results = call.data;
      }

      const resultMap = new Map(results.map((r) => [r.leadId, r]));

      for (const input of batch) {
        const result = resultMap.get(input.leadId);
        if (!result) continue;

        const item = claimed.find((c: any) => c.lead_id === input.leadId);
        if (!item) continue;

        // Collect results for bulk RPC write — no per-lead DB calls
        allBatchResults.push({
          job_item_id: item.id,
          lead_id: input.leadId,
          vertical_match: result.vertical_match,
          matched_vertical: result.matched_vertical,
          reasoning: result.reasoning,
          // Passed as an object so the jsonb column stores JSON, not a
          // JSON-encoded string.
          ai_response: { ...result },
        });

        processed++;
        if (result.vertical_match) matched++;
      }

      const cost = calculateCost(model, usage);

      await updateApiLog(logId, {
        status: "success",
        duration_ms: Date.now() - startedAt,
        model,
        request_id: usage.requestId,
        leads_in_request: batch.length,
        input_tokens: usage.inputTokens,
        cached_input_tokens: usage.cachedInputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens,
        input_cost: cost.inputCost,
        cached_input_cost: cost.cachedInputCost,
        output_cost: cost.outputCost,
        total_cost: cost.totalCost,
        response_metadata: { processed: batch.length },
        raw_response: usage.rawResponse,
      });
    } catch (err: any) {
      const errorClass = classifyError(err.message);

      await updateApiLog(logId, {
        status: errorClass === "system" ? "fatal_error" :
                errorClass === "retryable" ? "retryable_error" : "failed",
        duration_ms: Date.now() - startedAt,
        model,
        error_message: err.message?.slice(0, 500),
        raw_error: err instanceof ProviderError ? err.rawError : null,
      });

      if (errorClass === "system") {
        await supabase
          .from("validation_jobs")
          .update({ status: "paused", error_message: `System error: ${err.message?.slice(0, 300)}` })
          .eq("id", jobId);
        throw err;
      }

      for (const input of batch) {
        const item = claimed.find((c: any) => c.lead_id === input.leadId);
        if (!item) continue;

        if (errorClass === "retryable" && item.attempt < item.max_attempts) {
          // Non-blocking retry: set next_attempt_at for database-level backoff scheduling
          const delayMs = backoffDelay(item.attempt);
          await supabase
            .from("validation_job_items")
            .update({
              status: "pending",
              lease_expires_at: null,
              next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
              error_message: err.message?.slice(0, 500),
            })
            .eq("id", item.id);
        } else {
          await supabase
            .from("validation_job_items")
            .update({ status: "failed", error_message: err.message?.slice(0, 500), completed_at: new Date().toISOString() })
            .eq("id", item.id);
          batchFailures++;
        }
      }

      errors.push(`Batch failed: ${err.message?.slice(0, 200)}`);
    }
  };

  let systemError: string | null = null;
  for (let i = 0; i < batches.length && !systemError; i += MAX_CONCURRENT) {
    const concurrent = batches.slice(i, i + MAX_CONCURRENT);
    // allSettled, not all: a system error in one batch must not throw away
    // the results the other batch already paid for.
    const settled = await Promise.allSettled(concurrent.map((b) => processBatchFn(b)));
    const rejected = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (rejected) systemError = rejected.reason?.message?.slice(0, 200) ?? "System error";
  }

  // Atomic bulk write: single RPC call verifies lease ownership and writes all results
  if (allBatchResults.length > 0) {
    const { data: appliedCount, error: applyError } = await supabase.rpc("apply_icp_results", {
      p_updates: allBatchResults,
    });
    if (applyError) {
      // Items stay leased and are re-claimed after the lease expires.
      errors.push(`Failed to save results: ${applyError.message.slice(0, 200)}`);
      processed = 0;
      matched = 0;
    } else if (Number(appliedCount ?? 0) < allBatchResults.length) {
      errors.push(
        `${allBatchResults.length - Number(appliedCount ?? 0)} result(s) discarded because their lease expired`
      );
    }
  }

  if (systemError) {
    await recalculateJobProgress(supabase, jobId);
    return { processed, matched, errors, complete: false, paused: true, pausedReason: systemError };
  }

  const openItems = await countOpenItems(supabase, jobId);

  if (openItems === 0) {
    // All items done: finalize includes progress counts
    await finalizeJob(supabase, jobId);
    return { processed, matched, errors: errors.slice(0, 5), complete: true };
  }

  // Intermediate progress: recalculate counts without finalizing
  await recalculateJobProgress(supabase, jobId);

  if (shouldPauseJob((job.failed_leads ?? 0) + batchFailures, (job.completed_leads ?? 0) + processed)) {
    await supabase
      .from("validation_jobs")
      .update({ status: "paused", error_message: "Auto-paused: failure rate exceeded 50%" })
      .eq("id", jobId);
    return { processed, matched, errors: errors.slice(0, 5), complete: false, paused: true, pausedReason: "Auto-paused: failure rate exceeded 50%" };
  }

  return { processed, matched, errors: errors.slice(0, 5), complete: false };
}

async function claimBatch(
  supabase: any,
  jobId: string,
  limit: number,
  leaseSeconds: number = 60
): Promise<any[]> {
  const { data, error } = await supabase.rpc("claim_job_items", {
    p_job_id: jobId,
    p_batch_size: limit,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(`Failed to claim items: ${error.message}`);
  return data ?? [];
}

const EMAIL_FIELDS = "id, email";

export async function processEmailBatch(
  jobId: string,
  clearoutApiKey: string
): Promise<{
  processed: number;
  valid: number;
  invalid: number;
  errors: string[];
  complete: boolean;
  paused?: boolean;
  pausedReason?: string;
  providerRateLimited?: boolean;
  resetAt?: string | null;
}> {
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("validation_jobs")
    .select(JOB_FIELDS)
    .eq("id", jobId)
    .single();

  if (!job) throw new Error("Job not found");

  if (TERMINAL_JOB_STATUSES.includes(job.status)) {
    return { processed: 0, valid: 0, invalid: 0, errors: [], complete: true };
  }

  const completedLeads = job.completed_leads ?? 0;
  const failedLeads = job.failed_leads ?? 0;

  const providerResetAt = job.provider_reset_at ? new Date(job.provider_reset_at) : null;

  if (providerResetAt && providerResetAt.getTime() > Date.now()) {
    return {
      processed: 0,
      valid: 0,
      invalid: 0,
      errors: [],
      complete: false,
      paused: true,
      pausedReason: "Clearout rate limit reached. Validation is paused.",
      providerRateLimited: true,
      resetAt: providerResetAt.toISOString(),
    };
  }

  const requestsPerMinute = Number.isInteger(job.requests_per_minute)
    ? (job.requests_per_minute as number)
    : DEFAULT_CLEAROUT_RPM;
  const timeoutSeconds = Number.isInteger(job.timeout_seconds)
    ? (job.timeout_seconds as number)
    : DEFAULT_CLEAROUT_TIMEOUT_SECONDS;
  const timeoutMs = clearoutTimeoutMs(timeoutSeconds);

  if (job.status === "queued" || job.status === "paused") {
    await supabase
      .from("validation_jobs")
      .update({
        status: "running",
        started_at: job.started_at ?? new Date().toISOString(),
        provider_reset_at: null,
      })
      .eq("id", jobId);
  }

  let processed = 0;
  let valid = 0;
  let invalid = 0;
  const errors: string[] = [];
  let batchFailures = 0;

  // Clearout requests are intentionally serial. Reserve the rate-limit slot
  // first, wait for it, then claim exactly one item with a lease that covers
  // the configured timeout plus a small buffer. Throughput is governed by the
  // persisted slot reservation below, not by concurrency.
  //
  // The loop is bounded by EMAIL_TIME_BUDGET_MS so a single request never
  // outlives the serverless function limit. Before this bound, one request
  // tried to verify the whole job (200 leads at 3 rpm is ~66 minutes).
  const loopStartedAt = Date.now();
  let iterations = 0;
  while (true) {
    // Always do at least one item, then stop starting new ones once the
    // budget is used. Worst case for the last item is budget + one slot wait
    // (<= 60s) + Clearout timeout (<= 120s), inside the route's maxDuration.
    if (iterations > 0 && Date.now() - loopStartedAt > EMAIL_TIME_BUDGET_MS) {
      break;
    }
    iterations++;

    let fireAt: Date;
    try {
      fireAt = await reserveClearoutRequestSlot(supabase, job.user_id, requestsPerMinute);
    } catch (err: any) {
      await supabase
        .from("validation_jobs")
        .update({ status: "paused", error_message: `System error: ${err.message?.slice(0, 300)}` })
        .eq("id", jobId);
      return { processed, valid, invalid, errors, complete: false, paused: true, pausedReason: err.message?.slice(0, 200) };
    }

    if (fireAt.getTime() > Date.now()) {
      await sleepUntil(fireAt);
    }

    const leaseSeconds = Math.ceil(timeoutMs / 1000) + 15;
    const claimed = await claimBatch(supabase, jobId, 1, leaseSeconds);
    if (claimed.length === 0) {
      // Nothing claimable right now (done, or remaining items are backing off).
      break;
    }

    const item = claimed[0];
    const { data: leadRows } = await supabase
      .from("leads")
      .select(EMAIL_FIELDS)
      .eq("id", item.lead_id)
      .maybeSingle();

    if (!leadRows) {
      // Lead was deleted; fail the item so it does not wedge the job.
      await supabase.from("validation_job_items")
        .update({ status: "failed", error_message: "Lead not found", completed_at: new Date().toISOString() })
        .eq("id", item.id);
      batchFailures++;
      continue;
    }

    const lead = leadRows;
    const startedAt = Date.now();
    const logId = await createApiLog({
      user_id: job.user_id,
      project_id: job.project_id,
      lead_id: lead.id,
      job_id: job.id,
      job_item_id: item.id,
      provider: "clearout",
      operation: "email_verification",
      status: "success",
      request_metadata: { email_provided: true },
    });

    let parsedResult: ReturnType<typeof parseClearout> | null = null;
    let rawResult: unknown = null;
    let providerRateLimited = false;
    let resetAt: string | null = null;

    try {
      const result = await callClearout(clearoutApiKey, lead.email, timeoutMs);
      rawResult = result;
      parsedResult = parseClearout(result);
    } catch (err: any) {
      if (isClearoutProviderRateLimit(err)) {
        providerRateLimited = true;
        resetAt = clearoutRateLimitResetAt(err);
        await updateApiLog(logId, {
          status: "retryable_error",
          duration_ms: Date.now() - startedAt,
          http_status: err.httpStatus,
          error_code: err.errorCode != null ? String(err.errorCode) : null,
          error_message: err.message?.slice(0, 500),
          raw_error: err.rawError,
        });
      } else {
        const errorClass = classifyError(err.message);
        await updateApiLog(logId, {
          status: errorClass === "system" ? "fatal_error" :
                  errorClass === "retryable" ? "retryable_error" : "failed",
          duration_ms: Date.now() - startedAt,
          http_status: err instanceof ClearoutError ? err.httpStatus : null,
          error_message: err.message?.slice(0, 500),
          raw_error: err instanceof ClearoutError ? err.rawError : null,
        });

        if (errorClass === "system") {
          await supabase
            .from("validation_jobs")
            .update({ status: "paused", error_message: `System error: ${err.message?.slice(0, 300)}` })
            .eq("id", jobId);
          return { processed, valid, invalid, errors, complete: false, paused: true, pausedReason: err.message?.slice(0, 200) };
        }

        if (errorClass === "retryable" && item.attempt < item.max_attempts) {
          const delayMs = backoffDelay(item.attempt);
          await supabase.from("validation_job_items")
            .update({
              status: "pending",
              lease_expires_at: null,
              next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
              error_message: err.message?.slice(0, 500),
            })
            .eq("id", item.id);
        } else {
          await supabase.from("validation_job_items")
            .update({ status: "failed", error_message: err.message?.slice(0, 500), completed_at: new Date().toISOString() })
            .eq("id", item.id);
          batchFailures++;
        }

        continue;
      }
    }

    if (providerRateLimited) {
      const effectiveResetAt = resetAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await releaseRateLimitedItems(supabase, jobId, effectiveResetAt);
      await pauseJobForRateLimit(supabase, jobId, effectiveResetAt);
      await recalculateJobProgress(supabase, jobId);

      return {
        processed,
        valid,
        invalid,
        errors: [...errors, "Clearout rate limit reached. Validation is paused."],
        complete: false,
        paused: true,
        pausedReason: "Clearout rate limit reached. Validation is paused.",
        providerRateLimited: true,
        resetAt: effectiveResetAt,
      };
    }

    // parsedResult is guaranteed non-null here (no 429, no other throw).
    const check = parsedResult!;
    const update = {
      job_item_id: item.id,
      lead_id: lead.id,
      email_check: check.status === "valid" ? "Valid" : check.status === "invalid" ? "Invalid" : "Unknown",
      safe_to_send: check.safe_to_send,
      status: check.status,
      smtp_provider: check.smtp_provider,
      mx_record: check.mx_record,
      email_score: check.score,
      account: check.account,
      clearout_domain: check.domain,
    };

    const applied = await applyEmailResult(supabase, update);
    if (!applied) {
      await updateApiLog(logId, {
        status: "retryable_error",
        duration_ms: Date.now() - startedAt,
        http_status: 200,
        error_message: "Clearout succeeded but the result could not be applied (lease expired or RPC unavailable).",
        raw_response: rawResult,
      });

      await supabase.from("validation_job_items")
        .update({
          status: "pending",
          lease_expires_at: null,
          next_attempt_at: new Date(Date.now() + 1000).toISOString(),
          error_message: "Clearout result could not be applied; retrying.",
        })
        .eq("id", item.id);

      continue;
    }

    await updateApiLog(logId, {
      status: "success",
      duration_ms: Date.now() - startedAt,
      http_status: 200,
      leads_in_request: 1,
      response_metadata: { status: check.status, safe_to_send: check.safe_to_send },
      raw_response: rawResult,
    });

    processed++;
    if (update.email_check === "Valid") valid++;
    else if (update.email_check === "Invalid") invalid++;
  }

  const openItems = await countOpenItems(supabase, jobId);

  if (openItems === 0) {
    await finalizeJob(supabase, jobId);
    return { processed, valid, invalid, errors: errors.slice(0, 5), complete: true };
  }

  await recalculateJobProgress(supabase, jobId);

  if (shouldPauseJob(failedLeads + batchFailures, completedLeads + processed)) {
    await supabase
      .from("validation_jobs")
      .update({ status: "paused", error_message: "Auto-paused: failure rate exceeded 50%" })
      .eq("id", jobId);
    return { processed, valid, invalid, errors: errors.slice(0, 5), complete: false, paused: true, pausedReason: "Auto-paused: failure rate exceeded 50%" };
  }

  return { processed, valid, invalid, errors: errors.slice(0, 5), complete: false };
}

async function countOpenItems(supabase: any, jobId: string): Promise<number> {
  const { count, error } = await supabase
    .from("validation_job_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .in("status", ["pending", "processing"]);
  if (error) throw new Error(`Failed to count open items: ${error.message}`);
  return count ?? 0;
}

async function reserveClearoutRequestSlot(
  supabase: any,
  userId: string,
  requestsPerMinute: number
): Promise<Date> {
  const { data, error } = await supabase.rpc("reserve_clearout_request_slot", {
    p_user_id: userId,
    p_requests_per_minute: requestsPerMinute,
  });

  if (error) {
    // Fall back to a conservative in-process delay rather than sending
    // un-paced requests. Never call Clearout without some guard.
    return new Date(Date.now() + spacingToMs(requestsPerMinute));
  }

  const ts = Array.isArray(data) ? (data as any)[0] : data;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? new Date(Date.now() + spacingToMs(requestsPerMinute)) : new Date(ms);
}

function spacingToMs(requestsPerMinute: number): number {
  const safe = Math.max(1, Math.min(requestsPerMinute, 1000));
  return Math.ceil(60000 / safe);
}

async function sleepUntil(fireAt: Date) {
  const waitMs = fireAt.getTime() - Date.now();
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

async function applyEmailResult(
  supabase: any,
  update: {
    job_item_id: string;
    lead_id: string;
    email_check: string;
    safe_to_send: boolean;
    status: string;
    smtp_provider: string | null;
    mx_record: string | null;
    email_score: number | null;
    account: string | null;
    clearout_domain: string | null;
  }
): Promise<boolean> {
  const { data, error } = await supabase.rpc("apply_email_results", {
    p_updates: [update],
  });

  if (error) return false;
  return Number(data ?? 0) > 0;
}

async function releaseRateLimitedItems(supabase: any, jobId: string, resetAt: string) {
  const { error } = await supabase.rpc("release_rate_limited_items", {
    p_job_id: jobId,
    p_reset_at: resetAt,
  });
  if (error) {
    // Best-effort release; the job pause below is still authoritative.
    console.error("release_rate_limited_items failed", error.message);
  }
}

async function pauseJobForRateLimit(supabase: any, jobId: string, resetAt: string) {
  await supabase
    .from("validation_jobs")
    .update({
      status: "paused",
      provider_reset_at: resetAt,
      error_message: "Clearout rate limit reached. Validation is paused and will continue after the limit resets.",
    })
    .eq("id", jobId);
}

async function recalculateJobProgress(supabase: any, jobId: string) {
  const { data: items } = await supabase.from("validation_job_items").select("status").eq("job_id", jobId);
  if (!items) return;
  const completed = items.filter((i: any) => i.status === "completed").length;
  const failed = items.filter((i: any) => i.status === "failed").length;
  await supabase.from("validation_jobs").update({ completed_leads: completed, failed_leads: failed }).eq("id", jobId);
}

async function finalizeJob(supabase: any, jobId: string) {
  const { data: items } = await supabase.from("validation_job_items").select("status").eq("job_id", jobId);
  if (!items) return;
  const hasFailures = items.some((i: any) => i.status === "failed");
  const status = hasFailures ? "completed_with_errors" : "completed";
  const completed = items.filter((i: any) => i.status === "completed").length;
  const failed = items.filter((i: any) => i.status === "failed").length;
  await supabase
    .from("validation_jobs")
    .update({ status, completed_at: new Date().toISOString(), completed_leads: completed, failed_leads: failed })
    .eq("id", jobId);
}
