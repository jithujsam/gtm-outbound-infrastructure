import Link from 'next/link';
import { WAITLIST_URL } from '@/components/landing/links';
import type { Resource } from './types';

const INSTANTLY_ANALYTICS = 'https://help.instantly.ai/en/articles/6602310-analytics';
const INSTANTLY_OPENS =
  'https://instantly.ai/blog/email-open-tracking-how-it-works-accuracy-rates-and-why-your-open-metrics-may-be-wrong';

const resource: Resource = {
  slug: 'reply-rate-positive-reply-rate-numbers-dont-match',
  title: 'Reply rate, positive reply rate and why your cold email numbers never match',
  description:
    'Two reports can show different reply rates for the same campaign and both be right. How the denominator, auto-replies and time range change the number, and how to state a definition clients can trust.',
  category: 'Metrics',
  published: '2026-10-10',
  updated: '2026-10-10',
  readingMinutes: 8,
  summary: (
    <>
      <p>
        Cold email numbers rarely match across tools because the same words are used for different calculations. Reply
        rate can be divided by emails sent or by prospects contacted. Replies may or may not include out-of-office
        messages. “Positive” can mean a share of replies or a share of prospects. None of these is wrong, but a report
        that does not say which one it uses is easy to misread.
      </p>
      <p>
        Pick a definition for each metric, write it next to the number, apply it to every client, and do not compare
        your figures with someone else’s benchmark unless you know how that benchmark was calculated.
      </p>
    </>
  ),
  sections: [
    {
      id: 'same-campaign-three-answers',
      title: 'One campaign, three reply rates',
      body: (
        <>
          <p>
            Here is a made-up campaign to show the effect. These numbers are illustrative, not real data.
          </p>
          <ul>
            <li>1,000 prospects received the first email.</li>
            <li>Across the whole sequence, 2,400 emails were sent.</li>
            <li>40 prospects replied. Of those, 6 were automatic out-of-office replies.</li>
            <li>8 prospects are marked as opportunities.</li>
          </ul>
          <div className="rp-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Calculation</th>
                  <th scope="col">Working</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Replies ÷ emails sent, auto-replies included</th>
                  <td>40 ÷ 2,400</td>
                  <td>1.7%</td>
                </tr>
                <tr>
                  <th scope="row">Replies ÷ emails sent, auto-replies excluded</th>
                  <td>34 ÷ 2,400</td>
                  <td>1.4%</td>
                </tr>
                <tr>
                  <th scope="row">Human replies ÷ prospects contacted</th>
                  <td>34 ÷ 1,000</td>
                  <td>3.4%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Same campaign, same replies, and the headline figure more than doubles depending on the definition. Nobody
            made an error. A client comparing your 3.4% with a benchmark built on emails sent would conclude you are far
            ahead, and the comparison would be meaningless.
          </p>
        </>
      ),
    },
    {
      id: 'what-instantly-says',
      title: 'What Instantly’s documentation says',
      body: (
        <>
          <p>
            Instantly’s <a href={INSTANTLY_ANALYTICS}>analytics help page</a> defines the terms as follows (quoted or
            closely paraphrased from the page when we read it for this article):
          </p>
          <ul>
            <li>
              <strong>Reply rate:</strong> the percentage of recipients who replied to a sequence email, calculated as
              replies ÷ total sent.
            </li>
            <li>
              <strong>Opportunities:</strong> replies your team has marked as an opportunity, usually a meeting booked or
              a qualified lead.
            </li>
            <li>
              <strong>Positive reply rate:</strong> the percentage of replies marked as an opportunity, calculated as
              opportunities ÷ replies.
            </li>
            <li>
              <strong>Auto-replies:</strong> counted in reply rate by default. A setting excludes them, and the page says
              the setting applies to the current device only.
            </li>
            <li>
              <strong>Time zone:</strong> reporting is in UTC.
            </li>
          </ul>
          <aside className="rp-note">
            <strong>Verify before you quote.</strong> Help pages change, and this one shows only a relative “updated”
            label, not a date. Instantly’s blog posts have described positive reply rate with different denominators
            than the help page, so when sources inside one vendor disagree, the help page is the better reference for
            how the app calculates it. Check the current page before you put a definition in a client contract.
          </aside>
          <p>
            Two practical consequences. First, the auto-reply toggle is a per-device view setting, so two people on your
            team can look at the same campaign and see different reply rates. Second, “positive reply rate” in Instantly
            answers “of the people who replied, how many were interested?”, which is a different question from “of the
            people we contacted, how many were interested?”
          </p>
        </>
      ),
    },
    {
      id: 'choose-denominator',
      title: 'Choosing your denominator',
      body: (
        <>
          <p>There is no single correct choice. There are trade-offs, and your clients should know which one you made.</p>
          <div className="rp-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Denominator</th>
                  <th scope="col">Good for</th>
                  <th scope="col">Watch out for</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Emails sent</th>
                  <td>Judging the sequence as a whole; matches tools that divide by sent.</td>
                  <td>Longer sequences send more emails per person, so the rate drops without performance changing.</td>
                </tr>
                <tr>
                  <th scope="row">Prospects contacted</th>
                  <td>Answering “what share of the people we targeted engaged?” in terms a client understands.</td>
                  <td>Someone in two campaigns can count twice; mid-sequence prospects haven’t had every follow-up yet.</td>
                </tr>
                <tr>
                  <th scope="row">Total replies (for positive rate)</th>
                  <td>Judging reply quality: how many replies were interested.</td>
                  <td>A campaign with few replies swings wildly. Four positives out of eight replies is 50%.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Our recommendation: report the share of prospects contacted, because it is the easiest for a client to
            picture, and show the raw counts next to it so anyone can recompute it. This is an opinion, not a standard.
          </p>
        </>
      ),
    },
    {
      id: 'opens-bounces',
      title: 'Open rate and bounce rate: the two numbers to treat carefully',
      body: (
        <>
          <h3>Open rate</h3>
          <p>
            Instantly’s own <a href={INSTANTLY_OPENS}>article on open tracking</a> (March 2026) says Apple pre-loads
            images through proxy servers whether or not the recipient reads the email, and that when security gateways
            scan a message, no human is involved when the tracking pixel fires. The article recommends reply rate and
            booked meetings as more reliable measures. Instantly sells cold email software, so weigh the framing
            accordingly, but the mechanisms it describes are why many agencies leave open rate out of client reports.
          </p>
          <h3>Bounce rate</h3>
          <p>
            Instantly’s help page describes workspace bounce rate as the average of each workspace’s percentage of emails
            sent that bounced. Whether a count of bounces refers to bounced prospects or bounced emails changes what a
            percentage means. Klaroh shows the bounce <em>count</em> and withholds a bounce <em>rate</em> for exactly this
            reason: we have not been able to confirm which unit Instantly’s count uses. If a tool gives you a rate
            without saying what it divides, ask.
          </p>
        </>
      ),
    },
    {
      id: 'small-samples',
      title: 'Small samples, date ranges and sync timing',
      body: (
        <>
          <h3>Small samples</h3>
          <p>
            A rate from 40 prospects moves a lot when one person replies. Say so in the report. Klaroh flags campaigns
            with fewer than 100 prospects contacted as low volume and shows emails-per-positive only from five positive
            prospects. Those thresholds are our own judgement calls, not industry rules; choose your own and write them
            down.
          </p>
          <h3>Date ranges</h3>
          <p>
            Instantly lets you choose a date range; its help page notes that longer windows give a more complete picture
            of a campaign. A tool that shows lifetime-to-date figures will not match a dashboard filtered to last week.
            Klaroh currently shows lifetime-to-date only, so when comparing the two, set Instantly to a range that
            covers the whole campaign.
          </p>
          <h3>Sync timing</h3>
          <p>
            If numbers are copied or synced from Instantly into another tool, they are only as fresh as the last sync. A
            reply that arrived this morning may not be in a report built last night. Klaroh syncs on a daily schedule and
            when you open the app, and shows the last sync time. It is not real-time.
          </p>
        </>
      ),
    },
    {
      id: 'checklist',
      title: 'A checklist before you send a report',
      body: (
        <>
          <ol>
            <li>Every rate has its numerator and denominator written or one click away.</li>
            <li>The auto-reply setting is the same for every client and is stated.</li>
            <li>The time range and time zone are stated.</li>
            <li>“Positive” says who decided: your team, a tool, or the prospect.</li>
            <li>Low-volume campaigns are labelled as such.</li>
            <li>Open rate is absent, or accompanied by the caveat that it can be inflated by software.</li>
            <li>The report shows when the data was last updated.</li>
            <li>You are not comparing against an outside benchmark whose method you cannot see.</li>
          </ol>
        </>
      ),
    },
    {
      id: 'how-klaroh-defines',
      title: 'How Klaroh defines its numbers',
      body: (
        <>
          <p>
            Klaroh reads the raw counts from Instantly and defines every business metric in one place. Today these are
            the definitions it uses:
          </p>
          <div className="rp-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Klaroh’s definition</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Reply rate</th>
                  <td>Human replies ÷ prospects contacted. Automatic replies, as classified by Instantly, are excluded.</td>
                </tr>
                <tr>
                  <th scope="row">Positive rate</th>
                  <td>
                    Prospects currently marked positive in Instantly (interested, meeting booked, meeting completed or
                    won) ÷ prospects contacted. A lead can be marked positive without an email reply.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Emails per positive</th>
                  <td>Emails sent ÷ positive prospects. Shown from five positives.</td>
                </tr>
                <tr>
                  <th scope="row">Bounce rate</th>
                  <td>Withheld until the unit of Instantly’s bounce count is confirmed. The count is shown.</td>
                </tr>
                <tr>
                  <th scope="row">Open rate, meetings, revenue</th>
                  <td>Not shown.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            “Positive” is whatever is marked in Instantly, set by your team or by Instantly itself. Klaroh does not
            classify replies. Because the denominator differs from Instantly’s headline reply rate, Klaroh’s reply rate
            will usually not equal the figure on Instantly’s dashboard. That is by design, and the definitions are shown
            in the product.
          </p>
          <p>
            Want to see the definitions in context? <Link href="/#tour">Explore the product tour</Link>, or{' '}
            <a href={WAITLIST_URL}>join the beta waitlist</a>.
          </p>
        </>
      ),
    },
  ],
  sources: [
    {
      label: 'Instantly help center: Analytics',
      url: INSTANTLY_ANALYTICS,
      note: 'Primary documentation. Reply rate, opportunities, positive reply rate, auto-reply setting (current device only), UTC, date ranges, workspace bounce rate. Shows a relative “updated” label, no absolute date.',
    },
    {
      label: 'Instantly: email open tracking and why your open metrics may be wrong',
      url: INSTANTLY_OPENS,
      note: 'Vendor article, published March 2026. Source for Apple Mail Privacy Protection and security scanner effects on opens.',
    },
  ],
  related: ['client-reporting-instantly-workspaces', 'choosing-a-client-reporting-setup'],
};

export default resource;
