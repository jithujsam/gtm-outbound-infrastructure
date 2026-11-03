import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Provider-backed campaign names come from the provider only. The database
// keeps campaigns_v2.display_name null (supabase/tests/v2.test.sql); here we
// make sure the application offers no way to rename a campaign.

const root = new URL('../../', import.meta.url).pathname; // src/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

test('there is no campaign rename endpoint or rename dialog', () => {
  assert.equal(existsSync(join(root, 'app/api/edit-campaign/route.ts')), false);
  assert.equal(existsSync(join(root, 'components/EditCampaignModal.tsx')), false);
});

test('no application code writes a campaign name except the provider sync', () => {
  for (const file of files(root)) {
    const src = readFileSync(file, 'utf8');
    assert.ok(!src.includes('display_name'), `${file} must not use the retired display_name`);
    if (/from\('campaigns_v2'\)[\s\S]{0,200}\.update\(/.test(src)) {
      // the only campaigns_v2 updates allowed outside sync are non-name flags
      assert.ok(!/\.update\(\{[^}]*\bname\b/.test(src), `${file} updates a campaign name`);
    }
  }
});
