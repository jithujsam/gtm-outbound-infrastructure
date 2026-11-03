-- 00016_clearout_rate_limit_settings.sql
-- User-configurable Clearout rate limits and request timeouts, plus a
-- persisted, atomic request-slot reservation for provider pacing.

-- 1. Per-user Clearout settings (defaults match the previous hard-coded values).
ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS clearout_requests_per_minute INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS clearout_timeout_seconds INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS clearout_next_request_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'integration_settings_clearout_rpm_check'
  ) THEN
    ALTER TABLE integration_settings
      ADD CONSTRAINT integration_settings_clearout_rpm_check
      CHECK (clearout_requests_per_minute >= 1 AND clearout_requests_per_minute <= 1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'integration_settings_clearout_timeout_check'
  ) THEN
    ALTER TABLE integration_settings
      ADD CONSTRAINT integration_settings_clearout_timeout_check
      CHECK (clearout_timeout_seconds >= 5 AND clearout_timeout_seconds <= 120);
  END IF;
END $$;

-- 2. Job-level snapshot of the effective settings, for run reproducibility.
ALTER TABLE validation_jobs
  ADD COLUMN IF NOT EXISTS requests_per_minute INTEGER,
  ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER;

-- 3. Atomic Clearout request-slot reservation.
-- Serializes Clearout callers across browser tabs, process calls, serverless
-- instances, and cold starts. Returns the earliest timestamp the caller may fire.
CREATE OR REPLACE FUNCTION reserve_clearout_request_slot(
  p_user_id UUID,
  p_requests_per_minute INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_spacing INTERVAL;
  v_now TIMESTAMPTZ := NOW();
  v_fire_at TIMESTAMPTZ;
  v_next_at TIMESTAMPTZ;
BEGIN
  IF p_requests_per_minute IS NULL OR p_requests_per_minute < 1
     OR p_requests_per_minute > 1000 THEN
    RAISE EXCEPTION 'requests_per_minute out of range';
  END IF;

  v_spacing := make_interval(secs => 60.0 / p_requests_per_minute);

  SELECT clearout_next_request_at
    INTO v_next_at
    FROM integration_settings
    WHERE user_id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'integration settings not found for user';
  END IF;

  IF v_next_at IS NULL OR v_next_at <= v_now THEN
    v_fire_at := v_now;
    v_next_at := v_now + v_spacing;
  ELSE
    v_fire_at := v_next_at;
    v_next_at := v_next_at + v_spacing;
  END IF;

  UPDATE integration_settings
    SET clearout_next_request_at = v_next_at,
        updated_at = v_now
    WHERE user_id = p_user_id;

  RETURN v_fire_at;
END;
$$;
