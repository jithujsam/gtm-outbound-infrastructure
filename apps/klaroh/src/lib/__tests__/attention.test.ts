import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attentionItems, ATTENTION_LIMIT, type AttentionCampaign } from '../analytics/attention.ts';
import type { InfraSummary } from '../analytics/infrastructure.ts';

const camp = (id: string, over: Partial<AttentionCampaign> = {}): AttentionCampaign => ({ id, name: id.toUpperCase(), status: 'active', unavailableSince: null, ...over });
const infra = (over: Partial<InfraSummary> = {}): InfraSummary => ({ total: 10, active: 10, warming: 10, healthy: 10, issues: 0, paused: 0, errors: 0, dailyCapacity: 500, ...over });

test('healthy campaigns and mailboxes produce nothing', () => {
  const r = attentionItems({ campaigns: [camp('a'), camp('b', { status: 'paused' }), camp('c', { status: 'completed' })], infra: infra() });
  assert.deepEqual(r, { items: [], total: 0 });
});

test('error and suspended campaigns are critical', () => {
  const { items } = attentionItems({ campaigns: [camp('a', { status: 'error' }), camp('b', { status: 'suspended' })], infra: null });
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.tone === 'critical'));
  assert.match(items.find((i) => i.key === 'status:b')!.detail, /Suspended/);
});

test('no rule depends on an unverified metric or a date range', () => {
  // Bounce rate is unverified and ranges are not stored: nothing about volume or bounces is flagged.
  const { items } = attentionItems({ campaigns: [camp('quiet'), camp('busy')], infra: null });
  assert.deepEqual(items, []);
});

test('a campaign no longer returned by the provider is a warning', () => {
  const { items } = attentionItems({ campaigns: [camp('gone', { unavailableSince: '2026-10-01T00:00:00Z' })], infra: null });
  assert.deepEqual(items.map((i) => [i.key, i.tone]), [['gone:gone', 'warning']]);
});

test('mailbox issues: critical when any mailbox is in a sending error, warning otherwise', () => {
  assert.equal(attentionItems({ campaigns: [], infra: infra({ issues: 2, errors: 1 }) }).items[0].tone, 'critical');
  const w = attentionItems({ campaigns: [], infra: infra({ issues: 1 }) }).items[0];
  assert.equal(w.tone, 'warning');
  assert.match(w.title, /1 of 10 mailboxes has issues/);
  assert.equal(w.href, '/infrastructure');
});

test('critical before warning, capped, total counts everything, filters carried into links', () => {
  const campaigns = [camp('gone', { unavailableSince: '2026-10-01T00:00:00Z' }), ...Array.from({ length: 6 }, (_, i) => camp(`e${i}`, { status: 'error' }))];
  const r = attentionItems({ campaigns, infra: infra({ issues: 1 }), query: 'client=x' });
  assert.equal(r.items.length, ATTENTION_LIMIT);
  assert.equal(r.total, 8);
  assert.ok(r.items.every((i) => i.tone === 'critical'));
  assert.equal(r.items[0].href, '/campaigns/e0?client=x');
});
