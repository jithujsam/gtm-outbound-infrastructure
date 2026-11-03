-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Integration settings — stores third-party API keys
CREATE TABLE integration_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT UNIQUE NOT NULL,
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default providers
INSERT INTO integration_settings (provider, api_key) VALUES
  ('gemini', ''),
  ('clearout', '')
ON CONFLICT (provider) DO NOTHING;

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leads table
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Source columns
  full_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  position TEXT NOT NULL,
  email TEXT NOT NULL,
  industry TEXT NOT NULL,
  state TEXT NOT NULL,
  domain TEXT NOT NULL,
  employee_size INTEGER,
  country TEXT NOT NULL,
  company_description TEXT NOT NULL,
  company_linkedin TEXT NOT NULL,
  linkedin_url TEXT NOT NULL,
  website TEXT NOT NULL,

  -- Gemini columns
  email_check TEXT CHECK (email_check IN ('Valid', 'Invalid', 'Unknown')),
  ai_summary TEXT,
  vertical_match BOOLEAN,
  matched_vertical TEXT,
  reasoning TEXT,
  email_score INTEGER,

  -- Clearout columns
  status TEXT,
  safe_to_send BOOLEAN,
  smtp_provider TEXT,
  mx_record TEXT,
  account TEXT,
  clearout_domain TEXT,
  ai_response TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_leads_project_id ON leads(project_id);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_vertical_match ON leads(vertical_match);
CREATE INDEX idx_leads_email_check ON leads(email_check);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_integration_settings_provider ON integration_settings(provider);

-- RLS Policies
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

-- Allow full access for authenticated users
CREATE POLICY "Full access to projects" ON projects
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access to leads" ON leads
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access to integration_settings" ON integration_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_settings_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
