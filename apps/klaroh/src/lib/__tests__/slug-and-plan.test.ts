import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSlug, getSlugError, isValidSlug } from '../slug-utils.ts';
import { PLAN_LIMITS, getDaysRemaining, getEffectivePlan, isTrialExpired } from '../plan-limits.ts';

test('isValidSlug accepts normal slugs and rejects unsafe ones', () => {
  for (const ok of ['acme', 'acme-corp-2', 'a1', 'x'.repeat(64)]) assert.equal(isValidSlug(ok), true, ok);
  for (const bad of ['', ' ', '-acme', 'acme-', 'ac--me', 'Acme', 'ac me', 'ac/me', '../etc', 'x'.repeat(65), 'ünï']) {
    assert.equal(isValidSlug(bad), false, JSON.stringify(bad));
  }
});

test('generateSlug output for unusable names is invalid, so routes must reject it', () => {
  assert.equal(generateSlug('Acme Corp!'), 'acme-corp');
  assert.equal(isValidSlug(generateSlug('Acme Corp!')), true);
  assert.equal(generateSlug('!!!'), '');
  assert.equal(isValidSlug(generateSlug('!!!')), false);
  assert.equal(isValidSlug(generateSlug('日本語')), false);
});

test('getSlugError mirrors isValidSlug', () => {
  assert.equal(getSlugError('acme'), null);
  assert.ok(getSlugError(''));
  assert.ok(getSlugError('ac--me'));
});

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

test('trial lasts 14 days, then falls back to the basic limit', () => {
  assert.equal(isTrialExpired(daysAgo(13)), false);
  assert.equal(isTrialExpired(daysAgo(15)), true);
  assert.equal(getEffectivePlan('trial', daysAgo(1)), 'trial');
  assert.equal(getEffectivePlan('trial', daysAgo(20)), 'basic');
  assert.equal(getEffectivePlan('pro', daysAgo(400)), 'pro');
  assert.equal(getDaysRemaining(daysAgo(20)), 0);
  assert.equal(getDaysRemaining(daysAgo(4)), 10);
});

test('plan limits are ordered and trial equals basic', () => {
  assert.ok(PLAN_LIMITS.basic <= PLAN_LIMITS.standard && PLAN_LIMITS.standard <= PLAN_LIMITS.pro);
  assert.equal(PLAN_LIMITS.trial, PLAN_LIMITS.basic);
});

test('every plan name the database may store has a limit (production: solo/growth/agency; legacy: basic/standard/pro)', () => {
  for (const plan of ['trial', 'solo', 'growth', 'agency', 'basic', 'standard', 'pro']) {
    assert.equal(typeof PLAN_LIMITS[plan], 'number', plan);
  }
  // matches the billing page: Solo 3, Growth 10, Agency 20
  assert.deepEqual([PLAN_LIMITS.solo, PLAN_LIMITS.growth, PLAN_LIMITS.agency], [3, 10, 20]);
});
