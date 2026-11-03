-- 00018_cap_lease_reclaim_attempts.sql
-- Stop expired leases from being re-claimed forever.
--
-- Problem: claim_job_items (00013) re-claims any 'processing' item whose
-- lease has expired and increments `attempt`, but never compares `attempt`
-- with `max_attempts`. An item whose worker keeps dying (request timeout,
-- crash, lost result write) was retried without limit, so the job could
-- never finish and every retry was billed by the provider.
--
-- Fix: before claiming, fail items (expired-lease or pending) that have used all their
-- attempts, and only claim items that still have an attempt left.
-- Security model is unchanged from 00017 (SECURITY INVOKER, RLS applies).

CREATE OR REPLACE FUNCTION claim_job_items(
  p_job_id UUID,
  p_batch_size INTEGER,
  p_lease_seconds INTEGER
)
RETURNS TABLE(
  id UUID,
  lead_id UUID,
  attempt INTEGER,
  max_attempts INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
#variable_conflict use_column
BEGIN
  UPDATE validation_job_items
  SET status = 'failed',
      lease_expires_at = NULL,
      completed_at = NOW(),
      error_message = COALESCE(error_message, 'No attempts left')
  WHERE job_id = p_job_id
    AND attempt >= max_attempts
    AND (
      (status = 'processing' AND lease_expires_at < NOW())
      OR status = 'pending'
    );

  RETURN QUERY
  WITH claimed AS (
    UPDATE validation_job_items
    SET status = 'processing',
        lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
        attempt = attempt + 1,
        started_at = NOW()
    WHERE id IN (
      SELECT vji.id
      FROM validation_job_items vji
      WHERE vji.job_id = p_job_id
        AND vji.attempt < vji.max_attempts
        AND (
          (vji.status = 'pending' AND (vji.next_attempt_at IS NULL OR vji.next_attempt_at <= NOW()))
          OR (vji.status = 'processing' AND vji.lease_expires_at < NOW())
        )
      ORDER BY vji.created_at
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    RETURNING validation_job_items.id, validation_job_items.lead_id,
              validation_job_items.attempt, validation_job_items.max_attempts
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_job_items(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_job_items(UUID, INTEGER, INTEGER) TO authenticated;
