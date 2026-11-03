-- validation_jobs: represents one complete validation run
-- One job per user+project+type when active (prevent duplicate processing)

CREATE TABLE validation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('icp', 'email')),
  mode TEXT NOT NULL CHECK (mode IN ('selected', 'continuous')),
  prompt TEXT,
  model TEXT DEFAULT 'gemini-3.6-flash',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','paused','completed','completed_with_errors','failed','cancelled')),
  total_leads INTEGER NOT NULL DEFAULT 0,
  completed_leads INTEGER NOT NULL DEFAULT 0,
  failed_leads INTEGER NOT NULL DEFAULT 0,
  skipped_leads INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_validation_jobs_updated_at
  BEFORE UPDATE ON validation_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_validation_jobs_user_project ON validation_jobs(user_id, project_id);
CREATE INDEX idx_validation_jobs_status ON validation_jobs(status);

ALTER TABLE validation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User owns validation jobs" ON validation_jobs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Prevent duplicate active jobs for same user+project+type
CREATE UNIQUE INDEX idx_active_validation_jobs
  ON validation_jobs(user_id, project_id, type)
  WHERE status IN ('queued', 'running', 'paused');
