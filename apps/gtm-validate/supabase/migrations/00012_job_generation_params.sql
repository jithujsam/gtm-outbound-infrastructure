-- Add temperature and max_tokens columns to validation_jobs
-- Allows user-controlled generation parameters per job

ALTER TABLE validation_jobs
  ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS max_tokens INTEGER;
