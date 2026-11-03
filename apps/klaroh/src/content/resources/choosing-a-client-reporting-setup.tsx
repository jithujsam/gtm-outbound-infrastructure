import Link from 'next/link';
import { WAITLIST_URL } from '@/components/landing/links';
import type { Resource } from './types';

const INSTANTLY_PORTAL = 'https://help.instantly.ai/en/articles/8678006-agency-white-labeling';
const INSTANTLY_WARMUP = 'https://help.instantly.ai/en/articles/13939939-warmup-health-score';
const INSTANTLY_WORKSPACES = 'https://instantly.ai/blog/how-to-manage-10-client-workspaces-securely/';

const resource: Resource = {
  slug: 'choosing-a-client-reporting-setup',
  title: 'Spreadsheet, Instantly portal, custom dashboard or Klaroh: how to choose a client reporting setup',
  description:
    'A decision guide for cold email agencies: what each reporting setup costs in time and control, the questions that should decide it, and where Klaroh is and is not the right fit.',
  category: 'Choosing tools',
  published: '2026-10-10',
  updated: '2026-10-10',
  readingMinutes: 9,
  summary: (
    <>
      <p>
        There is no best client reporting setup, only one that fits your client count, your tolerance for upkeep, and how
        much control you want over what clients see. A spreadsheet is enough for a few clients. Instantly’s agency portal
        suits clients who want to explore the tool themselves. A custom dashboard gives you control at the price of
        maintenance. A dedicated reporting layer such as Klaroh trades flexibility for less weekly work.
      </p>
      <p>
        Answer six questions about your own agency, then use the comparison to see which option survives. This guide
        also lists where Klaroh is the wrong choice today.
      </p>
    </>
  ),
  sections: [
    {
      id: 'six-questions',
      title: 'Six questions that decide it',
      body: (
        <>
          <ol>
            <li>
              <strong>How many clients do you report on, and how many next quarter?</strong> Manual effort scales
              linearly with clients. A setup that is fine at three is painful at fifteen.
            </li>
            <li>
              <strong>Do clients explore, or do they read a summary?</strong> Some want to click into campaigns. Most
              want a verdict they can forward to their boss.
            </li>
            <li>
              <strong>Who maintains it when it breaks?</strong> Spreadsheets and automations fail quietly. Someone must own
              them.
            </li>
            <li>
              <strong>How much must you control the view?</strong> Particular campaigns, particular metrics, hiding the
              internals.
            </li>
            <li>
              <strong>Which sending platforms do you use?</strong> A tool that supports only one is no use for
              the client on another.
            </li>
            <li>
              <strong>What do you need beyond campaign totals?</strong> Date ranges, open rate, meetings, revenue,
              your own domain on the client link.
            </li>
          </ol>
        </>
      ),
    },
    {
      id: 'comparison',
      title: 'The four setups side by side',
      body: (
        <>
          <div className="rp-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Setup</th>
                  <th scope="col">Strongest when</th>
                  <th scope="col">Weakest when</th>
                  <th scope="col">Main cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Spreadsheet or slide deck</th>
                  <td>One to a few clients; you want full control of wording.</td>
                  <td>Client count grows; reports are due weekly.</td>
                  <td>Your time, every period.</td>
                </tr>
                <tr>
                  <th scope="row">Instantly agency portal</th>
                  <td>You use Instantly only; clients like to explore; you want your own subdomain.</td>
                  <td>You need a curated summary, or per-campaign visibility rules.</td>
                  <td>Required plan tier, DNS setup, manual invites.</td>
                </tr>
                <tr>
                  <th scope="row">Custom dashboard or automation</th>
                  <td>You have technical skill, unusual needs, or several sending platforms.</td>
                  <td>Nobody has time to maintain it.</td>
                  <td>Build time and ongoing upkeep.</td>
                </tr>
                <tr>
                  <th scope="row">Dedicated reporting layer (e.g. Klaroh)</th>
                  <td>Many clients on Instantly; you want a consistent client-ready view with little weekly work.</td>
                  <td>You need other platforms, date ranges, or full white-labelling today.</td>
                  <td>A subscription, and adopting its definitions.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="rp-caption">
            Our assessment from vendor documentation and our own product, not a measured benchmark. We have a commercial
            interest in one of the four options.
          </p>
        </>
      ),
    },
    {
      id: 'spreadsheets',
      title: 'When a spreadsheet is the right answer',
      body: (
        <>
          <p>
            Spreadsheets get dismissed too quickly. For a small number of clients, a spreadsheet you understand beats a
            tool you have to learn. They give you complete control over definitions and commentary, and the commentary
            is often what clients value most.
          </p>
          <p>
            They break down in predictable ways. Numbers are pasted rather than linked, so reports go stale. Each client
            gets a slightly different layout. And the person who built it becomes the only one who can update it. If you
            are spending more time assembling reports than improving campaigns, that is the signal to change.
          </p>
        </>
      ),
    },
    {
      id: 'instantly-portal',
      title: 'What Instantly’s own portal does and does not cover',
      body: (
        <>
          <p>
            Per <a href={INSTANTLY_PORTAL}>Instantly’s help article</a>, the white-label agency portal is available on
            the Hyper Growth and Light Speed plans. You add a CNAME record so clients log in at your own subdomain, upload
            your logo, and give each client access to sections such as Campaigns, Unibox, Analytics, CRM and Blocklist.
          </p>
          <p>The same article lists limits that matter if reporting is the goal:</p>
          <ul>
            <li>One agency portal per workspace.</li>
            <li>Clients with Campaigns access can see all campaigns in the workspace.</li>
            <li>Instantly does not send invitation emails, so you share each invite link yourself.</li>
          </ul>
          <p>
            Since agencies usually run one workspace per client (per{' '}
            <a href={INSTANTLY_WORKSPACES}>Instantly’s guide</a>, workspaces keep leads, campaigns and stats separate),
            this means a portal per client rather than one place where you see everyone. That can be exactly right: you
            keep the client’s live, full-detail view inside the tool they already trust. Verify current plan names and
            prices on Instantly’s site before relying on this.
          </p>
        </>
      ),
    },
    {
      id: 'custom',
      title: 'Building your own dashboard',
      body: (
        <>
          <p>
            Agencies do build their own: a no-code automation that pulls campaign metrics into a database, with a
            dashboard on top. We came across examples of this in community discussions, which tells us it is common
            enough to take seriously and not that it is the majority approach.
          </p>
          <p>Before you start, price these hidden items:</p>
          <ul>
            <li>Handling a field that changes or disappears upstream.</li>
            <li>Access control, so a client sees only their own data.</li>
            <li>Writing down metric definitions so reports stay consistent.</li>
            <li>Who fixes it on the morning a report is due.</li>
          </ul>
          <p>
            If you already have those skills and several platforms to unify, building can pay off. If you are building
            because nothing fits, check the alternatives first.
          </p>
        </>
      ),
    },
    {
      id: 'beyond-campaign-totals',
      title: 'Monitoring the sending setup, not just results',
      body: (
        <>
          <p>
            A campaign report tells clients what happened. Sending health tells you what is about to. Whatever tool you
            use, make sure someone looks at mailbox and domain status, not only reply counts.
          </p>
          <p>
            One caution on warmup scores. Instantly’s{' '}
            <a href={INSTANTLY_WARMUP}>health score documentation</a> defines the score as the share of warmup emails
            that reach the inbox over the past seven days and says it does not measure campaign placement. A good score
            is a good sign, not a guarantee. Its troubleshooting steps start with checking that MX, SPF, DKIM and DMARC
            are in place.
          </p>
          <p>
            Klaroh shows mailbox status, warmup scores and domain DNS checks (SPF, DKIM, DMARC, MX) as Instantly reports
            them, and lists problems the provider reports in a “needs attention” view. It is a list you see when you open
            the app, not an alert that comes to you.
          </p>
        </>
      ),
    },
    {
      id: 'klaroh-honest',
      title: 'Where Klaroh fits, and where it does not',
      body: (
        <>
          <p>
            Klaroh is an outbound reporting and visibility platform for cold email agencies and GTM teams, currently in
            private beta. It reads from your sending tool and does not send email.
          </p>
          <h3>Good fit if</h3>
          <ul>
            <li>You run outbound for several clients through Instantly.</li>
            <li>You want each client to have a private, curated report link you control and can rotate.</li>
            <li>You want one consistent definition of each metric across clients.</li>
            <li>You want campaign results, replies, mailbox status and domain checks in one place.</li>
          </ul>
          <h3>Not a fit today if</h3>
          <ul>
            <li>You use a sending platform other than Instantly. Instantly is the only supported source.</li>
            <li>You need real-time data. Syncing is daily plus when you open the app.</li>
            <li>You need a date-range view such as last 30 days. Figures are lifetime-to-date.</li>
            <li>You need open rate, meetings booked or revenue in client reports. These are not shown.</li>
            <li>You need a fully white-labelled portal on your own domain or in your brand colours. Your logo and agency name appear; custom domains and colours do not.</li>
            <li>You want to reply to prospects from the tool. The inbox is read-only.</li>
          </ul>
          <p>
            Pricing is not published. Beta members receive a discounted price for their first three months, and prices are
            shared with the invitation.
          </p>
          <p>
            <Link href="/#tour">Look at the product tour</Link> to judge the interface for yourself, or{' '}
            <a href={WAITLIST_URL}>join the beta waitlist</a> if it matches your list above.
          </p>
        </>
      ),
    },
  ],
  sources: [
    {
      label: 'Instantly help center: Agency white labeling',
      url: INSTANTLY_PORTAL,
      note: 'Primary documentation. Plans, setup, sections available to clients, one portal per workspace, all-campaign visibility, manual invites. Shows a relative “updated” label, no absolute date.',
    },
    {
      label: 'Instantly help center: Warmup health score',
      url: INSTANTLY_WARMUP,
      note: 'Primary documentation. Definition of the score over seven days, scope limited to warmup placement, troubleshooting steps.',
    },
    {
      label: 'Instantly: how to manage 10+ client workspaces securely',
      url: INSTANTLY_WORKSPACES,
      note: 'Vendor article, January 2026. Workspace separation of leads, campaigns and stats. Promotional.',
    },
  ],
  related: ['client-reporting-instantly-workspaces', 'reply-rate-positive-reply-rate-numbers-dont-match'],
};

export default resource;
