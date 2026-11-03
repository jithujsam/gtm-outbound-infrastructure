import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientSlugBase, isValidSlug, withSuffix } from '../slug-utils.ts';
import { classifyProviderError } from '../providers/types.ts';
import { PROVIDER_CATALOG, isSupportedProvider } from '../providers/catalog.ts';
import { connectableProviders, getProviderAdapter } from '../providers/index.ts';
import { normalizeExternalIds } from '../sync/workspace-sync.ts';

test('client slugs are generated from the name and always valid', () => {
  assert.equal(clientSlugBase('Acme Corp!'), 'acme-corp');
  assert.equal(clientSlugBase('Café  Ünïon -- Ltd'), 'cafe-union-ltd');
  assert.equal(clientSlugBase('!!!'), '');
  const long = clientSlugBase('x'.repeat(30) + ' ' + 'y'.repeat(60));
  assert.ok(long.length <= 56 && isValidSlug(long), long);
  for (const name of ['Acme', 'Acme Corp', 'a'.repeat(80), 'Q3 — Outbound (EU)']) {
    const base = clientSlugBase(name);
    for (const attempt of [1, 2, 5]) {
      const slug = withSuffix(base, attempt);
      assert.ok(isValidSlug(slug), `${slug} from ${name}`);
      assert.ok(slug.startsWith(base.slice(0, 40)));
    }
  }
  assert.equal(withSuffix('acme', 1), 'acme-2');
});

test('provider failures are classified the same way for every provider', () => {
  assert.equal(classifyProviderError({ status: 401, message: '' }), 'auth');
  assert.equal(classifyProviderError({ status: 403, message: '' }), 'auth');
  assert.equal(classifyProviderError({ status: 429, message: '' }), 'rate_limited');
  assert.equal(classifyProviderError({ status: 0, message: '' }), 'unavailable');
  assert.equal(classifyProviderError({ status: 503, message: '' }), 'unavailable');
  assert.equal(classifyProviderError({ status: 400, message: '' }), 'error');
});

test('the catalog only offers providers that can really connect', () => {
  assert.deepEqual(PROVIDER_CATALOG.map((p) => p.id), ['instantly', 'smartlead']);
  for (const p of PROVIDER_CATALOG) {
    assert.equal(p.available, getProviderAdapter(p.id) !== null, `${p.id}: available ⇔ adapter exists`);
  }
  assert.equal(isSupportedProvider('smartlead'), false, 'Smartlead is a placeholder');
  assert.equal(isSupportedProvider('demo'), false);
  assert.deepEqual(connectableProviders(), ['instantly']);
});

test('import ids are trimmed, de-duplicated and bounded', () => {
  assert.equal(normalizeExternalIds('a'), null);
  assert.equal(normalizeExternalIds(undefined), null);
  assert.deepEqual(normalizeExternalIds([' a ', 'a', '', 7, null, 'b', 'x'.repeat(201)]), ['a', 'b']);
  assert.deepEqual(normalizeExternalIds([]), []);
});
