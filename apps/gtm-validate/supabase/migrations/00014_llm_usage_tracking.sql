-- 00014_llm_usage_tracking.sql
-- Phase 2: capture actual LLM usage, cost, and validation-run aggregation.
--
-- Request-level facts are stored on api_operation_logs. Run-level aggregates are
-- derived from those logs via the get_validation_run_stats RPC (no duplicated
-- counters on validation_jobs that could drift).

-- ============================================================================
-- api_operation_logs usage columns
-- ============================================================================

ALTER TABLE api_operation_logs
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS leads_in_request INTEGER,
  ADD COLUMN IF NOT EXISTS input_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS cached_input_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS output_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS total_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS input_cost DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS cached_input_cost DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS output_cost DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS total_cost DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS raw_response JSONB,
  ADD COLUMN IF NOT EXISTS raw_error JSONB;

-- request_id is useful for tracing but must never be an auth credential.
-- No API keys are stored here.

CREATE INDEX IF NOT EXISTS idx_api_logs_model ON api_operation_logs(model);
CREATE INDEX IF NOT EXISTS idx_api_logs_request_id ON api_operation_logs(request_id);

-- ============================================================================
-- Validation run aggregation
-- ============================================================================

-- One row per validation_jobs with usage/cost rolled up from api_operation_logs
-- and per-lead outcomes rolled up from validation_job_items.
CREATE OR REPLACE FUNCTION get_validation_run_stats(p_job_id UUID)
RETURNS TABLE(
  leads_requested BIGINT,
  leads_processed BIGINT,
  successful BIGINT,
  failed BIGINT,
  matched BIGINT,
  no_match BIGINT,
  api_requests BIGINT,
  input_tokens BIGINT,
  cached_input_tokens BIGINT,
  output_tokens BIGINT,
  total_tokens BIGINT,
  total_cost DOUBLE PRECISION,
  total_duration_ms BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH item_stats AS (
    SELECT
      COUNT(*) AS leads_requested,
      COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) AS leads_processed,
      COUNT(*) FILTER (WHERE status = 'completed') AS successful,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed
    FROM validation_job_items
    WHERE job_id = p_job_id
  ),
  lead_match AS (
    SELECT
      COUNT(*) FILTER (WHERE vertical_match = true) AS matched,
      COUNT(*) FILTER (WHERE vertical_match = false) AS no_match
    FROM leads l
    INNER JOIN validation_job_items vji ON vji.lead_id = l.id
    WHERE vji.job_id = p_job_id
      AND vji.status = 'completed'
  ),
  api_stats AS (
    SELECT
      COUNT(*) AS api_requests,
      -- Distinguish "no usage data available" from actual zero usage.
      -- Providers like Gemini currently store null token/cost values.
      bool_or(
        input_tokens IS NOT NULL
        OR cached_input_tokens IS NOT NULL
        OR output_tokens IS NOT NULL
        OR total_tokens IS NOT NULL
        OR total_cost IS NOT NULL
      ) AS has_usage,
      SUM(input_tokens) AS input_tokens,
      SUM(cached_input_tokens) AS cached_input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(total_tokens) AS total_tokens,
      SUM(total_cost) AS total_cost,
      COALESCE(SUM(duration_ms), 0) AS total_duration_ms
    FROM api_operation_logs
    WHERE job_id = p_job_id
  )
  SELECT
    i.leads_requested,
    i.leads_processed,
    i.successful,
    i.failed,
    COALESCE(m.matched, 0),
    COALESCE(m.no_match, 0),
    a.api_requests,
    CASE WHEN a.has_usage THEN COALESCE(a.input_tokens, 0) ELSE NULL END,
    CASE WHEN a.has_usage THEN COALESCE(a.cached_input_tokens, 0) ELSE NULL END,
    CASE WHEN a.has_usage THEN COALESCE(a.output_tokens, 0) ELSE NULL END,
    CASE WHEN a.has_usage THEN COALESCE(a.total_tokens, 0) ELSE NULL END,
    CASE WHEN a.has_usage THEN a.total_cost ELSE NULL END,
    a.total_duration_ms
  FROM item_stats i
  CROSS JOIN lead_match m
  CROSS JOIN api_stats a;
$$;
