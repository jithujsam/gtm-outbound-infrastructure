-- 00017_harden_rpc_permissions.sql
-- Security hardening for the RPCs added in 00009-00016.
--
-- Problem: these functions were SECURITY DEFINER, so they ran as the table
-- owner and bypassed RLS, and Postgres grants EXECUTE to PUBLIC by default.
-- Any signed-in user (or the anon role) could call them with another user's
-- job / lead / user IDs. get_project_stats and reserve_clearout_request_slot
-- also trusted a caller-supplied p_user_id.
--
-- Fix: the app always calls them with the signed-in user's own session, and
-- every table they touch (validation_jobs, validation_job_items, leads,
-- integration_settings) already has "user owns row" RLS. Running the functions
-- as SECURITY INVOKER makes that RLS apply inside them, so ownership is
-- enforced by the database. We also remove the default PUBLIC/anon EXECUTE.

ALTER FUNCTION claim_job_items(UUID, INTEGER, INTEGER) SECURITY INVOKER;
ALTER FUNCTION apply_icp_results(JSONB) SECURITY INVOKER;
ALTER FUNCTION apply_email_results(JSONB) SECURITY INVOKER;
ALTER FUNCTION release_rate_limited_items(UUID, TIMESTAMPTZ) SECURITY INVOKER;
ALTER FUNCTION reserve_clearout_request_slot(UUID, INTEGER) SECURITY INVOKER;
ALTER FUNCTION get_project_stats(UUID, UUID) SECURITY INVOKER;
ALTER FUNCTION get_dashboard_vertical_breakdown() SECURITY INVOKER;
ALTER FUNCTION get_validation_run_stats(UUID) SECURITY INVOKER;

-- Never let a caller reserve a rate-limit slot for someone else's account.
CREATE OR REPLACE FUNCTION reserve_clearout_request_slot(
  p_user_id UUID,
  p_requests_per_minute INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  v_spacing INTERVAL;
  v_now TIMESTAMPTZ := NOW();
  v_fire_at TIMESTAMPTZ;
  v_next_at TIMESTAMPTZ;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

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

-- get_project_stats is scoped by the caller's identity, not a parameter.
CREATE OR REPLACE FUNCTION get_project_stats(p_project_id UUID, p_user_id UUID)
RETURNS TABLE(
  total BIGINT,
  email_valid BIGINT,
  email_invalid BIGINT,
  icp_match BIGINT,
  icp_no_match BIGINT,
  safe_to_send BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE email_check = 'Valid'),
    COUNT(*) FILTER (WHERE email_check = 'Invalid'),
    COUNT(*) FILTER (WHERE vertical_match = true),
    COUNT(*) FILTER (WHERE vertical_match = false),
    COUNT(*) FILTER (WHERE safe_to_send = true AND vertical_match = true)
  FROM leads
  WHERE project_id = p_project_id
    AND user_id = auth.uid()
    AND p_user_id = auth.uid();
$$;

-- Only signed-in users may call these; anon and PUBLIC may not.
REVOKE EXECUTE ON FUNCTION claim_job_items(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION apply_icp_results(JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION apply_email_results(JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION release_rate_limited_items(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION reserve_clearout_request_slot(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_project_stats(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_dashboard_vertical_breakdown() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_validation_run_stats(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION claim_job_items(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_icp_results(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_email_results(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION release_rate_limited_items(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION reserve_clearout_request_slot(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_stats(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_vertical_breakdown() TO authenticated;
GRANT EXECUTE ON FUNCTION get_validation_run_stats(UUID) TO authenticated;
