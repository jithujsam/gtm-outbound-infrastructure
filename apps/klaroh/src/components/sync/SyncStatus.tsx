'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Loader2, RefreshCw } from 'lucide-react';
import { StatusChip, type StatusTone } from '@/components/ui/StatusChip';
import { fetchSyncStatus, requestSync } from '@/lib/integrations-client';
import { describeSyncStatus, formatSyncClock, formatSyncTime, type IntegrationSyncStatus } from '@/lib/sync/sync-status';

/** How often the status is re-read while a sync runs. */
const POLL_MS = 2000;

type Phase = 'idle' | 'starting';
interface Notice {
  tone: 'good' | 'critical' | 'info';
  text: string;
}

const NOTICE_CLASS: Record<Notice['tone'], string> = {
  good: 'text-primary',
  critical: 'text-error',
  info: 'text-on-surface-variant',
};

/**
 * The sync status of the workspace's connected integration(s), read from the
 * server's sync runs (never from page load time), with a Sync button.
 *
 *   detailed — Settings → Integrations: state, last run, failure reason
 *   compact  — page headers: one short line per integration (see SyncRow)
 *
 * `autoSync` refreshes once on mount (skipped by the server right after a
 * sync); the Sync button always starts a sync unless one is already running.
 */
export default function SyncStatus({
  integrationId,
  variant = 'compact',
  autoSync = false,
  refreshRoute = false,
  onSynced,
  className,
}: {
  integrationId?: string;
  variant?: 'detailed' | 'compact';
  autoSync?: boolean;
  /** Re-render the server page after a sync that wrote data. */
  refreshRoute?: boolean;
  /** Called after a sync that wrote data (reload what the page shows). */
  onSynced?: () => void | Promise<void>;
  className?: string;
}) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<IntegrationSyncStatus[] | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState(false);
  const autoStarted = useRef(false);
  const wasSyncing = useRef(false);

  const syncing = phase === 'starting' || !!statuses?.some((s) => s.state === 'syncing');

  // Latest callbacks without re-running effects when the parent re-renders.
  const after = useRef({ onSynced, refreshRoute, router });
  useEffect(() => {
    after.current = { onSynced, refreshRoute, router };
  });
  const afterSync = useCallback(async () => {
    const { onSynced: done, refreshRoute: refresh, router: r } = after.current;
    if (refresh) r.refresh();
    await done?.();
  }, []);

  const load = useCallback(async () => {
    try {
      setStatuses(await fetchSyncStatus(integrationId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [integrationId]);

  const run = useCallback(
    async (mode: 'manual' | 'auto') => {
      setPhase('starting');
      setNotice(null);
      const res = await requestSync(mode, integrationId);
      wasSyncing.current = false; // this request's own sync is reported below, not by the poll
      if (res.integrations) setStatuses(res.integrations);
      setPhase('idle');
      const running = res.integrations?.find((s) => s.state === 'syncing')?.current;
      switch (res.status) {
        case 'success':
          if (mode === 'manual') setNotice({ tone: 'good', text: 'Sync complete.' });
          break;
        case 'partial':
        case 'failed':
          // The status itself shows the run's failure reason; say it here only when it cannot.
          if (!res.integrations?.length) setNotice({ tone: 'critical', text: res.error ?? 'Sync failed.' });
          break;
        case 'in_progress':
          setNotice({
            tone: 'info',
            text: running
              ? `A sync is already in progress (started ${formatSyncClock(running.startedAt)}). This updates when it finishes.`
              : 'A sync is already in progress. This updates when it finishes.',
          });
          break;
        case 'skipped':
          if (mode === 'manual') setNotice({ tone: 'info', text: 'Nothing to sync yet: no client uses a campaign from this integration.' });
          break;
        case 'not_connected':
          if (mode === 'manual') setNotice({ tone: 'info', text: 'No sending platform is connected.' });
          break;
      }
      if (res.status === 'success' || res.status === 'partial') await afterSync();
    },
    [afterSync, integrationId]
  );

  // First read; the page's automatic refresh, once.
  useEffect(() => {
    if (autoSync && !autoStarted.current) {
      autoStarted.current = true;
      void run('auto');
    } else {
      void load();
    }
  }, [autoSync, load, run]);

  // While a sync runs (this one, another tab, or the scheduled sync), re-read
  // the status; reload the page's data when a sync we did not start finishes.
  useEffect(() => {
    const serverSyncing = !!statuses?.some((s) => s.state === 'syncing');
    if (wasSyncing.current && !serverSyncing && phase === 'idle') void afterSync();
    wasSyncing.current = serverSyncing;
    if (!syncing) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [statuses, phase, syncing, load, afterSync]);

  const button = (
    <SyncButton
      onClick={() => void run('manual')}
      syncing={syncing}
      disabled={statuses === null}
      label={syncing ? 'Syncing…' : 'Sync now'}
      title={syncing ? 'A sync is in progress' : 'Fetch the latest data from your sending platform'}
    />
  );

  if (statuses === null) {
    return (
      <div className={clsx('flex min-h-8 items-center gap-2 text-xs text-on-surface-variant', className)}>
        {loadError ? 'Sync status unavailable.' : (
          <>
            <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Checking sync status…
          </>
        )}
      </div>
    );
  }
  if (statuses.length === 0) return null;

  const now = new Date();
  const startingLine = phase === 'starting' && !statuses.some((s) => s.state === 'syncing');
  const noticeLine = notice && <p className={clsx('text-xs', NOTICE_CLASS[notice.tone])}>{notice.text}</p>;

  if (variant === 'detailed') {
    const s = statuses[0];
    const text = describeSyncStatus(s, now);
    return (
      <div className={clsx('space-y-2', className)}>
        <SyncRow
          action={button}
          lines={[
            {
              key: s.integrationId,
              chip: startingLine ? { tone: 'info', label: 'Starting' } : { tone: text.tone, label: text.badge },
              detail: startingLine ? 'Sync started — waiting for the server…' : text.headline,
            },
          ]}
        />
        {(text.lines.length > 0 || text.lastRun) && (
          <div className="space-y-0.5 text-xs text-on-surface-variant">
            {text.lines.map((l) => (
              <p key={l} className={clsx(l === text.lines[0] && (s.state === 'failed' || s.state === 'needs_reauth') && 'text-error')}>
                {l}
              </p>
            ))}
            {text.lastRun && <p>Last run: {text.lastRun}</p>}
            {s.state === 'needs_reauth' && <p>Paste a new {s.label} API key with Manage to resume syncing.</p>}
          </div>
        )}
        {noticeLine}
      </div>
    );
  }

  return (
    <SyncRow
      className={className}
      action={button}
      notice={noticeLine}
      lines={statuses.map((s) => {
        const text = describeSyncStatus(s, now, undefined, 'short');
        // The headline already names a rejected key; say what to do instead of repeating it.
        const problem =
          startingLine ? undefined
          : s.state === 'needs_reauth' ? [`Paste a new ${s.label} API key in Settings → Integrations`, ...text.lines.slice(1)].join(' · ')
          : s.state === 'failed' ? text.lines.join(' · ')
          : undefined;
        return {
          key: s.integrationId,
          chip: startingLine ? { tone: 'info', label: 'Starting' } : { tone: text.tone, label: text.badge },
          source: s.label,
          detail: startingLine ? 'Sync started — waiting for the server…' : keepTimesTogether(text.headline),
          title: s.lastSuccessAt ? `Last successful sync ${formatSyncTime(s.lastSuccessAt)}` : undefined,
          problem,
        };
      })}
    />
  );
}

/** "9 Oct, 7:31 AM" never breaks across lines (narrow screens wrap around it instead). */
const SYNC_TIME = /(\d{1,2} [A-Z][a-z]{2}(?: \d{4})?, \d{1,2}:\d{2} [AP]M|\d{1,2}:\d{2} [AP]M)/;
function keepTimesTogether(text: string): React.ReactNode {
  return text.split(SYNC_TIME).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    )
  );
}

/** The one sync action: 32px secondary button (44px on touch, icon-only on phones), spinner while a sync runs. */
export function SyncButton({
  onClick,
  syncing,
  disabled,
  label,
  title,
}: {
  onClick: () => void;
  syncing: boolean;
  disabled?: boolean;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={syncing || disabled}
      aria-busy={syncing || undefined}
      className="btn btn-secondary btn-sm shrink-0 max-sm:min-w-11 max-sm:px-0"
      title={title ?? label}
    >
      {syncing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
      {/* Icon-only on phones so the status keeps its line; the label stays for screen readers. */}
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}

export interface SyncLine {
  key: string;
  chip: { tone: StatusTone; label: string };
  /** What is synced ("Instantly", "Replies"); omitted when the detail already says it. */
  source?: string;
  detail: React.ReactNode;
  /** Hover text for the detail (e.g. the full timestamp). */
  title?: string;
  /** Failure reason, shown in the error colour under the line. */
  problem?: string;
}

/**
 * Shared layout of every sync indicator, so campaign sync and reply sync read
 * the same while staying separate processes:
 *
 *   [Synced] Instantly · Last synced 9 Oct, 7:31 AM   [↻ Sync now]
 *
 * One row, vertically centred, no container of its own (the page decides
 * where it sits). On narrow screens the text wraps beside the button.
 */
export function SyncRow({
  lines,
  action,
  notice,
  className,
}: {
  lines: SyncLine[];
  action?: React.ReactNode;
  notice?: React.ReactNode;
  className?: string;
}) {
  return (
    // Keeps its width beside a page title (the title wraps first); long failure reasons wrap inside the cap.
    <div className={clsx('flex min-w-0 flex-col gap-1 sm:max-w-[34rem] sm:shrink-0', className)}>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1" role="status" aria-live="polite">
          {lines.map((l) => (
            // Inline flow, not flex-wrap: on narrow screens the text wraps beside the chip instead of dropping under it.
            <div key={l.key} className="min-w-0 leading-6">
              <StatusChip tone={l.chip.tone} className="mr-2 align-middle">
                {l.chip.label}
              </StatusChip>
              <span className="type-table align-middle text-on-surface-variant" title={l.title}>
                {l.source && (
                  <>
                    <span className="font-medium text-on-surface">{l.source}</span>
                    <span aria-hidden="true" className="px-1.5 text-outline">·</span>
                  </>
                )}
                {l.detail}
              </span>
              {l.problem && <span className="block text-xs leading-4 text-error">{l.problem}</span>}
            </div>
          ))}
        </div>
        {action}
      </div>
      {notice}
    </div>
  );
}
