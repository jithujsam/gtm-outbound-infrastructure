-- claim_job_items: atomic batch claim with lease protection
-- Uses SELECT FOR UPDATE-style locking via UPDATE...RETURNING
-- Prevents two processors from claiming the same item

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
SECURITY DEFINER
SET search_path = 'public'
AS $$
#variable_conflict use_column
BEGIN
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
        AND (
          vji.status = 'pending'
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
