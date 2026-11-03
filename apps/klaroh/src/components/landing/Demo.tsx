'use client';

// The product frame: the real app's look (green sidebar, serif page titles, hairline panels,
// status chips) rebuilt in code from the same UI primitives and tokens, and filled with the
// figures from real Klaroh screens. Interactive in the tour (the sidebar items are real tabs);
// a static, cropped Overview in the hero.

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import clsx from 'clsx';
import { m, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronsLeft, CircleCheck, Compass, LayoutGrid, Mail, Megaphone, MoreVertical, Pencil, RefreshCw, RefreshCcw, Server, SlidersHorizontal, Inbox as InboxIcon } from 'lucide-react';
import { Cell, CellGrid, DataBar, Meter, Panel, StatusBadge } from '@/components/analytics/ui';
import { StatusChip } from '@/components/ui/StatusChip';
import { APP_CAMPAIGNS, APP_TOTALS, BY_POSITIVE_RATE, LAST_SYNCED, WORKSPACE, fmt, rate } from './app-data';
import { EASE } from './motion';

export type ScreenKey = 'overview' | 'campaigns' | 'infrastructure' | 'clients';

type NavItem = { key: ScreenKey | 'inbox'; label: string; icon: typeof Compass; caption?: string };

// The app's real navigation. Inbox is shown for fidelity but is not part of the tour.
const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: Compass, caption: 'How all your outbound is performing: totals, the reply funnel and standout campaigns.' },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone, caption: 'Which campaigns are working, ranked on the same reply and positive rates.' },
  { key: 'inbox', label: 'Inbox', icon: InboxIcon },
  { key: 'infrastructure', label: 'Infrastructure', icon: Server, caption: 'Whether mailboxes, warmup and sending domains are healthy, as reported by Instantly.' },
  { key: 'clients', label: 'Clients', icon: LayoutGrid, caption: 'One client on one page: their campaigns, email setup and recent activity.' },
];

export const SCREENS = NAV.filter((n): n is NavItem & { key: ScreenKey } => n.key !== 'inbox');

const TITLES: Record<ScreenKey, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'How the whole outbound operation is performing.' },
  campaigns: { title: 'Campaigns', subtitle: 'Which campaigns are working, compared on the same trusted metrics.' },
  infrastructure: { title: 'Infrastructure', subtitle: 'Is the outbound infrastructure healthy?' },
  clients: { title: 'Clients', subtitle: 'Campaigns, infrastructure and activity for each client.' },
};

// ── shared page pieces ──────────────────────────────────────────────────────

function SyncBar() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 whitespace-nowrap text-xs">
      <StatusChip tone="good" icon={CircleCheck}>Synced</StatusChip>
      <span className="font-semibold text-on-surface">Instantly</span>
      <span className="text-on-surface-variant">· {LAST_SYNCED}</span>
      <span className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-[13px] font-medium text-on-surface">
        <RefreshCw size={13} aria-hidden="true" /> Sync now
      </span>
    </div>
  );
}

function PageHeader({ screen }: { screen: ScreenKey }) {
  const { title, subtitle } = TITLES[screen];
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h2 className="type-page-title text-on-surface md:text-[32px]">{title}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>
      </div>
      <SyncBar />
    </div>
  );
}

function Select({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[13px] text-on-surface">
      {children} <ChevronDown size={14} className="text-on-surface-variant" aria-hidden="true" />
    </span>
  );
}

function Filters({ summary }: { summary: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-surface-container px-3 py-2 text-xs font-semibold text-on-surface">All time</span>
        <Select>All clients</Select>
        <Select>All campaigns</Select>
        <Select>All providers</Select>
      </div>
      <p className="mt-3 text-xs text-on-surface-variant">{summary}</p>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="border-y border-outline-variant/40 bg-surface-container-low px-4 py-1.5 text-xs font-medium text-on-surface first:border-t-0">{children}</p>;
}

// ── screens ─────────────────────────────────────────────────────────────────

function OverviewScreen() {
  const t = APP_TOTALS;
  const top = [...APP_CAMPAIGNS].sort((a, b) => b.positive / b.prospects - a.positive / a.prospects)[0];
  const topReply = [...APP_CAMPAIGNS].sort((a, b) => b.replies / b.prospects - a.replies / a.prospects)[0];
  const funnel = [
    { label: 'Prospects contacted', value: t.prospects, share: null },
    { label: 'Human replies', value: t.replies, share: rate(t.replies, t.prospects) },
    { label: 'Positive', value: t.positive, share: rate(t.positive, t.prospects) },
  ];
  return (
    <>
      <Filters summary={<>All clients <span className="mx-1">·</span> {APP_CAMPAIGNS.length} campaigns <span className="mx-1">·</span> Lifetime totals from Instantly, last synced 2h ago</>} />
      <Panel title="Performance" action={<p className="text-xs text-on-surface-variant">Prospects are counted per campaign, not as unique people</p>} className="mb-4" bodyClassName="overflow-hidden rounded-b-lg">
        <GroupLabel>Reported by Instantly</GroupLabel>
        <CellGrid className="grid-cols-2 md:grid-cols-5">
          <Cell label="Emails sent" value={fmt(t.emailsSent)} emphasis />
          <Cell label="Prospects contacted" value={fmt(t.prospects)} emphasis />
          <Cell label="Human replies" value={fmt(t.replies)} emphasis />
          <Cell label="Positive" value={fmt(t.positive)} sub="As marked in Instantly" emphasis />
          <Cell label="Bounces" value={fmt(t.bounces)} emphasis />
        </CellGrid>
        <GroupLabel>Calculated by Klaroh</GroupLabel>
        <CellGrid className="grid-cols-1 md:grid-cols-3">
          <Cell label="Reply rate" value={rate(t.replies, t.prospects)} sub="Human replies ÷ Prospects contacted" />
          <Cell label="Positive rate" value={rate(t.positive, t.prospects)} sub="Positive ÷ Prospects contacted" />
          <Cell label="Emails per positive" value={`${Math.round(t.emailsSent / t.positive)} : 1`} sub="Emails sent ÷ Positive" />
        </CellGrid>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Funnel" subtitle={`${fmt(t.emailsSent)} emails sent · each stage as a share of prospects contacted`}>
          <ul className="space-y-4 px-4 py-4 md:px-5">
            {funnel.map((f) => (
              <li key={f.label}>
                <div className="flex items-baseline justify-between gap-2 text-sm text-on-surface">
                  <span>{f.label}</span>
                  <span>
                    <span className="font-semibold">{fmt(f.value)}</span>
                    {f.share && <span className="ml-2 text-xs text-on-surface-variant">{f.share} of prospects</span>}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Meter value={f.value} max={t.prospects} label={`${f.label}: ${f.value}`} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Observations" subtitle="Rate leaders only include campaigns with enough prospects" bodyClassName="divide-y divide-outline-variant/40">
          {[
            { label: 'Highest positive rate', c: top, value: rate(top.positive, top.prospects), detail: `${top.positive} positive of ${top.prospects} prospects` },
            { label: 'Highest reply rate', c: topReply, value: rate(topReply.replies, topReply.prospects), detail: `${topReply.replies} replies of ${topReply.prospects} prospects` },
          ].map((o) => (
            <div key={o.label} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
              <div className="min-w-0">
                <p className="text-xs text-on-surface-variant">{o.label}</p>
                <p className="text-sm font-semibold text-on-surface">{o.c.name}</p>
                <p className="text-xs text-on-surface-variant">{o.detail}</p>
              </div>
              <p className="text-sm font-semibold text-on-surface">{o.value}</p>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

function RateCell({ n, d, noun, max }: { n: number; d: number; noun: string; max: number }) {
  return (
    <td className="px-3 py-2.5 text-right align-top">
      <span className="block font-semibold text-on-surface">{rate(n, d)}</span>
      <span className="block text-xs text-on-surface-variant">{n} {noun}</span>
      <DataBar value={d ? (n / d) * 100 : 0} max={max} />
    </td>
  );
}

function CampaignsScreen() {
  const maxReply = Math.max(...APP_CAMPAIGNS.map((c) => (c.replies / c.prospects) * 100));
  const maxPos = Math.max(...APP_CAMPAIGNS.map((c) => (c.positive / c.prospects) * 100));
  return (
    <>
      <Filters summary={<>{APP_CAMPAIGNS.length} campaigns <span className="mx-1">·</span> Lifetime totals from Instantly, last synced 2h ago</>} />
      <Panel title="Campaign comparison" subtitle="Sorted by positive rate. Click a column to re-rank, or a campaign for its analytics." bodyClassName="overflow-x-auto rounded-b-lg">
        <table className="w-full min-w-[40rem] border-collapse text-[13px] tabular-nums">
          <thead>
            <tr className="bg-surface-container-low text-left text-xs text-on-surface-variant">
              <th className="px-4 py-2 font-medium">Campaign</th>
              <th className="px-3 py-2 text-right font-medium">Emails sent</th>
              <th className="px-3 py-2 text-right font-medium">Prospects</th>
              <th className="px-3 py-2 text-right font-medium">Reply rate</th>
              <th className="px-3 py-2 text-right font-medium text-on-surface">↓ Positive rate</th>
              <th className="px-4 py-2 text-right font-medium">Bounces</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {BY_POSITIVE_RATE.map((c) => (
              <tr key={c.name}>
                <td className="px-4 py-2.5 align-top">
                  <span className="block font-semibold text-on-surface">{c.name}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <StatusBadge status={c.status} /> Instantly
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right align-top text-on-surface">{fmt(c.emailsSent)}</td>
                <td className="px-3 py-2.5 text-right align-top text-on-surface">{fmt(c.prospects)}</td>
                <RateCell n={c.replies} d={c.prospects} noun="replies" max={maxReply} />
                <RateCell n={c.positive} d={c.prospects} noun="positive" max={maxPos} />
                <td className="px-4 py-2.5 text-right align-top text-on-surface">{c.bounces}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-outline-variant/40 px-4 py-2.5 text-xs text-on-surface-variant">
          Rates are calculated by Klaroh from Instantly&apos;s counts. Campaigns under 100 prospects contacted are marked low volume and rank last on rates.
        </p>
      </Panel>
    </>
  );
}

function InfrastructureScreen() {
  const tabs = ['Health', 'Email accounts', 'Warmup', 'Domains'];
  return (
    <>
      <div className="mb-4 flex gap-5 overflow-x-auto border-b border-outline-variant/40 text-sm" aria-hidden="true">
        {tabs.map((t, i) => (
          <span key={t} className={clsx('whitespace-nowrap pb-2.5 font-medium', i === 0 ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant')}>
            {t}
          </span>
        ))}
      </div>
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select>All clients</Select>
          <Select>All campaigns</Select>
          <Select>All providers</Select>
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">Last collected Oct 10. Sending and warmup figures cover the last 30 days.</p>
      </div>
      <div className="space-y-4">
        <Panel title="Email IDs" subtitle="Sending mailboxes used by the selected client campaigns" bodyClassName="overflow-hidden rounded-b-lg">
          <CellGrid className="grid-cols-2 md:grid-cols-5">
            <Cell label="Email IDs" value="6" sub="2 sending domains" emphasis />
            <Cell label="Active" value="6" sub="100% of mailboxes" emphasis />
            <Cell label="Warming" value="6" sub="Warmup enabled" emphasis />
            <Cell label="Healthy" value="6" sub="Active, warmup and DNS OK" emphasis />
            <Cell label="Issues" value="0" sub="Needing attention" emphasis />
          </CellGrid>
        </Panel>
        <Panel
          title="Needs attention"
          subtitle="Nothing needs attention"
          action={
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              All email accounts <ArrowRight size={12} aria-hidden="true" />
            </span>
          }
        >
          <p className="flex items-center gap-2 px-4 py-5 text-[13px] font-medium text-on-surface md:px-5">
            <CircleCheck size={14} className="text-primary-container" aria-hidden="true" /> No mailbox has a sending error, unhealthy warmup or failing DNS
          </p>
        </Panel>
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Panel title="Health at a glance" subtitle="Three separate questions: an active mailbox can still have poor warmup or failing DNS">
            <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-3 md:px-5">
              {[
                ['Account status', '6 mailboxes'],
                ['Warmup health', '6 mailboxes'],
                ['Domain DNS', '6 mailboxes'],
              ].map(([label, n]) => (
                <div key={label}>
                  <p className="text-sm font-semibold text-on-surface">{label}</p>
                  <p className="mb-2 text-xs text-on-surface-variant">{n}</p>
                  <Meter value={100} label={`${label}: all healthy`} />
                  <p className="mt-1.5 text-xs font-medium text-primary-container">All healthy</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Sending capacity" subtitle="Daily limits set in Instantly">
            <div className="px-4 py-4 md:px-5">
              <p className="text-xs text-on-surface-variant">Combined daily limit of active mailboxes</p>
              <p className="mt-1 text-2xl font-semibold text-on-surface">180 <span className="text-xs font-normal text-on-surface-variant">emails / day</span></p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function ClientsScreen() {
  return (
    <div className="space-y-4">
      <Panel title="Campaign overview" subtitle="Click any campaign to open its detail view" action={<p className="text-xs text-on-surface-variant">{APP_CAMPAIGNS.length} campaigns</p>} bodyClassName="overflow-x-auto rounded-b-lg">
        <table className="w-full min-w-[44rem] border-collapse text-[13px] tabular-nums">
          <thead>
            <tr className="bg-surface-container-low text-left text-xs text-on-surface-variant">
              <th className="px-3 py-2 font-medium">Campaign</th>
              <th className="px-1.5 py-2 font-medium">Status</th>
              <th className="px-1.5 py-2 text-right font-medium">Emails sent</th>
              <th className="px-1.5 py-2 text-right font-medium">Prospects</th>
              <th className="px-1.5 py-2 text-right font-medium">Human replies</th>
              <th className="px-1.5 py-2 text-right font-medium">Reply rate</th>
              <th className="px-1.5 py-2 text-right font-medium">Positive</th>
              <th className="px-1.5 py-2 text-right font-medium">Positive rate</th>
              <th className="px-1.5 py-2 text-right font-medium">Bounces</th>
              <th className="px-3 py-2 text-right font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {APP_CAMPAIGNS.map((c) => (
              <tr key={c.name}>
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-on-surface">
                  <span className={clsx('mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle', c.status === 'active' ? 'bg-primary-container' : 'bg-outline')} aria-hidden="true" />
                  {c.name}
                </td>
                <td className="px-1.5 py-2.5"><StatusBadge status={c.status} /></td>
                <td className="px-1.5 py-2.5 text-right">{fmt(c.emailsSent)}</td>
                <td className="px-1.5 py-2.5 text-right">{fmt(c.prospects)}</td>
                <td className="px-1.5 py-2.5 text-right">{c.replies}</td>
                <td className="px-1.5 py-2.5 text-right font-semibold text-primary-container">{rate(c.replies, c.prospects)}</td>
                <td className="px-1.5 py-2.5 text-right">{c.positive}</td>
                <td className="px-1.5 py-2.5 text-right">{rate(c.positive, c.prospects)}</td>
                <td className="px-1.5 py-2.5 text-right">{c.bounces}</td>
                <td className="px-3 py-2.5 text-right text-on-surface-variant">{c.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Panel
          title="Email Infrastructure"
          subtitle="Synced mailboxes are in Infrastructure. The figures below are entered by your team."
          action={<span className="rounded-full bg-success-container px-2.5 py-0.5 text-xs font-semibold tracking-wide text-on-success-container">INSTANTLY</span>}
        >
          <div className="space-y-3 px-4 py-4 md:px-5">
            <div className="flex items-start justify-between gap-3 rounded-lg border border-outline-variant/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-on-surface">Mailboxes, warmup and domains</p>
                <p className="mt-0.5 text-xs text-on-surface-variant">Synced from Instantly: the mailboxes this client&apos;s campaigns send from, their warmup health and DNS checks.</p>
              </div>
              <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
            </div>
            <p className="text-xs text-on-surface-variant">Entered by your team in Klaroh. Not synced from the sending platform.</p>
            {[
              { label: 'Total Sending Capacity', icon: RefreshCcw },
              { label: 'Active Inboxes', icon: Mail },
            ].map((r) => (
              <div key={r.label} className="rounded-lg border border-outline-variant/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                    <r.icon size={14} className="text-on-surface-variant" aria-hidden="true" /> {r.label}
                  </p>
                  <Pencil size={13} className="text-on-surface-variant" aria-hidden="true" />
                </div>
                <p className="mt-2 text-base text-on-surface-variant/70">Not set</p>
                <p className="text-xs text-on-surface-variant">Entered by your team</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Recent Activity" subtitle="Campaign start dates, last 14 days. Sync status is shown at the top.">
          <ul className="px-4 py-4 md:px-5">
            <li className="flex gap-4 text-sm">
              <span className="w-12 shrink-0 text-xs text-on-surface-variant">Sep 28</span>
              <span className="text-on-surface">Campaign started: D2C</span>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Screen({ k }: { k: ScreenKey }) {
  switch (k) {
    case 'campaigns':
      return <CampaignsScreen />;
    case 'infrastructure':
      return <InfrastructureScreen />;
    case 'clients':
      return <ClientsScreen />;
    default:
      return <OverviewScreen />;
  }
}

// ── frame ───────────────────────────────────────────────────────────────────

function TrialCard() {
  return (
    <div className="mx-3 rounded-lg border border-on-primary/20 bg-on-primary/5 p-3 text-on-primary">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>Free trial</span>
        <span className="font-normal text-on-primary/70">11 days left</span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-on-primary/20">
        <div className="h-1 w-[22%] rounded-full bg-on-primary" />
      </div>
      <p className="mt-2.5 text-xs font-semibold">Switch to paid plan →</p>
    </div>
  );
}

export function DemoFrame({ interactive = true, initial = 'overview', onChange, size = 'tour' }: { interactive?: boolean; initial?: ScreenKey; onChange?: (k: ScreenKey) => void; size?: 'hero' | 'tour' }) {
  const [active, setActive] = useState<ScreenKey>(initial);
  const id = useId();
  const tabs = SCREENS;

  const scroller = useRef<HTMLDivElement>(null);

  const select = (k: ScreenKey) => {
    setActive(k);
    scroller.current?.scrollTo({ top: 0 });
    onChange?.(k);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const go = (n: number) => {
      const next = tabs[(n + tabs.length) % tabs.length];
      select(next.key);
      document.getElementById(`${id}-tab-${next.key}`)?.focus();
    };
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    if (e.key === 'Home') { e.preventDefault(); go(0); }
    if (e.key === 'End') { e.preventDefault(); go(tabs.length - 1); }
  };

  const hero = size === 'hero';

  return (
    <div className="lp-frame-shadow overflow-hidden rounded-2xl border border-outline-variant/50 bg-background font-sans">
      <div className={clsx('flex flex-col lg:flex-row', hero ? 'lg:h-[700px]' : 'lg:h-[760px]')}>
        {/* sidebar: the app's own green chrome; on small screens it becomes a scrolling tab row */}
        <div className="flex shrink-0 flex-col bg-primary lg:w-[184px]">
          <div className="hidden items-center gap-2 px-4 pb-4 pt-5 lg:flex">
            <Image src="/logo.svg" alt="" width={24} height={24} className="brightness-0 invert" />
            <span className="text-lg font-semibold tracking-tight text-on-primary">Klaroh</span>
          </div>
          <div
            role={interactive ? 'tablist' : undefined}
            aria-label={interactive ? 'Product tour' : undefined}
            aria-orientation="vertical"
            className="flex gap-1 overflow-x-auto px-2 py-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-3 lg:pb-6"
          >
            {NAV.map((t) => {
              const tabIndex = tabs.findIndex((s) => s.key === t.key);
              const isTab = tabIndex >= 0;
              const on = isTab && active === t.key;
              const Icon = t.icon;
              const common = clsx(
                'relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-[color,background-color,transform] duration-200',
                on ? 'bg-on-primary/10 text-on-primary' : 'text-on-primary/70',
                interactive && isTab && 'active:scale-[0.98]',
                interactive && isTab && !on && 'hover:bg-on-primary/5 hover:text-on-primary'
              );
              const inner = (
                <>
                  {on && (
                    <m.span
                      layoutId={interactive ? `${id}-bar` : undefined}
                      className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary-fixed lg:block"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon size={16} aria-hidden="true" />
                  {t.label}
                </>
              );
              return interactive && isTab ? (
                <button
                  key={t.key}
                  id={`${id}-tab-${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls={`${id}-panel`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => select(t.key as ScreenKey)}
                  onKeyDown={(e) => onKey(e, tabIndex)}
                  className={clsx(common, 'min-h-11 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fixed')}
                >
                  {inner}
                </button>
              ) : (
                <span key={t.key} className={clsx(common, 'pointer-events-none', !isTab && 'hidden lg:flex')} aria-hidden="true">
                  {inner}
                </span>
              );
            })}
          </div>
          <div className="mt-auto hidden pb-4 lg:block" aria-hidden="true">
            <TrialCard />
            <div className="mt-3 space-y-1 px-3 text-sm font-medium text-on-primary/70">
              <span className="flex items-center gap-2.5 px-3 py-2"><SlidersHorizontal size={16} /> Settings</span>
              <span className="flex items-center gap-2.5 px-3 py-2"><ChevronsLeft size={16} /> Collapse</span>
            </div>
            <div className="mx-3 mt-2 flex items-center gap-2.5 border-t border-on-primary/15 px-1 pt-3 text-on-primary">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-on-primary/20 text-xs font-semibold">{WORKSPACE.initials}</span>
              <span className="flex-1 text-[13px] font-semibold">{WORKSPACE.name}</span>
              <MoreVertical size={15} className="text-on-primary/70" />
            </div>
          </div>
        </div>

        {/* content: scrolls like the app; in the hero it is cropped and fades out instead */}
        <div className="relative min-w-0 flex-1 bg-surface" id={`${id}-panel`} role={interactive ? 'tabpanel' : undefined} aria-labelledby={interactive ? `${id}-tab-${active}` : undefined}>
          <div ref={scroller} className={clsx('@container h-full p-4 md:p-6', hero ? 'overflow-hidden' : 'max-h-[640px] overflow-y-auto lg:max-h-none')} tabIndex={interactive ? 0 : undefined}>
            <AnimatePresence mode="wait" initial={false}>
              <m.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.25, ease: EASE }}>
                <PageHeader screen={active} />
                <Screen k={active} />
              </m.div>
            </AnimatePresence>
          </div>
          {hero && <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-20 bg-gradient-to-t from-surface to-transparent lg:block" aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
}

// The caption sits above the frame, so it stays in view when a tab changes the screen below it.
export function Tour() {
  const [active, setActive] = useState<ScreenKey>('overview');
  const { label, caption } = SCREENS.find((s) => s.key === active)!;
  return (
    <div>
      <p className="mb-5 min-h-[3.5rem] max-w-2xl text-base text-white/75 sm:min-h-0" aria-live="polite">
        <m.span key={active} className="block" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
          <strong className="font-semibold text-white">{label}:</strong> {caption}
        </m.span>
      </p>
      <DemoFrame onChange={setActive} />
    </div>
  );
}
