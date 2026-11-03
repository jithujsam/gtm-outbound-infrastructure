'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LocalTime from '@/components/ui/LocalTime';
import { SyncButton, SyncRow, type SyncLine } from '@/components/sync/SyncStatus';
import type { ReplySyncInfo } from '@/lib/analytics/replies';

/** While a reply sync runs, the page re-reads its data this often. */
const POLL_MS = 4000;

/**
 * "[Synced] Replies synced 8 Oct, 8:51 PM" — the freshness of the conversation
 * data, from the reply sync runs (never from page load time, and never from the
 * campaign sync: they are separate processes). Same layout as the campaign
 * SyncStatus. Optional "Sync replies" button for the agency. Never claims the
 * data is real-time.
 */
export default function ReplySyncBar({ sync, canSync = false }: { sync: ReplySyncInfo; canSync?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const syncing = busy || sync.syncing;

  useEffect(() => {
    if (!sync.syncing) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [sync.syncing, router]);

  const run = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/replies/sync', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (d.error) setNotice(d.error);
      else if (d.status === 'skipped') setNotice('Replies were synced moments ago.');
      else if (d.backlog) setNotice('Synced. Older replies are still coming in and continue on the next sync.');
    } catch {
      setNotice('Reply sync failed — showing the replies already synced.');
    } finally {
      setBusy(false);
      router.refresh();
    }
  };

  const lastSynced = sync.lastSuccessAt ? (
    <>
      Replies synced <LocalTime iso={sync.lastSuccessAt} format="dateTimeShort" className="whitespace-nowrap" />
    </>
  ) : (
    'Reply data hasn’t been synced yet.'
  );
  const line: SyncLine = syncing
    ? { key: 'replies', chip: { tone: 'info', label: 'Syncing' }, detail: 'Syncing replies…' }
    : sync.lastFailed
      ? {
          key: 'replies',
          chip: { tone: 'critical', label: 'Sync failed' },
          detail: lastSynced,
          problem: `The latest reply sync didn’t complete${sync.lastError ? ` (${sync.lastError.replace(/\.$/, '')})` : ''} — new replies may not be here yet.`,
        }
      : sync.lastSuccessAt
        ? { key: 'replies', chip: { tone: 'good', label: 'Synced' }, detail: lastSynced }
        : { key: 'replies', chip: { tone: 'neutral', label: 'Not synced' }, detail: lastSynced };
  const note = notice ?? (!syncing && !sync.lastFailed && sync.backlog ? 'Older replies are still being brought in.' : null);

  return (
    <SyncRow
      lines={[line]}
      notice={note && <p className="text-xs text-on-surface-variant">{note}</p>}
      action={canSync && <SyncButton onClick={run} syncing={syncing} label="Sync replies" title="Fetch the latest replies from your sending platform" />}
    />
  );
}
