-- Drop existing open policies
DROP POLICY IF EXISTS "Full access to projects" ON projects;
DROP POLICY IF EXISTS "Full access to leads" ON leads;

-- Restrict to authenticated users only
CREATE POLICY "Authenticated access to projects" ON projects
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access to leads" ON leads
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
