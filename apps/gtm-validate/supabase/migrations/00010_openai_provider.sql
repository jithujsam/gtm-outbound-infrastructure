-- 00010: Rename gemini_api_key → llm_api_key, add llm_provider
-- Preserves existing data. All existing users default to llm_provider='gemini'.

-- 1. Rename the key column (preserves data)
ALTER TABLE integration_settings RENAME COLUMN gemini_api_key TO llm_api_key;

-- 2. Add llm_provider with constraint
ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS llm_provider TEXT
  CHECK (llm_provider IN ('gemini', 'openai'))
  DEFAULT 'gemini';

-- 3. Backfill existing rows
UPDATE integration_settings SET llm_provider = 'gemini' WHERE llm_provider IS NULL;

-- 4. Add llm_provider to validation_jobs (snapshot at job creation time)
ALTER TABLE validation_jobs
  ADD COLUMN IF NOT EXISTS llm_provider TEXT
  CHECK (llm_provider IN ('gemini', 'openai'));

-- 5. Add 'openai' to api_operation_logs provider check
ALTER TABLE api_operation_logs
  DROP CONSTRAINT IF EXISTS api_operation_logs_provider_check;

ALTER TABLE api_operation_logs
  ADD CONSTRAINT api_operation_logs_provider_check
  CHECK (provider IN ('gemini', 'clearout', 'openai'));
