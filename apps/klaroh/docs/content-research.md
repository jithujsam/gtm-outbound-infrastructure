# Klaroh content research report

Date: 2026-10-10. Scope: client reporting, metrics and tool-choice content for cold email agencies. Nothing here is search-volume or traffic data; none was available and none is invented.

## Limitations (read first)

- **Reddit was not accessible.** WebFetch is blocked for reddit.com and `site:reddit.com` searches returned no Reddit results. This report has **no first-hand Reddit evidence**. Treat every "recurring problem" claim below as unconfirmed by practitioners.
- **Agent Reach was not installed.** Its CLI could not be pip-installed in the sandbox (proxy returned 403 for the GitHub archive). Only the skill files were added. Research used WebSearch and WebFetch.
- Most sources are vendor blogs and comparison pages, which are promotional.
- Instantly help pages show relative "updated" labels, not dates, so their currency can't be established.
- No Outfound or other competitor pages could be read directly.

## Sources reviewed

| Source | Date | What it told us | Type / reliability |
|---|---|---|---|
| [Instantly: manage 10+ client workspaces](https://instantly.ai/blog/how-to-manage-10-client-workspaces-securely/) | Jan 15, 2026 (updated Jan 26) | Workspaces separate leads, campaigns and stats; one login; per-workspace dashboards and exports; per-workspace cost | Vendor, promotional |
| [Instantly help: Analytics](https://help.instantly.ai/en/articles/6602310-analytics) | undated | Reply rate = replies / total sent; positive reply rate = opportunities / replies; auto-replies included by default, toggle is per device; UTC; workspace export | Primary documentation |
| [Instantly help: Agency white labeling](https://help.instantly.ai/en/articles/8678006-agency-white-labeling) | undated | Hyper Growth / Light Speed plans; CNAME subdomain; one portal per workspace; clients with Campaigns access see all campaigns; manual invites | Primary documentation |
| [Instantly help: Warmup health score](https://help.instantly.ai/en/articles/13939939-warmup-health-score) | undated | Score = inbox share of warmup emails over 7 days; does not measure campaign placement; DNS checks | Primary documentation |
| [Instantly: email open tracking](https://instantly.ai/blog/email-open-tracking-how-it-works-accuracy-rates-and-why-your-open-metrics-may-be-wrong) | Mar 2026 | Apple MPP and security scanners distort opens; recommends reply, positive reply, meetings | Vendor, promotional |
| [Clay community: in-house cold email dashboard](https://community.clay.com/x/community/jcj0tx8je246/in-house-tool-for-cold-email-campaign-dashboards-) | undated | One agency built a Smartlead dashboard for 25+ clients | Single anecdote |
| Octave, QuickMail and similar comparison posts (Instantly vs Smartlead) | various | Claims of no native cross-client view in Instantly; Smartlead stronger for white-label | Competitor/vendor content, conflicting on plan tiers |
| Palisade, FirstSales, Warmy and similar guides | various | Warmup score is directional; per-client reporting gaps force manual work | Third-party vendor content |

Search results seen but **not used** because they could not be verified from a primary source: reply-rate benchmark figures (3.43%, 3.7%, 0.45%), a vendor study on disabling open tracking, Gmail/Yahoo bulk sender figures (only vendor blogs surfaced, no Google or Yahoo pages).

## Repeated questions and pain points

| Finding | Evidence strength |
|---|---|
| No single view across client workspaces in Instantly | Instantly's own documentation plus several comparison pages. Moderate, vendor sourced |
| Agencies build custom dashboards or automations for multi-client reporting | One community post and one consultancy example. Weak: anecdotal |
| Client portals are plan-gated and show all campaigns in a workspace | Primary documentation. Strong for the facts, no evidence on how much it matters |
| Reply rate and positive reply rate are defined inconsistently across vendor content | Strong: visible in the sources themselves |
| Open rate is unreliable | Strong, widely documented, Instantly says so |
| Warmup score is not proof of campaign placement | Primary documentation, one third-party reinforcement |

## Competitor content gaps

- Most reporting content is vendor feature marketing. We found little that shows a worked example of how one campaign yields different reply rates under different definitions.
- Comparison posts rarely say where the author's own product is a poor fit. The decision guide does.
- No source we read lists what to leave out of a client report.

## Prioritised opportunities

Rubric: audience fit, evidence of recurring need (capped at 3 because evidence is indirect), Klaroh fit using current features only, ability to beat existing results. Each 1-5, total out of 20.

| # | Topic | Fit | Evid. | Klaroh | Beat SERP | Total |
|---|---|---|---|---|---|---|
| 1 | Reporting Instantly results to clients across workspaces | 5 | 3 | 5 | 4 | 17 |
| 2 | Reply rate and positive reply rate definitions | 5 | 3 | 4 | 5 | 17 |
| 3 | Choosing a client reporting setup | 5 | 2 | 5 | 4 | 16 |
| 4 | Client-facing access and privacy | 4 | 1 | 5 | 4 | 14 |
| 5 | What a warmup score does and does not tell you | 4 | 2 | 4 | 3 | 13 |
| 6 | Sync delays and missing metrics | 3 | 1 | 5 | 4 | 13 |
| 7 | Gmail and Yahoo sender requirements | 4 | 2 | 1 | 2 | 9 |

## Why the first three

1 is the practical reporting problem with the best-documented basis. 2 explains metrics and has the clearest content gap. 3 is the high-intent evaluation piece and is written to include non-Klaroh options and Klaroh's limits. Topics 4 and 6 became sections in articles 1 and 2; topic 5 became a section in article 3; topic 7 was dropped for weak Klaroh fit and no primary sources.

## Published routes (in code, not deployed)

- `/resources`
- `/resources/client-reporting-instantly-workspaces`
- `/resources/reply-rate-positive-reply-rate-numbers-dont-match`
- `/resources/choosing-a-client-reporting-setup`

## Remaining uncertainties

- Practitioner demand: needs real Reddit or customer-interview evidence.
- Instantly plan tiers and portal limits may have changed; the help pages are undated.
- Whether Instantly's help-page reply-rate definition (replies / total sent) is the current one; its blog describes related metrics differently.
- The unit of Instantly's `bounced_count` (the reason Klaroh withholds bounce rate).
- Whether general agency dashboard tools offer a native Instantly connector. Not verified; the articles say to check.
- Search demand and competition: not measured.
- Product claims were checked against the metric layer, portal settings and project audit documents (`docs/landing-page-audit.md`, `docs/landing-page-owner-verification.md`) but were not tested end to end in a running app.
