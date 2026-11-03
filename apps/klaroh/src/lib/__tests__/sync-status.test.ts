import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_DATA_HOURS,
  STALE_RUN_MS,
  isDataStale,
  deriveSyncStatus,
  describeSyncStatus,
  formatSyncClock,
  formatSyncShort,
  formatSyncTime,
  type SyncRunRow,
} from '../sync/sync-status.ts';

const integration = { id: 'int-1', provider: 'instantly', label: 'Instantly' };
const NOW = new Date('2026-10-08T15:15:00Z');

let seq = 0;
function run(p: Partial<SyncRunRow> & { started_at: string }): SyncRunRow {
  return {
    id: `run-${++seq}`,
    integration_id: 'int-1',
    triggered_by: 'manual',
    status: 'success',
    finished_at: null,
    campaigns_upserted: 5,
    error_message: null,
    details: null,
    ...p,
  };
}

test('never synced: no runs at all', () => {
  const s = deriveSyncStatus(integration, [], null, NOW);
  assert.equal(s.state, 'never');
  assert.equal(s.lastSuccessAt, null);
  assert.equal(s.lastRun, null);
  assert.equal(describeSyncStatus(s, NOW, 'UTC').headline, 'Not synced yet');
});

test('successful sync: last synced = the completion time of the run, not the page load', () => {
  const s = deriveSyncStatus(
    integration,
    [run({ started_at: '2026-10-08T15:11:30Z', finished_at: '2026-10-08T15:12:04Z' })],
    null,
    NOW
  );
  assert.equal(s.state, 'success');
  assert.equal(s.lastSuccessAt, '2026-10-08T15:12:04Z');
  const text = describeSyncStatus(s, NOW, 'UTC');
  assert.equal(text.headline, 'Last synced 8 Oct 2026, 3:12 PM');
  assert.equal(text.lastRun, 'Manual sync · started 3:11 PM · finished 3:12 PM · 5 campaigns');
});

test('failed sync: state failed, reason shown, and the last successful sync is kept', () => {
  const s = deriveSyncStatus(
    integration,
    [
      run({ started_at: '2026-10-08T15:00:00Z', finished_at: '2026-10-08T15:00:05Z', status: 'failed', error_message: 'Instantly is temporarily unavailable.', details: { errorKind: 'unavailable' } }),
      run({ started_at: '2026-10-08T09:00:00Z', finished_at: '2026-10-08T09:00:07Z', triggered_by: 'cron' }),
    ],
    null,
    NOW
  );
  assert.equal(s.state, 'failed');
  assert.equal(s.lastSuccessAt, '2026-10-08T09:00:07Z', 'a failure never overwrites the last success');
  assert.equal(s.lastFailureAt, '2026-10-08T15:00:05Z');
  const text = describeSyncStatus(s, NOW, 'UTC');
  assert.equal(text.headline, 'Last sync failed 8 Oct 2026, 3:00 PM');
  assert.deepEqual(text.lines, ['Instantly is temporarily unavailable.', 'Last successful sync 8 Oct 2026, 9:00 AM']);
});

test('the last success can come from outside the recent window', () => {
  const failures = Array.from({ length: 10 }, (_, i) =>
    run({ started_at: `2026-10-08T1${i % 5}:0${i % 6}:00Z`, finished_at: `2026-10-08T1${i % 5}:0${i % 6}:09Z`, status: 'failed' })
  );
  const old = run({ started_at: '2026-10-01T08:00:00Z', finished_at: '2026-10-01T08:00:06Z' });
  const s = deriveSyncStatus(integration, failures, old, NOW);
  assert.equal(s.state, 'failed');
  assert.equal(s.lastSuccessAt, '2026-10-01T08:00:06Z');
});

test('sync currently running: state syncing with the server start time; last success still shown', () => {
  const s = deriveSyncStatus(
    integration,
    [
      run({ started_at: '2026-10-08T15:14:30Z', status: 'running' }),
      run({ started_at: '2026-10-08T09:00:00Z', finished_at: '2026-10-08T09:00:07Z' }),
    ],
    null,
    NOW
  );
  assert.equal(s.state, 'syncing');
  assert.equal(s.current?.startedAt, '2026-10-08T15:14:30Z');
  const text = describeSyncStatus(s, NOW, 'UTC');
  assert.equal(text.headline, 'Syncing… Started 3:14 PM');
  assert.deepEqual(text.lines, ['Last synced 8 Oct 2026, 9:00 AM']);
});

test('a running row that never finished stops counting as syncing after STALE_RUN_MS', () => {
  const started = new Date(NOW.getTime() - STALE_RUN_MS - 1000).toISOString();
  const s = deriveSyncStatus(integration, [run({ started_at: started, status: 'running' })], null, NOW);
  assert.equal(s.state, 'failed');
  assert.equal(s.current, null);
  assert.equal(s.lastRun?.status, 'interrupted');
  assert.equal(s.lastRun?.error, 'The sync did not finish.');
  assert.match(describeSyncStatus(s, NOW, 'UTC').lastRun!, /did not finish$/);
});

test('needs reauthentication: the newest finished run failed because the key was rejected', () => {
  const s = deriveSyncStatus(
    integration,
    [run({ started_at: '2026-10-08T15:00:00Z', finished_at: '2026-10-08T15:00:01Z', status: 'failed', error_message: 'Your Instantly API key is invalid or revoked.', details: { errorKind: 'auth' } })],
    null,
    NOW
  );
  assert.equal(s.state, 'needs_reauth');
  const text = describeSyncStatus(s, NOW, 'UTC');
  assert.equal(text.badge, 'Reconnect needed');
  assert.deepEqual(text.lines, ['Your Instantly API key is invalid or revoked.', 'No successful sync yet']);
});

test('a success after an auth failure clears the reconnect state', () => {
  const s = deriveSyncStatus(
    integration,
    [
      run({ started_at: '2026-10-08T15:05:00Z', finished_at: '2026-10-08T15:05:04Z' }),
      run({ started_at: '2026-10-08T15:00:00Z', finished_at: '2026-10-08T15:00:01Z', status: 'failed', details: { errorKind: 'auth' } }),
    ],
    null,
    NOW
  );
  assert.equal(s.state, 'success');
});

test('a partial run is an incomplete sync, not a success', () => {
  const s = deriveSyncStatus(
    integration,
    [run({ started_at: '2026-10-08T15:00:00Z', finished_at: '2026-10-08T15:00:03Z', status: 'partial', error_message: 'Instantly statistics unavailable' })],
    null,
    NOW
  );
  assert.equal(s.state, 'failed');
  assert.equal(s.lastSuccessAt, null);
  assert.equal(describeSyncStatus(s, NOW, 'UTC').badge, 'Sync incomplete');
});

test('runs of another integration never affect this one', () => {
  const s = deriveSyncStatus(
    integration,
    [run({ integration_id: 'int-other', started_at: '2026-10-08T15:14:00Z', status: 'running' })],
    run({ integration_id: 'int-other', started_at: '2026-10-08T09:00:00Z', finished_at: '2026-10-08T09:00:05Z' }),
    NOW
  );
  assert.equal(s.state, 'never');
});

test('automatic (scheduled) syncs update the same status as manual ones', () => {
  const s = deriveSyncStatus(
    integration,
    [run({ started_at: '2026-10-08T04:35:50Z', finished_at: '2026-10-08T04:35:57Z', triggered_by: 'cron' })],
    null,
    NOW
  );
  assert.equal(s.state, 'success');
  assert.equal(s.lastSuccessAt, '2026-10-08T04:35:57Z');
  assert.match(describeSyncStatus(s, NOW, 'UTC').lastRun!, /^Scheduled sync · /);
});

test('times are shown in the viewer’s time zone (stored as UTC)', () => {
  const iso = '2026-10-08T15:12:04Z';
  assert.equal(formatSyncTime(iso, 'UTC'), '8 Oct 2026, 3:12 PM');
  assert.equal(formatSyncTime(iso, 'Asia/Kolkata'), '8 Oct 2026, 8:42 PM');
  assert.equal(formatSyncTime(iso, 'America/Los_Angeles'), '8 Oct 2026, 8:12 AM');
  // crossing midnight changes the date, not only the time
  assert.equal(formatSyncTime('2026-10-08T20:00:00Z', 'Asia/Tokyo'), '9 Oct 2026, 5:00 AM');
  assert.equal(formatSyncTime('not a date'), '');
});

test('the start time is a clock time today and a full date otherwise (in the viewer’s zone)', () => {
  assert.equal(formatSyncClock('2026-10-08T15:15:00Z', NOW, 'Asia/Kolkata'), '8:45 PM');
  assert.equal(formatSyncClock('2026-10-07T15:15:00Z', NOW, 'Asia/Kolkata'), '7 Oct 2026, 8:45 PM');
  // same UTC day, different local day
  assert.equal(formatSyncClock('2026-10-08T01:00:00Z', NOW, 'America/Los_Angeles'), '7 Oct 2026, 6:00 PM');
});

test('short dates: the current year is dropped, other years and the default form are kept', () => {
  assert.equal(formatSyncShort('2026-10-08T15:12:04Z', NOW, 'UTC'), '8 Oct, 3:12 PM');
  assert.equal(formatSyncShort('2025-12-31T23:00:00Z', NOW, 'UTC'), '31 Dec 2025, 11:00 PM');
  assert.equal(formatSyncShort('not a date', NOW, 'UTC'), '');
  const s = deriveSyncStatus(
    integration,
    [run({ started_at: '2026-10-08T15:11:30Z', finished_at: '2026-10-08T15:12:04Z' })],
    null,
    NOW
  );
  assert.equal(describeSyncStatus(s, NOW, 'UTC', 'short').headline, 'Last synced 8 Oct, 3:12 PM');
  assert.equal(describeSyncStatus(s, NOW, 'UTC').headline, 'Last synced 8 Oct 2026, 3:12 PM');
});

test('a success older than the daily schedule allows is shown as out of date, not as fresh', () => {
  assert.equal(STALE_DATA_HOURS, 26);
  const at = (iso: string) => deriveSyncStatus(integration, [run({ started_at: iso, finished_at: iso })], null, NOW);
  // 25 hours ago: still fresh
  const fresh = describeSyncStatus(at('2026-10-07T14:15:00Z'), NOW, 'UTC');
  assert.deepEqual([fresh.tone, fresh.badge, fresh.lines], ['good', 'Synced', []]);
  // 27 hours ago: one scheduled sync missed
  const old = describeSyncStatus(at('2026-10-07T12:15:00Z'), NOW, 'UTC');
  assert.equal(old.tone, 'warning');
  assert.equal(old.badge, 'Out of date');
  assert.equal(old.headline, 'Last synced 7 Oct 2026, 12:15 PM');
  assert.match(old.lines[0], /No successful sync in the last 26 hours/);
  assert.equal(isDataStale(null, NOW), false, 'never synced is "not synced", not "out of date"');
  assert.equal(isDataStale('not a date', NOW), false);
});

test('an old failure followed by a fresh success shows as synced; a current failure is never hidden by staleness', () => {
  const recovered = deriveSyncStatus(
    integration,
    [
      run({ started_at: '2026-10-08T15:00:00Z', finished_at: '2026-10-08T15:01:00Z' }),
      run({ started_at: '2026-10-07T04:00:00Z', status: 'failed', error_message: 'Could not save campaigns' }),
    ],
    null,
    NOW
  );
  assert.equal(describeSyncStatus(recovered, NOW, 'UTC').badge, 'Synced');
  const failing = deriveSyncStatus(
    integration,
    [run({ started_at: '2026-10-08T04:00:00Z', status: 'failed', error_message: 'Instantly is unavailable' })],
    run({ started_at: '2026-10-05T04:00:00Z', finished_at: '2026-10-05T04:01:00Z' }),
    NOW
  );
  const text = describeSyncStatus(failing, NOW, 'UTC');
  assert.equal(text.badge, 'Sync failed');
  assert.ok(text.lines.includes('Instantly is unavailable'));
  assert.ok(text.lines.some((l) => l.startsWith('Last successful sync 5 Oct 2026')));
});
