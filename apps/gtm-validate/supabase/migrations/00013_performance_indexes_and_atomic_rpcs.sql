-- 00013_performance_indexes_and_atomic_rpcs.sql
-- Phase 0: Performance indexes, retry backoff, atomic result-write RPCs

-- ============================================================================
-- INDEXES
-- ============================================================================

-- 0a. Composite index for dominant leads query pattern (project_id + user_id)
-- Justification: Every leads query in the codebase filters on both columns.
-- leads/route.ts, stats/route.ts, jobs.ts, validate/email/route.ts, validate/icp/route.ts
CREATE INDEX IF NOT EXISTS idx_leads_project_user ON leads(project_id, user_id);

-- 0b. FK index: prevents full table scans on cascade deletes from leads
-- Justification: leads(id) has ON DELETE CASCADE to validation_job_items(lead_id)
CREATE INDEX IF NOT EXISTS idx_job_items_lead ON validation_job_items(lead_id);

-- 0c. Composite claim index for claim_job_items RPC performance
-- Justification: RPC filters on (job_id, status) and orders by created_at.
-- Existing idx_job_items_job_status requires an extra sort pass.
CREATE INDEX IF NOT EXISTS idx_job_items_claim_opt ON validation_job_items(job_id, status, created_at);

-- 0d. Composite listing index for default leads pagination
-- Justification: The default leads listing sort at leads/route.ts and page.tsx
-- uses ORDER BY created_at DESC with project_id + user_id filter.
CREATE INDEX IF NOT EXISTS idx_leads_project_user_created ON leads(project_id, user_id, created_at DESC);

-- ============================================================================
-- RETRY BACKOFF COLUMN
-- ============================================================================

-- 0e. Add next_attempt_at for database-level retry scheduling
ALTER TABLE validation_job_items ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- ============================================================================
-- UPDATED claim_job_items RPC (with next_attempt_at filter)
-- ============================================================================

-- 0f. Replaces 00011_fix_claim_job_items_ambiguous_id.sql
-- Added: pending items must have next_attempt_at IS NULL or <= NOW()
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

-- ============================================================================
-- ATOMIC RESULT-WRITE RPCs
-- ============================================================================

-- 0g. apply_icp_results: atomically verifies lease ownership before writing ICP results.
-- Returns count of items actually applied (0 if all leases expired).
-- Single transaction: verifies status='processing' AND lease_expires_at > NOW(),
-- then updates leads + validation_job_items in one atomic operation.
CREATE OR REPLACE FUNCTION apply_icp_results(p_updates JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH valid_items AS (
    SELECT
      u.job_item_id,
      u.lead_id,
      u.vertical_match,
      u.matched_vertical,
      u.reasoning,
      u.ai_response
    FROM jsonb_to_recordset(p_updates) AS u(
      job_item_id UUID,
      lead_id UUID,
      vertical_match BOOLEAN,
      matched_vertical TEXT,
      reasoning TEXT,
      ai_response JSONB
    )
    INNER JOIN validation_job_items vji
      ON vji.id = u.job_item_id
      AND vji.lead_id = u.lead_id
      AND vji.status = 'processing'
      AND vji.lease_expires_at > NOW()
  ),
  updated_leads AS (
    UPDATE leads SET
      vertical_match = vi.vertical_match,
      matched_vertical = vi.matched_vertical,
      reasoning = vi.reasoning,
      ai_response = vi.ai_response::TEXT
    FROM valid_items vi
    WHERE leads.id = vi.lead_id
    RETURNING vi.job_item_id
  ),
  updated_items AS (
    UPDATE validation_job_items SET
      status = 'completed',
      completed_at = NOW(),
      lease_expires_at = NULL
    FROM updated_leads ul
    WHERE validation_job_items.id = ul.job_item_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated_items;
  RETURN v_count;
END;
$$;

-- 0h. apply_email_results: atomically verifies lease ownership before writing email results.
-- Same pattern as apply_icp_results but for email validation columns.
CREATE OR REPLACE FUNCTION apply_email_results(p_updates JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH valid_items AS (
    SELECT
      u.job_item_id,
      u.lead_id,
      u.email_check,
      u.safe_to_send,
      u.email_score,
      u.status,
      u.smtp_provider,
      u.mx_record,
      u.account,
      u.clearout_domain
    FROM jsonb_to_recordset(p_updates) AS u(
      job_item_id UUID,
      lead_id UUID,
      email_check TEXT,
      safe_to_send BOOLEAN,
      email_score INTEGER,
      status TEXT,
      smtp_provider TEXT,
      mx_record TEXT,
      account TEXT,
      clearout_domain TEXT
    )
    INNER JOIN validation_job_items vji
      ON vji.id = u.job_item_id
      AND vji.lead_id = u.lead_id
      AND vji.status = 'processing'
      AND vji.lease_expires_at > NOW()
  ),
  updated_leads AS (
    UPDATE leads SET
      email_check = vi.email_check,
      safe_to_send = vi.safe_to_send,
      email_score = vi.email_score,
      status = vi.status,
      smtp_provider = vi.smtp_provider,
      mx_record = vi.mx_record,
      account = vi.account,
      clearout_domain = vi.clearout_domain
    FROM valid_items vi
    WHERE leads.id = vi.lead_id
    RETURNING vi.job_item_id
  ),
  updated_items AS (
    UPDATE validation_job_items SET
      status = 'completed',
      completed_at = NOW(),
      lease_expires_at = NULL
    FROM updated_leads ul
    WHERE validation_job_items.id = ul.job_item_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated_items;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- STATS AGGREGATION RPC
-- ============================================================================

-- Replaces in-memory JavaScript aggregation in stats/route.ts with a single SQL query.
-- Returns one row containing all six aggregate counts.
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
SECURITY DEFINER
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
    AND user_id = p_user_id;
$$;

-- Replaces unbounded row fetch in dashboard page with a single GROUP BY query.
-- Returns one row per vertical with its count, scoped to the authenticated user.
CREATE OR REPLACE FUNCTION get_dashboard_vertical_breakdown()
RETURNS TABLE(matched_vertical TEXT, count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT leads.matched_vertical, COUNT(*)::BIGINT
  FROM leads
  WHERE leads.vertical_match = true
    AND leads.matched_vertical IS NOT NULL
    AND leads.user_id = auth.uid()
  GROUP BY leads.matched_vertical
  ORDER BY count DESC;
$$;
