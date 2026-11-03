-- 00015_clearout_rate_limit.sql
-- Provider-level rate-limit handling for Clearout email validation.
--
-- A Clearout HTTP 429 with error code 1030 is a provider-wide rate limit,
-- NOT a lead validation failure. Rate-limited leads stay pending until the
-- provider reset time passes.

-- Job-level reset time so the paused email job knows when to resume.
ALTER TABLE validation_jobs
  ADD COLUMN IF NOT EXISTS provider_reset_at TIMESTAMPTZ;

-- Release all processing items for an email job when Clearout rate limits.
-- Leaves completed and genuinely failed items untouched, clears leases, and
-- schedules the next attempt at the provider reset time.
CREATE OR REPLACE FUNCTION release_rate_limited_items(
  p_job_id UUID,
  p_reset_at TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE validation_job_items
  SET status = 'pending',
      lease_expires_at = NULL,
      next_attempt_at = p_reset_at,
      attempt = GREATEST(attempt - 1, 0),
      error_message = 'Clearout provider rate limit; retry after reset'
  WHERE job_id = p_job_id
    AND status = 'processing';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
