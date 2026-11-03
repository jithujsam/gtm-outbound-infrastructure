import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapAnalyticsRow,
  mapCampaignListRow,
  num,
  parseCampaignListPage,
  toRecordList,
} from '../instantly-mappers.ts';

test('num: coerces numeric strings, rejects junk, booleans and blanks', () => {
  assert.equal(num('12'), 12);
  assert.equal(num(3.5), 3.5);
  assert.equal(num(''), null);
  assert.equal(num(null), null);
  assert.equal(num(undefined), null);
  assert.equal(num('abc'), null);
  assert.equal(num(NaN), null);
  assert.equal(num(Infinity), null);
  assert.equal(num(true), null);
});

test('toRecordList: accepts bare arrays and wrapped payloads', () => {
  assert.deepEqual(toRecordList([{ a: 1 }]), [{ a: 1 }]);
  assert.deepEqual(toRecordList({ data: [{ a: 1 }] }), [{ a: 1 }]);
  assert.deepEqual(toRecordList({ items: [{ a: 2 }] }), [{ a: 2 }]);
  assert.deepEqual(toRecordList({ campaigns: [{ a: 3 }] }), [{ a: 3 }]);
  assert.deepEqual(toRecordList({ nothing: true }), []);
  assert.deepEqual(toRecordList(null), []);
  assert.deepEqual(toRecordList('x'), []);
});

test('mapCampaignListRow: maps the v2 payload', () => {
  const row = mapCampaignListRow({
    id: 'c1',
    name: 'Q3 Outreach',
    status: 1,
    is_evergreen: false,
    daily_limit: '50',
    pl_value: 2.5,
    email_list: ['a@x.com', 'b@x.com'],
    campaign_schedule: { start_date: '2026-01-01', end_date: '2026-02-01' },
    timestamp_created: '2026-01-01T00:00:00Z',
    timestamp_updated: '2026-01-02T00:00:00Z',
  });
  assert.deepEqual(row, {
    campaign_id: 'c1',
    campaign_name: 'Q3 Outreach',
    campaign_status: 1,
    campaign_is_evergreen: false,
    campaign_sender_count: 2,
    campaign_sender_emails: ['a@x.com', 'b@x.com'],
    campaign_daily_limit: 50,
    campaign_pl_value: 2.5,
    campaign_start_date: '2026-01-01',
    campaign_end_date: '2026-02-01',
    campaign_created_at: '2026-01-01T00:00:00Z',
    campaign_updated_at: '2026-01-02T00:00:00Z',
  });
});

test('mapCampaignListRow: legacy aliases, status 0 and negative statuses survive', () => {
  assert.equal(mapCampaignListRow({ campaign_id: 'c2', campaign_name: 'N', campaign_status: 0 })?.campaign_status, 0);
  assert.equal(mapCampaignListRow({ id: 'c3', status: -99 })?.campaign_status, -99);
});

test('mapCampaignListRow: falls back to id for a missing name; rejects rows without an id', () => {
  assert.equal(mapCampaignListRow({ id: 'c4' })?.campaign_name, 'c4');
  assert.equal(mapCampaignListRow({ name: 'no id' }), null);
  assert.equal(mapCampaignListRow({ id: '' }), null);
});

test('mapAnalyticsRow: picks counters, falls back to alias keys, leaves absent fields undefined', () => {
  const row = mapAnalyticsRow({
    campaign_id: 'c1',
    emails_sent: 100,
    contacted_count: '40',
    reply_count_unique: 4,
    bounced_count: 'n/a',
  });
  assert.equal(row?.campaign_id, 'c1');
  assert.equal(row?.emails_sent_count, 100);
  assert.equal(row?.contacted_count, 40);
  assert.equal(row?.reply_count_unique, 4);
  assert.equal(row?.bounced_count, undefined);
  assert.equal(row?.open_count, undefined);
});

test('mapAnalyticsRow: accepts id as an alias; rejects rows without any id', () => {
  assert.equal(mapAnalyticsRow({ id: 'zz' })?.campaign_id, 'zz');
  assert.equal(mapAnalyticsRow({ leads_count: 5 }), null);
});

test('parseCampaignListPage: cursor, wrapped keys and bare arrays', () => {
  assert.deepEqual(parseCampaignListPage({ items: [{ id: 'a' }], next_starting_after: 'cur' }), {
    items: [{ id: 'a' }],
    nextCursor: 'cur',
  });
  assert.deepEqual(parseCampaignListPage({ data: [{ id: 'a' }] }), { items: [{ id: 'a' }], nextCursor: null });
  assert.deepEqual(parseCampaignListPage([{ id: 'a' }]), { items: [{ id: 'a' }], nextCursor: null });
  assert.deepEqual(parseCampaignListPage({ items: [], next_starting_after: '' }), { items: [], nextCursor: null });
  assert.deepEqual(parseCampaignListPage(undefined), { items: [], nextCursor: null });
});
