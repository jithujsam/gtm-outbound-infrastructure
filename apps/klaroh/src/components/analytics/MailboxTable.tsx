'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { MAILBOX_BOUNCE_VERIFIED, MAILBOX_WINDOW_LABEL, type DeliverabilityHealth, type MailboxFlag, type MailboxView, type WarmupHealth } from '@/lib/analytics/infrastructure';
import { fmtCount, fmtDay, fmtDecimal, fmtPct } from '@/lib/analytics/format';
import { ToneLabel, type Tone } from './ui';
import { DataTable, Td, Th, Tr, type SortDirection } from '@/components/ui/DataTable';

const STATUS: Record<MailboxView['status'], { tone: Tone; label: string }> = {
  active: { tone: 'good', label: 'Active' },
  paused: { tone: 'neutral', label: 'Paused' },
  error: { tone: 'critical', label: 'Error' },
  unknown: { tone: 'unknown', label: 'Unknown' },
};

const WARMUP: Record<WarmupHealth, { tone: Tone; label: string }> = {
  good: { tone: 'good', label: 'Good' },
  fair: { tone: 'warning', label: 'Fair' },
  poor: { tone: 'critical', label: 'Poor' },
  off: { tone: 'neutral', label: 'Off' },
  error: { tone: 'critical', label: 'Error' },
  unknown: { tone: 'unknown', label: 'Unknown' },
};

const DELIVERABILITY: Record<DeliverabilityHealth, { tone: Tone; label: string }> = {
  pass: { tone: 'good', label: 'DNS pass' },
  warning: { tone: 'warning', label: 'High bounces' },
  fail: { tone: 'critical', label: 'DNS fail' },
  unknown: { tone: 'unknown', label: 'Not checked' },
};

export const FLAG_LABEL: Record<MailboxFlag, string> = {
  error: 'Sending error',
  warmup: 'Warmup unhealthy',
  dns: 'DNS failing',
  bounces: 'High bounce rate',
  stopped: 'Stopped sending',
  underused: 'Underused',
  overloaded: 'Over daily limit',
};

type Key = 'email' | 'sent' | 'dailyAverage' | 'utilisation' | 'warmupScore' | 'bounceRate' | 'bounced' | 'lastActivity';

/**
 * `sending` = the provider reported campaign sending per mailbox. Without it the
 * sending columns are left out instead of showing empty or zero values.
 */
export default function MailboxTable({ views, compact, emptyText, sending = true }: { views: MailboxView[]; compact?: boolean; emptyText?: string; sending?: boolean }) {
  const [sort, setSort] = useState<{ key: Key; dir: 'asc' | 'desc' }>(sending ? { key: 'sent', dir: 'desc' } : { key: 'warmupScore', dir: 'asc' });
  const rows = useMemo(
    () =>
      [...views].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        if (x === null && y === null) return a.email.localeCompare(b.email);
        if (x === null) return 1;
        if (y === null) return -1;
        const d = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
        return (sort.dir === 'asc' ? d : -d) || a.email.localeCompare(b.email);
      }),
    [views, sort]
  );

  if (!views.length) {
    return <p className="px-4 py-8 text-center text-sm text-on-surface-variant md:px-5">{emptyText ?? 'No mailboxes yet.'}</p>;
  }

  const toggle = (key: Key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'email' ? 'asc' : 'desc' }));
  const dirOf = (key: Key): SortDirection | 'none' => (sort.key === key ? sort.dir : 'none');
  const head = (key: Key, label: string, title?: string) => (
    <Th align="right" title={title} sort={dirOf(key)} onSort={() => toggle(key)}>
      {label}
    </Th>
  );

  return (
    <DataTable label="Email accounts" minWidth={compact ? 720 : sending ? 1240 : 900}>
      <thead>
        <tr>
          <Th sticky sort={dirOf('email')} onSort={() => toggle('email')}>
            Email
          </Th>
          <Th>Status</Th>
          <Th>Warmup</Th>
          {!compact && <Th>Deliverability</Th>}
          <Th align="right">Daily limit</Th>
          {head('warmupScore', 'Health score', 'Warmup health score reported by Instantly (0–100)')}
          {sending && head('sent', compact ? 'Sent (all campaigns)' : 'Sent', `Campaign emails from this mailbox in the ${MAILBOX_WINDOW_LABEL}, across every campaign it sends for (warmup excluded)`)}
          {sending && !compact && head('dailyAverage', 'Daily avg', `Campaign emails per day, ${MAILBOX_WINDOW_LABEL}`)}
          {sending && !compact && head('utilisation', 'Use of limit', `Daily average ÷ daily limit, ${MAILBOX_WINDOW_LABEL}`)}
          {sending && !compact &&
            (MAILBOX_BOUNCE_VERIFIED
              ? head('bounceRate', 'Bounce', `Bounced ÷ campaign emails sent from this mailbox, ${MAILBOX_WINDOW_LABEL}`)
              : head('bounced', 'Bounces', `Bounces reported by Instantly, ${MAILBOX_WINDOW_LABEL}. No rate is shown until the unit of this count is verified.`))}
          {!compact && <Th>Campaigns</Th>}
          {head('lastActivity', 'Last activity')}
          {!compact && <Th className="min-w-[240px]">Flags</Th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((v) => (
          <Tr key={v.id} muted={v.unavailable}>
            <Td sticky className="max-w-[260px] truncate font-medium">
              <span title={v.email}>{v.email}</span>
              {v.unavailable && <span className="block text-xs font-normal text-on-surface-variant">No longer used by a client campaign</span>}
            </Td>
            <Td>
              <ToneLabel tone={STATUS[v.status].tone} title={v.providerStatus ? `Provider status ${v.providerStatus}` : undefined}>{STATUS[v.status].label}</ToneLabel>
            </Td>
            <Td>
              <ToneLabel tone={WARMUP[v.warmup].tone} title={v.warmupStatus === 'active' ? 'Warmup on' : `Warmup ${v.warmupStatus}`}>
                {WARMUP[v.warmup].label}
              </ToneLabel>
            </Td>
            {!compact && (
              <Td>
                <ToneLabel tone={DELIVERABILITY[v.deliverability].tone}>{DELIVERABILITY[v.deliverability].label}</ToneLabel>
              </Td>
            )}
            <Td align="right">{fmtCount(v.dailyLimit)}</Td>
            <Td align="right">{v.warmupScore === null ? 'Not reported' : fmtDecimal(v.warmupScore, 0)}</Td>
            {sending && <Td align="right">{fmtCount(v.sent)}</Td>}
            {sending && !compact && <Td align="right">{fmtDecimal(v.dailyAverage, 1)}</Td>}
            {sending && !compact && <Td align="right">{fmtPct(v.utilisation)}</Td>}
            {sending && !compact && <Td align="right">{MAILBOX_BOUNCE_VERIFIED ? fmtPct(v.bounceRate) : fmtCount(v.bounced)}</Td>}
            {!compact && (
              <Td className="max-w-[220px]">
                <span className="flex min-w-0 gap-1 text-xs text-on-surface-variant" title={[...v.campaigns, ...v.otherCampaigns].map((c) => c.name).join(', ')}>
                  <span className="min-w-0 truncate">
                  {v.campaigns.length === 0 && v.otherCampaigns.length === 0
                    ? '—'
                    : v.campaigns.map((c, i) => (
                        <span key={c.id}>
                          {i > 0 && ', '}
                          <Link href={`/campaigns/${c.id}`} className="hover:text-primary hover:underline">
                            {c.name}
                          </Link>
                        </span>
                      ))}
                  </span>
                  {v.otherCampaigns.length > 0 && (
                    <span className="shrink-0 whitespace-nowrap" title={`Also sends for: ${v.otherCampaigns.map((c) => c.name).join(', ')}`}>
                      +{v.otherCampaigns.length} other
                    </span>
                  )}
                </span>
              </Td>
            )}
            <Td align="right" muted className="text-xs">{fmtDay(v.lastActivity)}</Td>
            {!compact && (
              <Td wrap className="min-w-[240px]">
                <div className="flex flex-wrap gap-1">
                  {v.flags.map((f) => (
                    <span
                      key={f}
                      className={clsx(
                        'whitespace-nowrap rounded px-1.5 py-0.5 text-xs',
                        f === 'underused' ? 'bg-surface-container text-on-surface-variant' : 'bg-error-container/60 text-on-error-container'
                      )}
                    >
                      {FLAG_LABEL[f]}
                    </span>
                  ))}
                </div>
              </Td>
            )}
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}
