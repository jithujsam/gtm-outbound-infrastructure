-- api_operation_logs: central logging for all external API calls
-- Every Gemini, Clearout, and future API attempt is recorded here
--
-- SECURITY: Never log API keys, passwords, tokens, cookies, or authorization headers.
-- request_metadata and response_metadata should contain only safe fields:
--   tokens, model, status codes, lead counts, attempt numbers.

CREATE TABLE api_operation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  lead_id UUID,
  job_id UUID,
  job_item_id UUID,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'clearout')),
  operation TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('success', 'failed', 'retryable_error', 'fatal_error')),
  attempt INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER,
  http_status INTEGER,
  error_code TEXT,
  error_message TEXT,
  request_metadata JSONB,
  response_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_logs_user ON api_operation_logs(user_id, created_at DESC);
CREATE INDEX idx_api_logs_project ON api_operation_logs(project_id);
CREATE INDEX idx_api_logs_lead ON api_operation_logs(lead_id);
CREATE INDEX idx_api_logs_provider_status ON api_operation_logs(provider, status);
CREATE INDEX idx_api_logs_job ON api_operation_logs(job_id);

ALTER TABLE api_operation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User owns api logs" ON api_operation_logs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
