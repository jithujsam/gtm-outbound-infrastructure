-- validation_prompts: stores user-edited prompt templates per project
-- prompts contain slash-variables like /company, /industry
-- these are resolved server-side before being sent to AI APIs

CREATE TABLE validation_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('icp', 'email')),
  prompt TEXT NOT NULL,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, project_id, type)
);

CREATE TRIGGER update_validation_prompts_updated_at
  BEFORE UPDATE ON validation_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_validation_prompts_user_project ON validation_prompts(user_id, project_id);

ALTER TABLE validation_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User owns validation prompts" ON validation_prompts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
