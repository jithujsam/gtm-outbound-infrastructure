-- validation_job_items: one record per lead in a validation job
-- Tracks per-lead processing state, retry count, and lease expiry

CREATE TABLE validation_job_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES validation_jobs(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','skipped')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  lease_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, lead_id)
);

CREATE INDEX idx_job_items_job_status ON validation_job_items(job_id, status);
CREATE INDEX idx_job_items_claim ON validation_job_items(status, lease_expires_at)
  WHERE status IN ('pending','processing');

ALTER TABLE validation_job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User owns job items via jobs" ON validation_job_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM validation_jobs
      WHERE validation_jobs.id = validation_job_items.job_id
        AND validation_jobs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM validation_jobs
      WHERE validation_jobs.id = validation_job_items.job_id
        AND validation_jobs.user_id = auth.uid()
    )
  );
