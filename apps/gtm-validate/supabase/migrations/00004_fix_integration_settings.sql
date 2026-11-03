-- 00001 created integration_settings with old schema: (id, provider, api_key)
-- 00003 tried CREATE TABLE IF NOT EXISTS but table already existed, so it was skipped
-- Result: DB has wrong schema — code expects user_id, clearout_api_key, gemini_api_key
-- This migration fixes the mismatch by dropping and recreating with the correct schema.

DROP TABLE IF EXISTS integration_settings CASCADE;

CREATE TABLE integration_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  clearout_api_key TEXT,
  gemini_api_key TEXT,
  supabase_url TEXT,
  supabase_anon_key TEXT,
  supabase_service_role_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_integration_settings_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User owns settings" ON integration_settings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
