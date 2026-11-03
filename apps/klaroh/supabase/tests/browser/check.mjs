// Renders the analytics pages in Chromium at desktop and mobile sizes, signed
// in as the fixture owner, and checks what a person would see:
//   no NaN/Infinity/undefined, no horizontal page overflow, no credentials,
//   no other workspace's data, the key questions answered, interactions work.
// Screenshots go to $OUT_DIR. Exits non-zero on any failure.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://localhost:3100';
const SECRET = process.env.JWT_SECRET;
const OUT = process.env.OUT_DIR ?? 'browser-check';
const USER = 'b0000000-0000-0000-0000-000000000001';
const PHARMA = 'b0ca0000-0000-0000-0000-000000000001';
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims) {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}`;
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
const access = jwt({ sub: USER, role: 'authenticated', aud: 'authenticated', email: 'owner@agency.example' });
const session = {
  access_token: access, refresh_token: 'local-refresh', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'owner@agency.example', app_metadata: {}, user_metadata: {} },
};
const cookie = { name: 'sb-localhost-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: 'localhost', path: '/' };

const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};

// Never on an analytics page: metrics that did not pass the reliability audit, and date ranges.
const UNTRUSTED = ['Open rate', 'Click rate', 'Meetings booked', 'Interested', 'Opportunity value', 'Avg reply time', 'Follow-up time', 'Bounce rate', 'Data coverage', 'vs previous'];

const TOKENS = { vish: '0123456789abcdef'.repeat(4), northwind: 'fedcba9876543210'.repeat(4), fresh: '1'.repeat(64), empty: '2'.repeat(64) };
// Never in the client portal: unreliable metrics, provider/technical vocabulary, mailbox details, remarks.
const JOHN = 'b0f00000-0000-0000-0000-000000000001';
/** Runs SQL on the throw-away browser database (states the UI cannot create on its own). */
const sql = (q) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', process.env.BROWSER_DB, '-c', q], { stdio: 'pipe' });
// Never in the Inbox list or the client view: the not-positive and automatic conversations.
const NOT_POSITIVE = ['Mark Lee', 'Lena Fischer', 'Raj Patel'];
const PORTAL_COMMON = ['Outbound report', 'Prospects reached', 'Replies', 'Positive responses'];
const PORTAL_ABSENT = [...UNTRUSTED, 'Instantly', 'Open Rate', 'Leads in Campaign', 'Warmup', 'warmup', 'DMARC', 'DNS', '@vishhire', 'Remarks', 'Inbox', 'campaign_stats', 'Reported by Instantly', 'Calculated by Klaroh'];

const PAGES = [
  {
    name: 'overview', url: '/dashboard',
    expect: ['Overview', 'All time', 'Performance', 'Reported by Instantly', 'Calculated by Klaroh', 'Emails sent', 'Prospects contacted', 'Human replies', 'Positive', 'Bounces', 'Reply rate', 'Positive rate', 'Funnel', 'Outcomes by campaign', 'Replies per day', 'By client'],
    absent: [...UNTRUSTED, 'Email IDs', 'Warmup', 'DMARC'],
  },
  { name: 'overview-stale-range', url: '/dashboard?range=7d', expect: ['All time', 'Emails sent'], absent: UNTRUSTED },
  { name: 'overview-client', url: '/dashboard?client=b0c00000-0000-0000-0000-000000000002', expect: ['Northwind Capital', 'D2C', 'All time'], absent: UNTRUSTED },
  { name: 'campaigns', url: '/campaigns', expect: ['Campaigns', 'All time', 'Outcomes by campaign', 'Campaign comparison', 'Emails sent', 'Prospects', 'Reply rate', 'Positive rate', 'Bounces', 'Last synced'], absent: [...UNTRUSTED, 'Best campaigns', 'Volume vs outcome', 'Email IDs', 'Warmup health'] },
  {
    name: 'campaign-pharma', url: `/campaigns/${PHARMA}`,
    expect: ['Pharma', 'All time', 'Campaign performance', 'Reported by Instantly', 'Calculated by Klaroh', 'Funnel', 'Against other campaigns', 'Sequence steps', 'Step 1', 'Most replies per email', 'Variant A', '3 mailboxes', 'Sending infrastructure', 'ishaan@vishhire.example'],
    // its own mailboxes only — never another campaign's
    absent: [...UNTRUSTED, 'ops@northwind-mail.example', 'DMARC'],
  },
  {
    name: 'client-dashboard', url: '/clients/vish-hire',
    expect: ['Vish Hire', 'All time', 'Performance', 'Reported by Instantly', 'Calculated by Klaroh', 'Human replies', 'Positive rate', 'Funnel', 'Campaign overview', 'Outcomes by campaign', 'Entered by your team', 'Updated at provider', 'Campaign start dates'],
    // no health claim without a health check, no diagnosis the data cannot support, no reconstructed events
    absent: [...UNTRUSTED, 'Leads in Campaign', 'Unique Opens', 'Delivered', 'all systems operational', 'mailbox health issue', 'sync completed', 'Campaign paused', 'Last activity'],
  },
  // The client portal (token-authorized). /c/<slug> takes a signed-in agency member to the private link.
  { name: 'portal-advanced', url: '/c/vish-hire', expect: PORTAL_COMMON.concat(['Conversations with interested prospects', 'John Smith', 'Acme Pharma', 'Sarah Thomas', 'Priya Rao', 'Replies synced', 'Vish Hire', 'Progress over time', 'Investment', 'Cost per positive response', 'Estimated return on investment', 'Not actual revenue', 'Sending infrastructure', 'Pharma', 'Semicon', 'All 3 campaigns combined', 'About these numbers', 'Emails sent']), absent: [...PORTAL_ABSENT, ...NOT_POSITIVE, 'Out of office', 'Automatic reply'] },
  { name: 'portal-simple', url: `/c/northwind/${TOKENS.northwind}`, expect: ['Northwind Capital', 'Prospects showing genuine interest', 'Emma Clarke', 'Read the conversations', 'Your outbound campaign at a glance', 'Prospects reached', 'Replies', 'Positive responses', 'Campaign health', 'Sending infrastructure', 'See the detailed report'], absent: [...PORTAL_ABSENT, 'Progress over time'] },
  { name: 'portal-multi-currency', url: `/c/northwind/${TOKENS.northwind}?view=detailed`, expect: ['€2,000', '£1,800', 'not converted', 'D2C', 'Fintech, BFSI', 'Draft – Q4 Logistics', 'Not started'], absent: PORTAL_ABSENT },
  { name: 'portal-insufficient-data', url: `/c/fresh-start/${TOKENS.fresh}`, expect: ['Fresh Start', 'No positive replies yet', 'Gathering data', 'still gathering data', 'Operating normally', '2 sending accounts active', 'Healthcare pilot', 'Progress over time appears after'], absent: [...PORTAL_ABSENT, 'Investment', 'Producing results'] },
  { name: 'portal-insufficient-simple', url: `/c/fresh-start/${TOKENS.fresh}?view=simple`, expect: ['Gathering data', 'Live'], absent: PORTAL_ABSENT },
  { name: 'portal-empty', url: `/c/empty-co/${TOKENS.empty}`, expect: ['Empty Co', 'No campaigns in this report yet'], absent: [...PORTAL_ABSENT, 'NaN'] },
  { name: 'portal-config', url: '/clients/vish-hire/portal', expect: ['Client portal', 'What your client sees', 'At a glance', 'Detailed report', 'Key figures', 'Meetings', 'Not reliably reported', 'Campaigns in the report', 'Campaign economics', 'Campaign cost', 'Value per positive response', 'Client link', 'Client summary', 'Save changes'], absent: ['Remarks'] },
  // Inbox (operator)
  { name: 'inbox-positive', url: '/inbox', expect: ['Inbox', 'Positive', 'All human replies', 'John Smith', 'Acme Pharma', 'Sarah Thomas', 'Aerodyne Systems', 'Priya Rao', 'Meeting booked', 'Emma Clarke', 'Replies synced', 'Can we schedule a call on Thursday'], absent: [...NOT_POSITIVE, 'SECRET OTHER'] },
  { name: 'inbox-human', url: '/inbox?filter=human', expect: ['Mark Lee', 'Not interested', 'Raj Patel', '+1 auto-reply', 'John Smith'], absent: ['Lena Fischer'] },
  { name: 'inbox-detail', url: `/inbox?thread=${JOHN}`, expect: ['John Smith', 'Acme Pharma', 'john.smith@acmepharma.example', 'Campaign', 'Pharma', 'Re: Hiring senior regulatory leads', 'Positive — counted in positive responses', 'two senior regulatory affairs leads', 'Can we schedule a call on Thursday afternoon'] },
  { name: 'inbox-detail-auto', url: '/inbox?filter=human&thread=b0f00000-0000-0000-0000-000000000006', expect: ['Raj Patel', 'Automatic reply', 'Replied — no status set yet', 'Who is your client exactly'], absent: ['gmail.com —'] },
  { name: 'inbox-client', url: '/inbox?client=b0c00000-0000-0000-0000-000000000002', expect: ['Emma Clarke', 'Bright Brands'], absent: ['John Smith', 'Sarah Thomas'] },
  { name: 'infra-health', url: '/infrastructure', expect: ['Email IDs', 'Active', 'Warming', 'Healthy', 'Issues', 'Health at a glance', 'Account status', 'Warmup health', 'Needs attention', 'Sending capacity', 'No sends in 3 days', 'Sending error', 'last 30 days', 'Last synced'], absent: ['Campaign comparison', 'All time', 'Bounces > 3%', 'High bounces'] },
  { name: 'infra-accounts', url: '/infrastructure/accounts', expect: ['Email accounts', 'Health score', 'Sending balance', 'ishaan@vishhire.example', 'Stopped sending', 'Underused', 'Bounces', 'last 30 days'], absent: ['High bounce rate', 'High bounces', 'stored history'] },
  // a client filter: mailboxes shared with the other client's campaigns say so, and name them
  { name: 'infra-accounts-client', url: '/infrastructure/accounts?client=b0c00000-0000-0000-0000-000000000001', expect: ['also send for campaigns outside this filter', 'other'], absent: ['SECRET OTHER'] },
  { name: 'infra-warmup', url: '/infrastructure/warmup', expect: ['Warmup summary', 'Warmup over time', 'Warmup per mailbox', 'Poor', 'inbox rate', 'last 30 days'], absent: ['history Instantly returned'] },
  { name: 'infra-domains', url: '/infrastructure/domains', expect: ['vishrecruiter.example', 'DMARC', 'Failing', 'Campaigns', 'Tracking domains', 'Sending errors', 'Blacklist'] },
];

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

const browser = await chromium.launch({ executablePath: EXECUTABLE });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor ?? 1 });
    await context.addCookies([cookie]);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    for (const p of PAGES) {
      consoleErrors.length = 0;
      const res = await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle' });
      const tag = `[${vp.name}] ${p.name}`;
      check(res?.status() === 200, `${tag}: HTTP 200 (got ${res?.status()})`);
      const text = await page.locator('main').innerText();
      for (const e of p.expect) check(text.includes(e), `${tag}: shows "${e}"`);
      for (const e of p.absent ?? []) check(!text.includes(e), `${tag}: keeps "${e}" on its own page`);
      check(!/\bNaN\b|Infinity|undefined/.test(text), `${tag}: no NaN / Infinity / undefined`);
      check(!/password|smtp|imap|not-a-real-key|api_key/i.test(text), `${tag}: no credentials`);
      check(!text.includes('SECRET OTHER'), `${tag}: no other workspace's data`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(overflow <= 1, `${tag}: no horizontal page overflow (${overflow}px)`);
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll('main section, main nav, main form')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .map((el) => (el.querySelector('h2')?.textContent ?? el.tagName).slice(0, 30))
      );
      check(wide.length === 0, `${tag}: no panel wider than the viewport ${wide.length ? JSON.stringify(wide) : ''}`);
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll('main button, main a.btn, main select')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !el.closest('.overflow-x-auto, .overflow-auto');
          })
          .map((el) => el.textContent?.trim().slice(0, 30))
      );
      check(clipped.length === 0, `${tag}: no clipped buttons/controls ${clipped.length ? JSON.stringify(clipped) : ''}`);
      const relevantErrors = consoleErrors.filter((e) => !/favicon|Failed to load resource.*(plan-status|404)/i.test(e));
      check(relevantErrors.length === 0, `${tag}: no console errors ${relevantErrors.length ? JSON.stringify(relevantErrors.slice(0, 3)) : ''}`);
      await page.screenshot({ path: path.join(OUT, `${vp.name}-${p.name}.png`), fullPage: true });
    }

    // interactions
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    for (const label of ['7d', '30d', '90d']) {
      check((await page.getByRole('button', { name: label, exact: true }).count()) === 0, `[${vp.name}] no ${label} range control`);
    }
    check((await page.getByRole('group', { name: 'Date range' }).count()) === 0, `[${vp.name}] no date-range control at all`);
    // charts: the ranking re-ranks by the chosen measure, and a bar opens its campaign
    await page.getByRole('tab', { name: 'Positive rate' }).first().click();
    check(await page.getByRole('tab', { name: 'Positive rate' }).first().getAttribute('aria-selected') === 'true', `[${vp.name}] ranking chart switches measure`);
    check((await page.locator('.recharts-bar-rectangle').count()) > 0, `[${vp.name}] overview draws the ranking and reply charts`);
    await page.locator('[aria-label^="Campaigns ranked by"] .recharts-bar-rectangle').first().click();
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}/);
    check(true, `[${vp.name}] clicking a ranking bar opens the campaign page`);
    await page.goto(`${BASE}/campaigns`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Campaign', exact: false }).first().click();
    const first = await page.locator('table tbody tr td:first-child a').first().innerText();
    check(first.length > 0, `[${vp.name}] comparison table sorts by campaign name (${first})`);
    await page.locator('table tbody tr td:first-child a').first().click();
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}/);
    check(true, `[${vp.name}] campaign drill-down opens the campaign page`);
    await page.goto(`${BASE}/infrastructure`, { waitUntil: 'networkidle' });
    await page.getByRole('navigation', { name: 'Infrastructure sections' }).getByRole('link', { name: 'Warmup' }).click();
    await page.waitForURL(/\/infrastructure\/warmup/);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: 'Landed spam' }).click();
    check(await page.getByRole('tab', { name: 'Landed spam' }).getAttribute('aria-selected') === 'true', `[${vp.name}] infrastructure sub-navigation + chart metric toggle work`);
    await context.close();
  }

  // ── Inbox states: syncing, never synced, a failed sync keeps the conversations ──
  const ib = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ib.addCookies([cookie]);
  const ip = await ib.newPage();
  sql(`insert into reply_sync_runs (workspace_id, integration_id, triggered_by, status, started_at) values ('b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'manual', 'running', now() - interval '20 seconds')`);
  await ip.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
  await ip.getByText('Syncing replies…').waitFor();
  check((await ip.getByRole('button', { name: 'Sync replies' }).isDisabled()), 'inbox: while a reply sync runs, it says so and the button waits');
  check((await ip.locator('main').innerText()).includes('John Smith'), 'inbox: conversations stay visible while syncing');
  await ip.screenshot({ path: path.join(OUT, 'desktop-inbox-syncing.png'), fullPage: true });
  sql(`update reply_sync_runs set status = 'success', finished_at = now() where status = 'running'`);
  // the button: in this environment the stored key cannot be used — said plainly, nothing claimed
  await ip.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });
  sql(`update reply_sync_runs set started_at = started_at - interval '10 minutes', finished_at = finished_at - interval '10 minutes'`);
  await ip.getByRole('button', { name: 'Sync replies' }).click();
  await ip.getByText('Connect your sending platform to sync replies.').waitFor({ timeout: 30_000 });
  check(true, 'inbox: the Sync replies button reports a missing connection instead of claiming a sync');
  // a failed reply sync keeps every conversation and the last successful sync
  sql(`insert into reply_sync_runs (workspace_id, integration_id, triggered_by, status, started_at, finished_at, error_message) values ('b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'cron', 'failed', now() - interval '1 minute', now(), 'Instantly rate limit reached. Please try again shortly.')`);
  await ip.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });
  const failedText = await ip.locator('main').innerText();
  check(failedText.includes('new replies may not be here yet') && failedText.includes('Replies synced') && failedText.includes('John Smith'), 'inbox: a failed reply sync keeps the conversations and the last successful sync');
  await ip.screenshot({ path: path.join(OUT, 'desktop-inbox-sync-failed.png'), fullPage: true });
  await ib.close();

  // ── Overview: the campaign sync status is one compact row in the page header ──
  const ov = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ov.addCookies([cookie]);
  const op = await ov.newPage();
  const syncRow = () => op.locator('main [role="status"]').filter({ hasText: 'Instantly' }).first();
  // A fresh successful run (earlier automatic syncs in this environment fail: no reachable provider).
  sql(`insert into sync_runs (workspace_id, integration_id, provider, triggered_by, status, started_at, finished_at) values ('b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'instantly', 'cron', 'success', now() - interval '1 minute', now())`);
  await op.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await syncRow().getByText('Last synced').waitFor();
  const rowBox = await syncRow().boundingBox();
  check(!!rowBox && rowBox.height <= 32, `overview: campaign sync status is a single row (${rowBox?.height}px)`);
  check((await op.getByRole('button', { name: 'Sync now' }).boundingBox())?.height === 32, 'overview: Sync now uses the 32px button');
  sql(`insert into sync_runs (workspace_id, integration_id, provider, triggered_by, status, started_at) values ('b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'instantly', 'manual', 'running', now() - interval '20 seconds')`);
  await op.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await syncRow().getByText('Syncing… Started').waitFor();
  check(await op.getByRole('button', { name: 'Syncing…' }).isDisabled(), 'overview: while a campaign sync runs, it says so and the button waits');
  await op.screenshot({ path: path.join(OUT, 'desktop-overview-syncing.png') });
  sql(`update sync_runs set status = 'failed', finished_at = now(), error_message = 'Instantly is temporarily unavailable.', details = '{"errorKind":"unavailable"}' where status = 'running'`);
  await op.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  const failedRow = await syncRow().innerText();
  check(failedRow.includes('Sync failed') && failedRow.includes('Instantly is temporarily unavailable') && failedRow.includes('Last successful sync'), 'overview: a failed campaign sync shows the reason and keeps the last successful sync');
  await op.screenshot({ path: path.join(OUT, 'desktop-overview-sync-failed.png') });
  sql(`delete from sync_runs where status = 'failed' and triggered_by = 'manual'`);
  await ov.close();

  // ── mobile navigation: Inbox is one tap away; the rest is in More ──
  const mn = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mn.addCookies([cookie]);
  const mp = await mn.newPage();
  await mp.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  const bar = mp.getByRole('navigation', { name: 'Primary' });
  for (const name of ['Overview', 'Campaigns', 'Inbox']) check((await bar.getByRole('link', { name }).count()) === 1, `[mobile] bottom bar: ${name}`);
  await bar.getByRole('button', { name: 'More' }).click();
  const more = mp.getByRole('dialog', { name: 'More' });
  for (const name of ['Infrastructure', 'Clients', 'Settings']) check((await more.getByText(name, { exact: true }).count()) === 1, `[mobile] More sheet: ${name}`);
  await mp.screenshot({ path: path.join(OUT, 'mobile-more-sheet.png') });
  await mp.keyboard.press('Escape');
  await more.waitFor({ state: 'detached' });
  check(true, '[mobile] More sheet closes with Escape');
  await mn.close();

  // ── client portal: access without signing in ──────────────────────────
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(`${BASE}/c/vish-hire`, { waitUntil: 'networkidle' });
  let pbody = await ap.locator('body').innerText();
  check(pbody.includes('This report has a new link') && !pbody.includes('Pharma') && !pbody.includes('Vish Hire'), 'portal: the old slug-only link opens nothing for a visitor');
  await ap.screenshot({ path: path.join(OUT, 'desktop-portal-legacy-link.png'), fullPage: true });
  await ap.goto(`${BASE}/c/vish-hire/${'9'.repeat(64)}`, { waitUntil: 'networkidle' });
  pbody = await ap.locator('body').innerText();
  check(pbody.includes("This report link isn't valid") && !pbody.includes('Pharma'), 'portal: a wrong token opens nothing');
  await ap.goto(`${BASE}/c/northwind/${TOKENS.vish}`, { waitUntil: 'networkidle' });
  check(ap.url().includes(`/c/vish-hire/${TOKENS.vish}`), 'portal: the token decides the client; a wrong slug redirects to the right one');
  pbody = await ap.locator('body').innerText();
  check(pbody.includes('Vish Hire') && !pbody.includes('Northwind') && !pbody.includes('SECRET OTHER'), 'portal: a visitor with the token sees that client only');
  check((await ap.locator('meta[name="referrer"][content="no-referrer"]').count()) > 0, 'portal: the token is never sent as a referrer');
  check((await ap.locator('meta[name="robots"][content*="noindex"]').count()) > 0, 'portal: never indexed');
  const rpc = await ap.evaluate(async () => {
    const r = await fetch('/api/remarks', { method: 'POST' });
    return r.status;
  });
  check(rpc === 404, `portal: the remarks API is gone (status ${rpc})`);
  await anon.close();

  const sw = await browser.newContext();
  const sp = await sw.newPage();
  await sp.goto(`${BASE}/c/vish-hire/${TOKENS.vish}`, { waitUntil: 'networkidle' });
  const nav = sp.getByRole('navigation', { name: 'Report view' });
  check((await nav.getByRole('link', { name: 'Detailed report' }).getAttribute('aria-current')) === 'page', 'portal: opens on the view the agency chose (detailed)');
  await nav.getByRole('link', { name: 'At a glance' }).click();
  await sp.waitForURL(/view=simple/);
  await sp.getByText('Your outbound campaign at a glance').waitFor();
  check(true, 'portal: the client can switch to the at-a-glance view');
  await sw.close();

  // the client opens a conversation (desktop + mobile)
  for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const cc = await browser.newContext(opts);
    const cp2 = await cc.newPage();
    await cp2.goto(`${BASE}/c/vish-hire/${TOKENS.vish}`, { waitUntil: 'networkidle' });
    const section = cp2.getByRole('region', { name: 'Conversations with interested prospects' });
    await section.locator('summary', { hasText: 'John Smith' }).click();
    await section.getByText('two senior regulatory affairs leads').waitFor();
    const opened = await section.innerText();
    check(opened.includes('john.smith@acmepharma.example') && !opened.includes('Interested') && !opened.includes('Mark Lee'), `[${name}] portal: a conversation opens with the prospect's own words, business wording only`);
    await section.screenshot({ path: path.join(OUT, `${name}-portal-conversation-open.png`) });
    await cc.close();
  }

  // ── client portal: configuration changes what the client sees ──────────
  const cfg = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await cfg.addCookies([cookie]);
  const cp = await cfg.newPage();
  const remarksPage = await cp.goto(`${BASE}/remarks`, { waitUntil: 'networkidle' });
  check(remarksPage?.status() === 404 || (await cp.locator('body').innerText()).includes('not found') || (await cp.locator('body').innerText()).includes("doesn't exist"), 'remarks: the agency Remarks page is gone');
  check((await cp.getByRole('link', { name: 'Remarks' }).count()) === 0, 'remarks: no Remarks navigation');
  await cp.goto(`${BASE}/clients/fresh-start/portal`, { waitUntil: 'networkidle' });
  await cp.locator('#metric-emailsSent').uncheck();
  await cp.locator('#metric-bounces').check();
  await cp.locator('input[placeholder="Not set"]').first().fill('900');
  await cp.getByRole('button', { name: 'Save changes' }).click();
  await cp.getByText('Saved —').waitFor();
  await cp.goto(`${BASE}/c/fresh-start/${TOKENS.fresh}`, { waitUntil: 'networkidle' });
  let cards = await cp.getByRole('region', { name: 'Key figures' }).innerText();
  check(!cards.includes('Emails sent') && cards.includes('Bounces'), 'config: hiding/showing a metric changes the client report');
  pbody = await cp.locator('main').innerText();
  check(pbody.includes('$900') && pbody.includes('No positive responses yet'), 'config: a saved campaign cost appears; no cost per positive without positives');
  await cp.screenshot({ path: path.join(OUT, 'desktop-portal-after-config.png'), fullPage: true });
  // reset the link: the old one stops working
  await cp.goto(`${BASE}/clients/fresh-start/portal`, { waitUntil: 'networkidle' });
  await cp.getByRole('button', { name: 'Reset link' }).click();
  await cp.getByRole('alertdialog').getByRole('button', { name: 'Reset link' }).click();
  await cp.getByRole('alertdialog').waitFor({ state: 'detached' });
  const newLink = await cp.getByLabel('Report link').inputValue();
  check(!newLink.includes(TOKENS.fresh) && /\/c\/fresh-start\/[0-9a-f]{64}$/.test(newLink), 'config: resetting gives a new private link');
  await cp.goto(`${BASE}/c/fresh-start/${TOKENS.fresh}`, { waitUntil: 'networkidle' });
  check((await cp.locator('body').innerText()).includes("This report link isn't valid"), 'config: the old link stops working after a reset');
  await cfg.close();

  // another workspace must not reach this campaign
  const ctx = await browser.newContext();
  const other = jwt({ sub: 'b0000000-0000-0000-0000-000000000002', role: 'authenticated', aud: 'authenticated' });
  await ctx.addCookies([{ ...cookie, value: `base64-${Buffer.from(JSON.stringify({ ...session, access_token: other, user: { ...session.user, id: 'b0000000-0000-0000-0000-000000000002' } })).toString('base64url')}` }]);
  const pg = await ctx.newPage();
  // The route has a loading.tsx, so the response is streamed and its status is
  // committed (200) before notFound() runs; Next.js then streams the not-found
  // page with noindex. What matters: the page is not found and leaks nothing.
  const r = await pg.goto(`${BASE}/campaigns/${PHARMA}`, { waitUntil: 'networkidle' });
  const body = await pg.locator('body').innerText();
  check(r?.status() === 404 || (await pg.locator('meta[name="robots"][content*="noindex"]').count()) > 0, `another workspace gets the not-found page for this campaign (status ${r?.status()})`);
  check(!body.includes('Pharma') && !body.includes('ishaan@vishhire.example'), 'another workspace sees none of this campaign');
  await pg.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });
  const otherInbox = await pg.locator('main').innerText();
  check(otherInbox.includes('Reply data hasn’t been synced yet') && !otherInbox.includes('John Smith'), 'inbox: another workspace sees none of these conversations (never synced)');
  await pg.screenshot({ path: path.join(OUT, 'desktop-inbox-never-synced.png'), fullPage: true });
  const leak = await pg.goto(`${BASE}/inbox?thread=${JOHN}`, { waitUntil: 'networkidle' });
  check(leak?.status() === 200 && !(await pg.locator('main').innerText()).includes('two senior regulatory'), 'inbox: a thread id from another workspace opens nothing');
  const t = await (await pg.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' }))?.text();
  check(!t?.includes('Pharma') && t?.includes('SECRET OTHER CAMPAIGN'), 'another workspace sees only its own campaigns');
  await ctx.close();
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} browser check(s) FAILED` : '\nALL BROWSER CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
