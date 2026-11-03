import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BarChart3, Check, FileSpreadsheet, Globe, Inbox, Link2, Minus, RefreshCw, Server } from 'lucide-react';
import { Cta, Draw, MobileMenu, Reveal, Stagger, StaggerItem } from './motion';
import { Tour } from './Demo';
import { Cell, CellGrid } from '@/components/analytics/ui';
import { StatusChip } from '@/components/ui/StatusChip';
import { WAITLIST_URL } from './links';
import { DOMAINS, MAILBOXES, REPORT, THREADS, num, pct } from './sample-data';

const wrap = 'mx-auto max-w-7xl';
const NAV_LINKS = [
  { href: '#tour', label: 'Product' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
  { href: '/resources', label: 'Resources' },
];

// On pages other than the landing page, in-page anchors point back at the landing page.
const linkHref = (href: string, home?: boolean) => (home && href.startsWith('#') ? `/${href}` : href);

// ── navigation ──────────────────────────────────────────────────────────────

// A floating pill that sits over the hero. Its own height is cancelled with a negative margin,
// so the dark hero starts at the very top of the page.
export function Nav({ home }: { home?: boolean } = {}) {
  return (
    <header className="pointer-events-none sticky top-0 z-50 -mb-[76px] h-[76px] px-4 pt-3 md:px-8">
      <div className="pointer-events-auto relative mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-2 rounded-full border border-white/25 bg-[#F2F5EF]/95 pl-4 pr-2 sm:gap-4 sm:pl-5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <a href={home ? '/' : '#top'} className="flex min-h-11 items-center gap-2" aria-label={home ? 'Klaroh home' : 'Klaroh, back to top'}>
          <Image src="/logo.svg" alt="" width={24} height={24} />
          <span className="text-lg font-semibold tracking-tight text-on-surface">Klaroh</span>
        </a>
        <nav aria-label="Page" className="hidden items-center justify-center gap-8 text-sm font-medium text-on-surface-variant md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={linkHref(l.href, home)} className="lp-link py-3 hover:text-primary">{l.label}</a>
          ))}
        </nav>
        <div className="flex items-center justify-self-end sm:gap-2">
          <Cta href={WAITLIST_URL} small>Join the waitlist</Cta>
          <MobileMenu links={NAV_LINKS.map((l) => ({ ...l, href: linkHref(l.href, home) }))} />
        </div>
      </div>
    </header>
  );
}

// ── problem: five fragments vs one view ─────────────────────────────────────

const TOOLS = [
  { icon: BarChart3, label: 'Campaign results', where: 'In your sending tool', offset: 'lg:mt-0' },
  { icon: Inbox, label: 'Replies', where: 'In a shared inbox', offset: 'lg:mt-8' },
  { icon: Server, label: 'Mailbox status', where: 'In another dashboard', offset: 'lg:mt-3' },
  { icon: Globe, label: 'Domain checks', where: 'In a separate tool', offset: 'lg:mt-10' },
  { icon: FileSpreadsheet, label: 'Client reports', where: 'In a spreadsheet you rebuild weekly', offset: 'lg:mt-5' },
];

export function Problem() {
  return (
    <section className="lp-paper px-4 pb-24 pt-24 md:px-8 md:pb-32 xl:pt-[calc(300px+7rem)]">
      <div className={wrap}>
        <Reveal className="max-w-4xl">
          <h2 className="lp-h2 text-on-surface">
            Your outbound lives in <em className="text-primary-container">five different tabs.</em>
          </h2>
          <p className="lp-lede mt-6 max-w-2xl text-on-surface-variant">
            Checking on one client means opening every tool, then rebuilding it all into a report by hand.
          </p>
        </Reveal>

        {/* Before: five loose fragments, deliberately uneven. Compact rows on small screens. */}
        <p className="mt-14 text-sm font-medium text-on-surface-variant">Without Klaroh: five places to check</p>
        <Stagger className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-start lg:gap-4">
          {TOOLS.map(({ icon: Icon, label, where, offset }) => (
            <StaggerItem key={label} className={offset}>
              <div className="flex items-center gap-4 rounded-2xl border border-dashed border-outline bg-white/60 px-5 py-4 lg:block lg:p-5">
                <Icon size={20} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
                <div className="lg:mt-5">
                  <p className="text-base font-semibold text-on-surface">{label}</p>
                  <p className="mt-0.5 text-sm text-on-surface-variant lg:mt-1">{where}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        {/* The join: one line carries all five into a single view. */}
        <div className="flex flex-col items-center pb-8" aria-hidden="true">
          <span className="h-14 w-px bg-primary-container/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary-container" />
        </div>

        {/* After: the same five, in one panel. */}
        <Reveal>
          <div className="lp-ink overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/15 px-6 py-5 md:px-8">
              <Image src="/logo.svg" alt="" width={22} height={22} className="brightness-0 invert" />
              <p className="text-lg font-semibold text-white">With Klaroh</p>
              <p className="w-full text-sm text-white/75 sm:ml-auto sm:w-auto">One view of all five, for every client</p>
            </div>
            <ul className="grid divide-white/15 sm:grid-cols-2 sm:divide-x lg:grid-cols-5">
              {TOOLS.map(({ label }) => (
                <li key={label} className="flex items-center gap-3 border-b border-white/15 px-6 py-5 text-[15px] text-white last:border-b-0 sm:border-b-0 md:px-8">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-[#04251A]" aria-hidden="true">
                    <Check size={12} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── product tour (dark, the interface is the content) ───────────────────────

export function TourSection() {
  return (
    <section id="tour" className="lp-ink px-4 py-24 md:px-8 md:py-32">
      <div className={wrap}>
        <Reveal className="max-w-3xl">
          <h2 className="lp-h2 text-white">
            See the product <em className="text-primary-fixed">before you join.</em>
          </h2>
          <p className="lp-lede mt-6 max-w-2xl text-white/75">This is the Klaroh interface, filled with sample data. Switch between its four views to see what each one answers.</p>
        </Reveal>
        <Reveal delay={0.1} className="mt-10">
          <Tour />
        </Reveal>
        <Reveal className="mt-10">
          <Cta href={WAITLIST_URL} variant="mint" large>
            Join the waitlist <ArrowRight size={16} aria-hidden="true" />
          </Cta>
        </Reveal>
      </div>
    </section>
  );
}

// ── how it works ────────────────────────────────────────────────────────────

const STEPS = [
  { verb: 'Connect', body: 'Add your Instantly API key once. It is validated, then encrypted.' },
  { verb: 'Select', body: 'Pick the campaigns each client should see. Only those are imported.' },
  { verb: 'Monitor', body: 'Watch results, replies and mailbox status side by side, with the last sync time shown.' },
  { verb: 'Share', body: 'Send each client a private link. You choose what they see.' },
];

export function How() {
  return (
    <section id="how" className="lp-paper px-4 pb-8 pt-24 md:px-8 md:pt-32">
      <div className={wrap}>
        <Reveal className="max-w-3xl">
          <h2 className="lp-h2 text-on-surface">
            From connected to <em className="text-primary-container">client-ready.</em>
          </h2>
        </Reveal>
        <div className="relative mt-16">
          {/* The line draws in once, left to right, in the order the steps happen. */}
          <Draw className="absolute left-0 right-0 top-0 hidden h-px bg-primary/30 lg:block" />
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {STEPS.map((s, i) => (
              <Reveal key={s.verb} delay={0.1 + i * 0.12} className="relative lg:pr-10 lg:pt-10">
                <span aria-hidden="true" className="absolute left-0 top-[-5px] hidden h-[11px] w-[11px] rounded-full bg-primary lg:block" />
                <h3 className="font-[family-name:var(--font-instrument)] text-5xl italic leading-[1.1] tracking-tight text-on-surface">
                  <span className="mb-3 block font-[family-name:var(--font-geist)] text-sm font-medium not-italic tracking-normal text-primary-container">Step {i + 1}<span className="sr-only">:</span></span>
                  {s.verb}
                </h3>
                <p className="mt-4 max-w-[17rem] text-[15px] leading-relaxed text-on-surface-variant">{s.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── features: replies, sending health, analytics, sharing; three compositions ─

const Dns = ({ ok, label }: { ok: boolean; label: string }) => (
  <StatusChip tone={ok ? 'good' : 'warning'} icon={ok ? Check : Minus}>
    {label}
  </StatusChip>
);

const iconBadge = 'flex h-11 w-11 items-center justify-center rounded-full';
const featureTitle = 'font-[family-name:var(--font-instrument)] text-4xl leading-[1.08] tracking-tight md:text-5xl';

export function Capabilities() {
  const domain = DOMAINS[1];
  const mailboxes = MAILBOXES.slice(0, 4);
  return (
    <section id="product" className="lp-paper px-4 pb-24 pt-24 md:px-8 md:pb-32 md:pt-32">
      <div className={wrap}>
        <Reveal className="max-w-3xl">
          <h2 className="lp-h2 text-on-surface">
            What Klaroh <em className="text-primary-container">does.</em>
          </h2>
          <p className="lp-lede mt-6 max-w-2xl text-on-surface-variant">Replies, sending health, campaign analytics and client reports. Klaroh reads this data from Instantly and never sends email itself.</p>
        </Reveal>

        <div className="mt-16 space-y-5">
          {/* 1. Replies: text left, the inbox it describes on the right. */}
          <Reveal>
            <div className="grid items-center gap-10 rounded-2xl border border-outline-variant/70 bg-white p-6 md:p-10 lg:grid-cols-[5fr_6fr] lg:gap-16">
              <div>
                <span className={`${iconBadge} bg-primary-fixed text-primary`}><Inbox size={20} aria-hidden="true" /></span>
                <h3 className={`${featureTitle} mt-6 text-on-surface`}>Read replies by client</h3>
                <p className="mt-4 max-w-md text-base leading-relaxed text-on-surface-variant">Prospect replies to every client&apos;s campaigns in one inbox. Filter by client and see each lead&apos;s status as marked in Instantly. Automatic replies are left out.</p>
              </div>
              {/* min-w-0: lets the snippets truncate instead of widening the grid column. */}
              <div className="min-w-0 font-sans">
                <ul className="divide-y divide-outline-variant/60 overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest" aria-label="Sample replies">
                  {THREADS.map((t) => (
                    <li key={t.name} className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 truncate text-[15px] font-medium text-on-surface">{t.name}</span>
                        <span className="ml-auto shrink-0"><StatusChip tone="good" icon={false}>{t.chip}</StatusChip></span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-on-surface-variant">{t.company} · {t.campaign}</p>
                      <p className="mt-1.5 line-clamp-2 text-sm text-on-surface">{t.snippet}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-on-surface-variant">Sample data</p>
              </div>
            </div>
          </Reveal>

          {/* 2. Monitor: a dark, full-width band. Copy on top, the checks spread beneath it. */}
          <Reveal>
            <div className="lp-ink rounded-2xl p-6 md:p-10">
              <div className="max-w-2xl">
                <span className={`${iconBadge} bg-primary-fixed text-[#04251A]`}><Server size={20} aria-hidden="true" /></span>
                <h3 className={`${featureTitle} mt-6 text-white`}>Check mailbox and domain health</h3>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-white/75">Mailbox status, warmup scores, and SPF, DKIM, DMARC and MX checks for each sending domain, next to your results.</p>
              </div>
              <div className="mt-10 grid gap-4 font-sans lg:grid-cols-[1.25fr_1fr]">
                <ul className="divide-y divide-outline-variant/60 overflow-hidden rounded-xl bg-white" aria-label="Sample mailboxes">
                  {mailboxes.map((m) => (
                    <li key={m.email} className="flex items-center gap-3 px-5 py-4">
                      <span className="min-w-0 truncate text-[15px] font-medium text-on-surface">{m.email}</span>
                      <span className="ml-auto shrink-0">
                        <StatusChip tone={m.status === 'Active' ? 'good' : m.status === 'Sending error' ? 'critical' : 'warning'}>{m.status}</StatusChip>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col justify-between gap-6 rounded-xl bg-white p-5">
                  <div>
                    <p className="text-sm text-on-surface-variant">Sending domain</p>
                    <p className="mt-1 break-all text-lg font-semibold text-on-surface">{domain.domain}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Dns ok={domain.spf} label="SPF" />
                    <Dns ok={domain.dkim} label="DKIM" />
                    <Dns ok={domain.dmarc} label="DMARC" />
                    <Dns ok={domain.mx} label="MX" />
                  </div>
                  <p className="text-xs text-on-surface-variant">Sample data</p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* 3. Analyze and share: one panel, two halves. */}
          <Reveal>
            <div className="grid overflow-hidden rounded-2xl border border-outline-variant/70 bg-white lg:grid-cols-2 lg:divide-x lg:divide-outline-variant/70">
              <div className="flex flex-col justify-between gap-10 p-6 md:p-10">
                <div>
                  <span className={`${iconBadge} bg-primary-fixed text-primary`}><BarChart3 size={20} aria-hidden="true" /></span>
                  <h3 className={`${featureTitle} mt-6 text-on-surface`}>Compare campaigns side by side</h3>
                  <p className="mt-4 max-w-md text-base leading-relaxed text-on-surface-variant">Reply and positive rates on one fixed definition, results by sequence step, and cost per positive response from the campaign cost you enter.</p>
                </div>
                <div className="font-sans">
                  <CellGrid className="grid-cols-3 overflow-hidden rounded-xl border border-outline-variant/70">
                    <Cell label="Reply rate" value={pct(REPORT.replies, REPORT.prospects)} />
                    <Cell label="Positive" value={String(REPORT.positive)} />
                    <Cell label="Per positive" value={`$${Math.round(REPORT.cost / REPORT.positive)}`} />
                  </CellGrid>
                  <p className="mt-3 text-xs text-on-surface-variant">Sample data</p>
                </div>
              </div>
              <div className="flex flex-col justify-between gap-10 border-t border-outline-variant/70 bg-primary-fixed/25 p-6 md:p-10 lg:border-t-0">
                <div>
                  <span className={`${iconBadge} bg-white text-primary`}><Link2 size={20} aria-hidden="true" /></span>
                  <h3 className={`${featureTitle} mt-6 text-on-surface`}>Share a report with each client</h3>
                  <p className="mt-4 max-w-md text-base leading-relaxed text-on-surface-variant">Send each client a private link to their own report. You choose what they see, and you can replace the link at any time.</p>
                </div>
                <div className="rounded-xl bg-white p-5 font-sans text-on-surface shadow-modal">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone="good">Producing results</StatusChip>
                    <StatusChip tone="neutral" icon={false}>Sample data</StatusChip>
                  </div>
                  <p className="mt-3 text-lg leading-snug">We reached {num(REPORT.prospects)} prospects and {REPORT.replies} replied. {REPORT.positive} responded positively.</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ── trust: shown vs withheld ────────────────────────────────────────────────

// Same names as the product's Overview, so the page and the app describe one set of numbers.
const SHOWN = ['Emails sent', 'Prospects contacted', 'Human replies, without auto-replies', 'Positive responses, as marked in Instantly', 'Bounces', 'Reply rate and positive rate', 'Cost per positive response, from the cost you enter'];
const WITHHELD = [
  ['Open rate', 'Tracking is not reliable enough.'],
  ['Meetings', 'Not reliably reported yet.'],
  ['Revenue', 'No verified revenue data.'],
];

export function Honesty() {
  return (
    <section className="bg-white px-4 py-24 md:px-8 md:py-32">
      <div className={wrap}>
        <Reveal className="max-w-4xl">
          <h2 className="lp-h2 text-on-surface">
            If we cannot verify a number, <em className="text-primary-container">we do not show it.</em>
          </h2>
          <p className="lp-lede mt-6 max-w-2xl text-on-surface-variant">
            Every metric has one definition. When a figure is unreliable, Klaroh withholds it and says why, instead of showing a confident zero.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-14">
          <div className="grid overflow-hidden rounded-2xl border border-outline-variant/70 lg:grid-cols-[1.1fr_1fr]">
            <div className="p-6 md:p-10">
              <h3 className="lp-h3 text-on-surface">Shown in Klaroh</h3>
              <ul className="mt-6 divide-y divide-outline-variant/60 border-y border-outline-variant/60">
                {SHOWN.map((t) => (
                  <li key={t} className="flex items-center gap-4 py-4 text-lg text-on-surface">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary" aria-hidden="true">
                      <Check size={14} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            {/* Hatched: the fields are intentionally empty, and the page says why. */}
            <div className="lp-hatch border-t border-outline-variant/70 bg-[#F2F5EF] p-6 md:p-10 lg:border-l lg:border-t-0">
              <h3 className="lp-h3 text-on-surface">Not shown yet</h3>
              <ul className="mt-6 space-y-3">
                {WITHHELD.map(([t, why]) => (
                  <li key={t} className="rounded-xl border border-dashed border-outline bg-white/80 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg font-medium text-on-surface">{t}</span>
                      <StatusChip tone="neutral" icon={Minus}>Not shown</StatusChip>
                    </div>
                    <p className="mt-1 text-[15px] text-on-surface-variant">{why}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-5 flex items-start gap-3 text-[15px] text-on-surface-variant">
            <RefreshCw size={18} className="mt-0.5 shrink-0 text-primary-container" aria-hidden="true" />
            Klaroh syncs your data regularly and shows when each connection last synced. It is a clear view, not a live feed.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ── FAQ ─────────────────────────────────────────────────────────────────────

// Ordered by what decides joining the beta: fit, compatibility, data, access, price.
export const FAQ = [
  ['Who is Klaroh for?', 'Cold email and lead generation agencies running outbound for several clients, and founders or GTM teams running outbound across multiple accounts.'],
  ['Does Klaroh send emails or replace Instantly?', 'No. Your sending tool runs the campaigns. Klaroh reads data from it and shows performance across your outbound. Today the only connection is Instantly.'],
  ['Is the data real-time?', 'No. Klaroh syncs your campaign data regularly and always shows when it last synced. A failed sync is shown as failed, not hidden.'],
  ['What can my clients see?', 'Only what you choose, on a private link made for that client. They never see your other clients or your account, and you can rotate the link any time.'],
  ['How does the beta work?', 'We are inviting beta users in stages over the next couple of months. Join the waitlist and we will send you an invitation link when your access is ready. We ask beta users for feedback as they use Klaroh.'],
  ['How much does it cost?', 'Prices are shared with your invitation. Beta members get a discounted price for their first 3 months.'],
  ['Is Klaroh finished?', 'No, it is in private beta. What is on this page is what Klaroh does today. Deeper automation and recommendations are ideas for later, not features you can use now.'],
  ['Where do the numbers come from?', 'Directly from your connected sending platform. Anything Klaroh calculates, like reply rate, follows one fixed definition. Cost figures use amounts you enter.'],
  ['Why ask about API keys?', 'Connecting Instantly takes an API key. Knowing up front whether you are comfortable with that helps us plan onboarding. Klaroh validates the key with Instantly and encrypts it before storing it.'],
];

export function Faq() {
  return (
    <section id="faq" className="lp-paper px-4 py-24 md:px-8 md:py-32">
      <div className={`${wrap} grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-24`}>
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="lp-h2 text-on-surface">
            Straight <em className="text-primary-container">answers.</em>
          </h2>
        </Reveal>
        <Reveal delay={0.05} className="border-t border-on-surface/80">
          {FAQ.map(([q, a]) => (
            <details key={q} className="lp-faq group border-b border-outline-variant">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-medium text-on-surface transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                {q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-outline text-lg leading-none text-primary transition-transform duration-300 group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="max-w-prose pb-7 text-base leading-relaxed text-on-surface-variant">{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ── the close: invitation and footer share one dark ground ──────────────────

export function Join() {
  return (
    <section id="join" className="lp-ink px-4 pb-20 pt-24 md:px-8 md:pb-24 md:pt-32">
      <div className={wrap}>
        <Reveal>
          <p className="text-sm font-medium text-primary-fixed">Private beta</p>
          <h2 className="lp-display mt-5 max-w-5xl pb-2 text-white">
            Help shape Klaroh <em className="text-primary-fixed">with your own clients.</em>
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-12 lg:grid-cols-12 lg:items-end">
          <Reveal delay={0.05} className="lg:col-span-6">
            <p className="lp-lede max-w-xl text-white/75">
              We are working with a small group of beta users and opening access in stages over the next couple of months.
            </p>
            <ul className="mt-8 space-y-3 text-base text-white">
              {['Beta members get a discounted price for 3 months', 'Built for cold email agencies and GTM teams', 'Works with Instantly today'].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-[#04251A]" aria-hidden="true">
                    <Check size={12} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1} className="lg:col-span-5 lg:col-start-8">
            <p className="max-w-sm text-base text-white/75"><strong className="font-medium text-white">Next step:</strong> fill in the waitlist form. We will send your invitation link when your access is ready.</p>
            <Cta href={WAITLIST_URL} variant="mint" large className="mt-6 !h-16 !px-10 !text-lg">
              Join the waitlist <ArrowRight size={18} aria-hidden="true" />
            </Cta>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function Footer({ home }: { home?: boolean } = {}) {
  return (
    <footer className="lp-ink relative overflow-hidden px-4 pb-6 md:px-8">
      <div className={wrap}>
        <div className="flex flex-col items-start justify-between gap-6 border-t border-white/15 py-8 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="" width={22} height={22} className="brightness-0 invert" />
            <span className="text-lg font-semibold tracking-tight text-white">Klaroh</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-white/75">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={linkHref(l.href, home)} className="lp-link inline-flex min-h-11 items-center hover:text-white">{l.label}</a>
            ))}
            <Link href="/auth/login" className="lp-link inline-flex min-h-11 items-center hover:text-white">Sign in</Link>
          </nav>
          <p className="text-xs text-white/65">© {new Date().getFullYear()} Klaroh</p>
        </div>
      </div>
    </footer>
  );
}
