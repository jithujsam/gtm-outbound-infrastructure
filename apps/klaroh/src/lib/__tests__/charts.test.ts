import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankRow, rankRows } from '../analytics/ranking.ts';
import { repliesByDay, REPLY_ACTIVITY_DAYS } from '../analytics/activity.ts';
import { stepRankRows, stepViews } from '../analytics/steps.ts';
import { metricSet, type Counts } from '../analytics/metrics.ts';

const counts = (prospects: number | null, replies: number | null, positive: number | null): Counts => ({
  emailsSent: prospects === null ? null : prospects * 2, prospectsContacted: prospects, humanReplies: replies, positive, bounces: null,
});
const row = (id: string, c: Counts) => rankRow(id, id, `/campaigns/${id}`, metricSet([c]));

test('ranking rows carry the trusted values and a context line, from the shared metric layer', () => {
  const r = row('pharma', counts(990, 21, 7));
  assert.deepEqual(r.values, { positive: 7, positiveRate: (7 / 990) * 100, humanReplies: 21 });
  assert.equal(r.details.positive, '0.71% of 990 prospects');
  assert.equal(r.details.positiveRate, '7 positive of 990 prospects');
  assert.equal(r.details.humanReplies, '2.1% of 990 prospects');
  assert.equal(r.lowVolume, false);
  assert.equal(r.href, '/campaigns/pharma');
  const missing = row('x', counts(null, null, null));
  assert.deepEqual(missing.values, { positive: null, positiveRate: null, humanReplies: null });
  assert.equal(missing.details.positive, 'Not reported', 'never a fabricated 0');
});

test('ranking order: highest first; on rates low volume ranks after the rest; unknown last', () => {
  const big = row('big', counts(1000, 20, 8)); // 0.8%
  const tiny = row('tiny', counts(10, 2, 1)); // 10%, low volume
  const mid = row('mid', counts(500, 30, 2)); // 0.4%
  const none = row('none', counts(400, null, null));
  assert.deepEqual(rankRows([tiny, mid, none, big], 'positiveRate').map((r) => r.id), ['big', 'mid', 'none', 'tiny'], 'same rule as the comparison table: low volume after every other row');
  assert.deepEqual(rankRows([tiny, mid, none, big], 'positive').map((r) => r.id), ['big', 'mid', 'tiny', 'none'], 'counts are not penalised for volume');
  assert.deepEqual(rankRows([tiny, mid, none, big], 'humanReplies').map((r) => r.id), ['mid', 'big', 'tiny', 'none']);
});

test('replies per day: real daily counts from the first reply in the window to today, zeros between', () => {
  const today = '2026-10-10';
  const times = [
    '2026-10-07T09:00:00Z', '2026-10-07T17:30:00Z', '2026-10-09T23:59:00Z',
    '2026-06-01T10:00:00Z', // outside the 90-day window
    'not a date',
  ];
  assert.deepEqual(repliesByDay(times, today), [
    { date: '2026-10-07', value: 2 },
    { date: '2026-10-08', value: 0 },
    { date: '2026-10-09', value: 1 },
    { date: '2026-10-10', value: 0 },
  ]);
  assert.equal(REPLY_ACTIVITY_DAYS, 90);
  assert.deepEqual(repliesByDay([], today), [], 'no replies: no chart, not a flat zero line');
  assert.deepEqual(repliesByDay(['2026-06-01T10:00:00Z'], today), []);
  assert.deepEqual(repliesByDay(['2026-10-11T01:00:00Z'], today), [], 'future timestamps are ignored');
});

test('steps as chart rows keep sequence order and mark low-volume steps', () => {
  const steps = stepViews([
    { step: 2, variant: '', sent: 480, replies_unique: 8, opportunities: 2 },
    { step: 1, variant: 'A', sent: 640, replies_unique: 9, opportunities: 3 },
    { step: 1, variant: 'B', sent: 620, replies_unique: 5, opportunities: 1 },
    { step: 3, variant: '', sent: 31, replies_unique: 2, opportunities: 0 },
  ]);
  const rows = stepRankRows(steps);
  assert.deepEqual(rows.map((r) => [r.name, r.values.humanReplies, r.values.positive, r.lowVolume]), [
    ['Step 1', 14, 4, false],
    ['Step 2', 8, 2, false],
    ['Step 3', 2, 0, true],
  ]);
  assert.equal(rows[0].details.humanReplies, '1.1% of 1,260 emails at this step got a reply');
  assert.equal(rows[0].href, '', 'steps have no page of their own');
});
