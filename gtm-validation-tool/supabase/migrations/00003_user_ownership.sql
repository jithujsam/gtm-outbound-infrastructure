-- Add user_id to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to leads (denormalized for efficient RLS)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id UUID;

-- Index for user-scoped queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);

-- Integration settings table (stored per user, never exposed to client)
CREATE TABLE IF NOT EXISTS integration_settings (
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

-- updated_at trigger on integration_settings
DROP TRIGGER IF EXISTS update_integration_settings_updated_at ON integration_settings;
CREATE TRIGGER update_integration_settings_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on integration_settings
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

-- Replace RLS policies on projects with user-ownership
DROP POLICY IF EXISTS "Authenticated access to projects" ON projects;
CREATE POLICY "User owns projects" ON projects
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Replace RLS policies on leads with user-ownership
DROP POLICY IF EXISTS "Authenticated access to leads" ON leads;
CREATE POLICY "User owns leads" ON leads
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS on integration_settings — user can only see their own.
-- On a fresh database integration_settings still has the 00001 shape (no
-- user_id), because CREATE TABLE IF NOT EXISTS above is skipped. Creating
-- the policy unconditionally made this migration fail there. 00004 drops and
-- recreates the table with this policy, so it is only needed when user_id
-- already exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'integration_settings'
      AND column_name = 'user_id'
  ) THEN
    CREATE POLICY "User owns settings" ON integration_settings
      FOR ALL USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
