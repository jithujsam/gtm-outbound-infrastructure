import Link from 'next/link';
import { WAITLIST_URL } from '@/components/landing/links';
import type { Resource } from './types';

const INSTANTLY_WORKSPACES = 'https://instantly.ai/blog/how-to-manage-10-client-workspaces-securely/';
const INSTANTLY_ANALYTICS = 'https://help.instantly.ai/en/articles/6602310-analytics';
const INSTANTLY_PORTAL = 'https://help.instantly.ai/en/articles/8678006-agency-white-labeling';

const resource: Resource = {
  slug: 'client-reporting-instantly-workspaces',
  title: 'How to report Instantly campaign results to clients when every client has its own workspace',
  description:
    'Instantly keeps each client in a separate workspace, so there is no single view across clients. Four ways to build client reports, what to include, and what each costs you in time.',
  category: 'Client reporting',
  published: '2026-10-10',
  updated: '2026-10-10',
  readingMinutes: 8,
  summary: (
    <>
      <p>
        If you run each client in a separate Instantly workspace, every client’s numbers live in their own dashboard and
        Instantly says stats cannot be shared between workspaces. To report to clients you need something that collects
        those numbers in one place. The choices are manual exports, a spreadsheet, Instantly’s own agency portal, or a
        reporting layer built for the job.
      </p>
      <p>
        Pick by how many clients you have and how much of the report you want to rebuild by hand each week. Whatever you
        choose, report a short list of numbers you can define, say when the data was last updated, and leave out metrics
        you cannot defend.
      </p>
    </>
  ),
  sections: [
    {
      id: 'why-it-is-hard',
      title: 'Why multi-client reporting is awkward in Instantly',
      body: (
        <>
          <p>
            Instantly’s agency model is built around <strong>workspaces</strong>: separate environments for each client,
            reached through one login and a dropdown. According to{' '}
            <a href={INSTANTLY_WORKSPACES}>Instantly’s own guide to client workspaces</a> (January 2026), leads, campaigns
            and stats cannot be shared between workspaces, and each workspace has its own dashboard.
          </p>
          <p>
            That separation is good for client isolation. It is also why there is no built-in answer to “how are all my
            clients doing this week?” Each workspace shows one client at a time, and Instantly’s analytics page lets you{' '}
            <a href={INSTANTLY_ANALYTICS}>view or export emails sent, replies, positive reply rate and bounce rate for each
            workspace</a>, but turning those exports into something a client can read is still your job.
          </p>
          <p>
            Independent evidence on how widespread this pain is was thin when we researched this. Most of what we found
            came from vendor comparison pages, which are promotional, plus individual agencies describing the home-built
            dashboards and automations they use. Treat this article as a practical guide to the options, not as proof
            that every agency struggles with it.
          </p>
        </>
      ),
    },
    {
      id: 'what-clients-need',
      title: 'What a client report actually needs',
      body: (
        <>
          <p>
            Before choosing a tool, decide what the report must do. A client who pays for outbound wants to know three
            things: is work happening, is it producing conversations, and is anything wrong. A short report that answers
            those clearly beats a long one nobody reads.
          </p>
          <h3>A minimum viable report</h3>
          <ul>
            <li>
              <strong>Activity:</strong> emails sent and prospects contacted, so the client sees volume.
            </li>
            <li>
              <strong>Response:</strong> replies, with automatic replies such as out-of-office messages excluded or at
              least labelled, and reply rate with its definition written next to it.
            </li>
            <li>
              <strong>Outcomes:</strong> positive responses as your team has marked them. Say who marks them.
            </li>
            <li>
              <strong>Health:</strong> bounces, and any mailbox or sending issue you are already fixing.
            </li>
            <li>
              <strong>Freshness:</strong> the date and time the numbers were last updated.
            </li>
          </ul>
          <h3>What to leave out unless you can defend it</h3>
          <p>
            <strong>Open rate</strong> is the usual trap. Instantly’s own{' '}
            <a href="https://instantly.ai/blog/email-open-tracking-how-it-works-accuracy-rates-and-why-your-open-metrics-may-be-wrong">
              article on open tracking
            </a>{' '}
            (March 2026) explains that Apple pre-loads images whether or not the recipient reads the email and that
            security scanners can fire the tracking pixel with no human involved. A number that can be inflated by
            software is hard to explain to a client later.
          </p>
          <p>
            <strong>Meetings and revenue</strong> belong in a report only if you have a reliable source for them, such as
            your calendar or the client’s CRM. A guess presented as a result damages trust faster than a gap.
          </p>
        </>
      ),
    },
    {
      id: 'four-options',
      title: 'Four ways to build the report',
      body: (
        <>
          <p>
            These are the approaches we found agencies using or vendors offering. They are not mutually exclusive, and
            the right one changes as you add clients.
          </p>

          <h3>1. Manual exports and screenshots</h3>
          <p>
            Export or screenshot each workspace’s analytics, paste into a slide or document, add commentary. It needs no
            setup and works for one or two clients. The cost is time: every client, every reporting period, and the
            screenshot is out of date the moment you take it.
          </p>

          <h3>2. A shared spreadsheet or custom dashboard</h3>
          <p>
            Pull each workspace’s numbers into a spreadsheet, or automate it with a no-code tool or the Instantly API
            and put a dashboard on top. This gives you one view across clients and full control over definitions. It also
            makes you the maintainer: formulas break, an API change or a missing field can silently produce a wrong
            number, and you need to decide how clients get access without seeing each other’s data.
          </p>

          <h3>3. Instantly’s agency portal</h3>
          <p>
            Instantly offers a <a href={INSTANTLY_PORTAL}>white-label agency portal</a>. Per its help article, it is
            available on the Hyper Growth and Light Speed plans, runs on a subdomain you point at Instantly with a CNAME
            record, and lets you give each client access to sections such as Campaigns, Unibox, Analytics, CRM and
            Blocklist. Two limits matter for reporting:
          </p>
          <ul>
            <li>
              Clients with Campaigns access can see all campaigns in the workspace, so you cannot limit a client to a
              chosen subset.
            </li>
            <li>The portal is configured per workspace, and Instantly does not send the invitation, so you share the link yourself.</li>
          </ul>
          <p>
            The portal gives clients a live view of Instantly itself. That suits clients who want to explore. It is less
            suited to a curated summary, because the client sees the tool’s own interface and terminology. Plan details
            can change, so check Instantly’s current pricing page before deciding.
          </p>

          <h3>4. A reporting layer built for agencies</h3>
          <p>
            Tools in this category sit on top of your sending platform, collect the numbers from every client, apply one
            consistent set of definitions, and give each client a view you control. General-purpose agency dashboard
            builders also exist; check whether they offer a native Instantly connection before you commit, because
            without one you are back to CSV imports.
          </p>

          <div className="rp-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Approach</th>
                  <th scope="col">Setup effort</th>
                  <th scope="col">Weekly effort</th>
                  <th scope="col">One view across clients</th>
                  <th scope="col">You control what clients see</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Manual exports</th>
                  <td>None</td>
                  <td>High, grows with clients</td>
                  <td>No</td>
                  <td>Yes, by hand</td>
                </tr>
                <tr>
                  <th scope="row">Spreadsheet or custom dashboard</th>
                  <td>Medium to high</td>
                  <td>Low to medium, plus upkeep</td>
                  <td>Yes</td>
                  <td>Yes, if you build it</td>
                </tr>
                <tr>
                  <th scope="row">Instantly agency portal</th>
                  <td>Medium (DNS, plan, invites)</td>
                  <td>Low</td>
                  <td>No, one portal per workspace</td>
                  <td>By section, not by campaign</td>
                </tr>
                <tr>
                  <th scope="row">Dedicated reporting layer</th>
                  <td>Low to medium</td>
                  <td>Low</td>
                  <td>Yes</td>
                  <td>Depends on the tool</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="rp-caption">
            This table is our assessment from vendor documentation and is a starting point, not a benchmark. Effort
            depends on your client count and tools.
          </p>
        </>
      ),
    },
    {
      id: 'access-control',
      title: 'Decide what each client can see',
      body: (
        <>
          <p>Whichever route you take, answer these before sending a link:</p>
          <ol>
            <li>Can this client see any other client’s data? It should be impossible, not just unlikely.</li>
            <li>Can you limit the view to specific campaigns, or does the client see everything in the account?</li>
            <li>Can you revoke or replace the link if it is forwarded to the wrong person?</li>
            <li>Does the client see internal detail you would rather keep to yourself, such as unfinished tests or mailbox troubleshooting?</li>
            <li>Is the page kept out of search engines?</li>
          </ol>
          <p>
            Share only what you would be comfortable explaining on a call. If a number needs a paragraph of caveats,
            show the caveat or leave the number out.
          </p>
        </>
      ),
    },
    {
      id: 'cadence',
      title: 'Choose a cadence and be clear about freshness',
      body: (
        <>
          <p>
            Weekly summaries work for most engagements, with a monthly review for the bigger picture. Daily numbers
            rarely change decisions, and they invite clients to react to noise on small sends.
          </p>
          <p>
            Whatever the cadence, show when the data was last refreshed. Note that Instantly reports in UTC (stated in
            its analytics help page), so a report cut at the end of a local day can differ from the dashboard by a few
            hours. Two sets of numbers that disagree because of time zones or refresh timing are an easy way to lose
            a client’s trust if you cannot explain the gap.
          </p>
        </>
      ),
    },
    {
      id: 'where-klaroh-fits',
      title: 'Where Klaroh fits',
      body: (
        <>
          <p>
            Klaroh is a reporting and visibility layer for cold email agencies, in private beta. It does not send email
            and it does not replace Instantly. It connects to Instantly with an API key and, today, Instantly is the only
            supported source.
          </p>
          <p>For the problem in this article, here is what it does now:</p>
          <ul>
            <li>Shows campaign results, replies, mailbox status and domain checks across your clients in one workspace.</li>
            <li>
              Gives each client a private report link. You choose which metrics, which campaigns and which sections that
              client sees, and you can rotate the link.
            </li>
            <li>Defines each metric once, shows the definition, and withholds a metric it cannot support instead of showing zero.</li>
            <li>Shows when data was last synced.</li>
          </ul>
          <p>And what it does not do:</p>
          <ul>
            <li>
              It is <strong>not real-time</strong>. Data syncs on a daily schedule and when you open the app, and the
              last sync time is shown.
            </li>
            <li>
              It shows lifetime-to-date numbers, not a chosen date range, so “last week” is not something it can show
              today.
            </li>
            <li>It does not report open rate, meetings or revenue.</li>
            <li>Custom domains and custom colours are not available; your logo and agency name are.</li>
          </ul>
          <p>
            If that matches how you want to report,{' '}
            <Link href="/#tour">see how the product looks</Link> or <a href={WAITLIST_URL}>join the beta waitlist</a>.
          </p>
        </>
      ),
    },
  ],
  sources: [
    {
      label: 'Instantly: how to manage 10+ client workspaces securely',
      url: INSTANTLY_WORKSPACES,
      note: 'Vendor article, published January 2026. Source for workspace separation, per-workspace dashboards and exports. Promotional.',
    },
    {
      label: 'Instantly help center: Analytics',
      url: INSTANTLY_ANALYTICS,
      note: 'Primary documentation. Workspace export of sent, replies, positive reply rate and bounce rate; UTC reporting. The page shows a relative “updated” label with no absolute date.',
    },
    {
      label: 'Instantly help center: Agency white labeling',
      url: INSTANTLY_PORTAL,
      note: 'Primary documentation. Plans, CNAME setup, client sections, one portal per workspace, campaign visibility, manual invites. Plan availability may have changed.',
    },
    {
      label: 'Instantly: email open tracking and why your open metrics may be wrong',
      url: 'https://instantly.ai/blog/email-open-tracking-how-it-works-accuracy-rates-and-why-your-open-metrics-may-be-wrong',
      note: 'Vendor article, March 2026. Source for Apple Mail Privacy Protection and security scanner effects on open tracking.',
    },
  ],
  related: ['reply-rate-positive-reply-rate-numbers-dont-match', 'choosing-a-client-reporting-setup'],
};

export default resource;
