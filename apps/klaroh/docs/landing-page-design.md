# Landing Page Design Brief — Klaroh

> **Update (build decision):** the owner chose **Tally** for the waitlist (email, company name, and an "are you comfortable sharing an API key?" question), so there is **no waitlist table, API route, rate limiter or migration**. The sections of this document about those are superseded. The landing page was built as a single static page with a Tally embed (`NEXT_PUBLIC_TALLY_FORM_URL`). Routing findings (proxy, root layout) were implemented as described.


**Status:** Design proposal only. Nothing is implemented, and nothing here says the site is ready to deploy.
**Companion docs:** `landing-page-audit.md` (facts, claim guardrails), `landing-page-implementation-plan.md` (files, backend, tests).
**Labels:** **[V]** verified in the repo · **[R]** recommendation · **[?]** needs the owner's decision.

---

## 1. Design principles

1. **Product-led.** The product is the proof. Show Klaroh's real interface shapes (KPI cards, trend chart, status chips, client portal), built from clearly labelled sample data.
2. **Honest by construction.** Every claim passes the "safe claims" list in the audit. Where Klaroh withholds a metric, the page says so; that restraint is the differentiator.
3. **Calm over clever.** Quiet surfaces, one accent green, generous space. No gradient hero, no glowing orbs, no AI sparkle iconography.
4. **One goal.** Every section pushes toward a single action: join the early-access list.
5. **Same family as the app.** A visitor who later signs in should recognise the product's look immediately.

## 2. Brand direction

- **Voice [V from CLAUDE.md]:** professional, confident, data-driven; speaks to agency leaders who value precision and client relationships.
- **Personality:** a careful analyst, not a hype machine. Short sentences. Concrete nouns (mailbox, positive reply, sync). Numbers only when they are labelled sample data.
- **Words to use:** visibility, clarity, trusted numbers, client-ready, last synced, positive reply, sending infrastructure.
- **Words to avoid:** real-time, AI-powered, revolutionary, 10x, supercharge, all-in-one, "trusted by", unlimited, guaranteed.
- **Differentiation from generic AI SaaS [R]:** serif italic headline (already the brand's page-title voice), no purple/blue gradients, no floating UI-card collage, no emoji, no stock people. The visual centrepiece is a precise, believable product frame with honest empty/"not reported" states.

## 3. Color and typography

Use existing tokens from `src/app/globals.css`; add nothing unless a gap is proven. **[V]** token names below.

| Role | Token | Value |
|---|---|---|
| Page background | `background` / `surface` | `#F8F9FF` |
| Cards, form, product frame | `surface-container-lowest` | `#FFFFFF` |
| Alternate band | `surface-container-low` | `#EFF4FF` |
| Dark brand band (hero accent or final CTA) | `primary` | `#003E2A` |
| Text on dark | `on-primary` / `on-primary-container` | `#FFFFFF` / `#89CBAB` |
| Data green (chart line, good chips) | `primary-container` / `chart-1` | `#0F573E` |
| Primary text | `on-surface` | `#0B1C30` |
| Secondary text | `on-surface-variant` | `#404943` |
| Hairlines | `outline-variant` at /40–/60 | `#BFC9C1` |
| Status in demo | `success` / `warning` / `critical` / `info` containers | per `design.md` |

**Contrast [R]:** `on-surface-variant` on `#F8F9FF`/white and `on-primary-container` (`#89CBAB`) on `#003E2A` are the muted pairs; verify ≥ 4.5:1 for body text with a contrast checker at build time rather than assuming (not computed here). Muted `outline` (`#707973`) must not be used for text below 18px on white.

**Typography [V from design.md, adjusted for marketing]:**

- Existing utilities cap at 32px (`.type-page-title`). A marketing hero needs larger display type. **[R]** Add one landing-only scale defined with `clamp()` in the page's own CSS or Tailwind arbitrary values rather than changing app tokens:
  - Hero H1: Instrument Serif italic 400, `clamp(2.5rem, 6vw, 4.5rem)`, line-height 1.05, letter-spacing −0.02em.
  - Section H2: Instrument Serif italic 400, `clamp(1.75rem, 3.5vw, 2.5rem)`.
  - Card/feature titles: `.type-section` (Inter 600, 16px).
  - Lede: Inter 400, 18–20px desktop, 16px mobile.
  - Body: Inter 400, 14–16px. Captions/labels: 12px minimum (**never smaller**, per CLAUDE.md).
- Weights: Inter 400/500/600 only; Instrument Serif 400 normal/italic only. Both already loaded in `layout.tsx` **[V]**.
- Exactly one `h1`.

**Components:** radius 8px (`rounded-lg`) for cards, inputs, buttons; 12px (`rounded-xl`) permitted for the large product frame only. Cards flat with 1px `outline-variant/50` border; no drop shadows on cards (app rule). A soft shadow is acceptable on the single product frame (**[R]**, reuse `--shadow-modal`).

## 4. Page structure

Single scrolling page at `/`. Section order and purpose:

| # | Section | Purpose | Background |
|---|---|---|---|
| 0 | Header | Brand, anchor links (Product, How it works, FAQ), "Sign in", primary CTA | `background`, hairline bottom border |
| 1 | Hero | Problem + promise + CTA + product frame | `background` |
| 2 | Problem strip | Name the reporting pain in the agency's words | `surface-container-lowest` |
| 3 | Product demonstration | Interactive, tabbed sample-data tour (Overview → Infrastructure → Replies → Client report) | `surface-container-low` |
| 4 | Feature pillars | Four pillars, each with one verifiable detail | `background` |
| 5 | Trust section: "What we show — and what we don't" | The honesty differentiator | `surface-container-lowest` |
| 6 | How it works | 3 steps | `background` |
| 7 | Early access explained | Mechanics of the first-come-first-served promise; waitlist form (primary instance) | `primary` dark band |
| 8 | FAQ | Objection handling | `background` |
| 9 | Final CTA | Repeat the form (compact) | `surface-container-low` |
| 10 | Footer | Brand, links, contact, copyright | `surface-container-lowest` |

The form appears in the hero (compact), in section 7 (primary, with explanation), and in the final CTA. Three *instances* of one component sharing state is unnecessary: each posts independently; after success, the others collapse to a "You're on the list" line **[R]** (sessionStorage flag, try/catch wrapped).

## 5. Responsive behaviour

Breakpoints follow Tailwind defaults used in the app (sm 640, md 768, lg 1024).

- **Content width:** `max-w-6xl` (as the app's content pages) centered; page gutter 16px mobile, 24px md, 32px lg **[V]** convention. Landing hero may use `max-w-page` (1440px) for the background only.
- **Header:** ≥ md: logo left, links centre, "Sign in" (ghost) + "Request early access" (primary) right. < md: logo + primary button only; links collapse into a disclosure menu (button with `aria-expanded`), no hamburger-only primary action.
- **Hero:** ≥ lg: two columns (copy 5/12, product frame 7/12, frame bleeds slightly to the right edge). < lg: single column; headline, copy, form, then product frame below. Form fields stack on < sm (email input full-width, button full-width, 44px targets — already handled by `@media (pointer: coarse)` in `.btn`/`.input`).
- **Product demo:** ≥ md: tabs along the top, frame below. < md: tabs become a horizontally scrollable pill row with scroll-snap; the frame content simplifies (hide secondary columns, KPI cards in a 2-up grid). Never scale a desktop screenshot down to illegible size: build the frame from live HTML/CSS so type stays ≥ 12px.
- **Feature pillars:** 4-up at lg, 2×2 at md, single column below.
- **How it works:** three columns at lg with connecting hairline; vertical stack with left rail below.
- **Tables in the demo:** horizontally scroll inside their region (as `DataTable`), never the page. **No horizontal page scroll at any width ≥ 320px.**
- **Touch:** all interactive targets ≥ 44px on coarse pointers.

## 6. Component design

### 6.1 Header
Sticky, `background/90` with `backdrop-blur-sm`, 1px bottom border appearing after 8px scroll (CSS only or `useScroll`). Logo from `/logo.svg` (reuse `Image`, as `AuthBranding`).

### 6.2 Hero
- Eyebrow chip (12px, `primary-fixed/40` bg, `on-primary-fixed-variant` text): "Early access · first come, first served".
- H1 + lede (copy in §8).
- Waitlist form (§9) with microcopy beneath.
- Product frame: a window-like card (white, 12px radius, hairline border, subtle modal shadow) showing a *sample* Overview: scope line, 3 KPI cards, a trend area chart, and one "Needs attention" row. A small, persistent caption in the frame corner: **"Sample data"** (12px, `StatusChip` neutral style). Required, not optional.

### 6.3 Product demonstration (tabbed tour)
Four tabs, each a purpose-built static composition (no live fetch, no Recharts requirement — an inline SVG area chart is lighter and lets us animate stroke; **[R]** do not import Recharts on this page to keep the bundle small):
1. **Overview** — KPIs (Prospects reached, Replies, Positive responses, Reply rate), trend line, "Needs attention" list.
2. **Infrastructure** — mailbox table (sample addresses on `example.com`), warmup score bar, SPF/DKIM/DMARC/MX chips, one mailbox in "Needs attention".
3. **Replies** — conversation list with "Positive response / Meeting booked" chips and snippet; a note "Read-only: reply in your sending tool."
4. **Client report** — the portal: agency logo placeholder, verdict chip "Early results", summary sentence, KPI cards, one metric card showing **"—  Not reported yet"** to demonstrate honesty.

All mock data uses fictitious names/domains (`example.com`, "Northwind Outbound") and is labelled. Numbers must be internally consistent (reply rate = replies ÷ prospects reached) so a careful reader can verify the arithmetic; mirror the real definitions in `metrics.ts`.

### 6.4 Problem strip
Three short statements in a row (icon + sentence), e.g. stale spreadsheets, "is it working?" questions, deliverability surprises. No stats. Icons from `lucide-react` (already a dependency): `FileSpreadsheet`, `HelpCircle`, `ServerCrash`, 20px, `on-surface-variant`.

### 6.5 Feature pillars
Four cards (flat, hairline border, 8px radius, 24px padding): icon tile (`primary-fixed/20` bg, `text-primary`), `.type-section` title, 14px body, and a **"Detail"** line in 12px `on-surface-variant` stating one concrete verifiable behaviour (e.g. "Bounce rate stays hidden until the unit is verified"). Content in §8.

### 6.6 "What we show — and what we don't"
Two-column list. Left: "Shown" with `StatusChip`-style good checks. Right: "Withheld until reliable": Open rate, Meetings, Revenue — with the actual reasons used in the app (`UNAVAILABLE_PORTAL_METRICS`). This is the page's most distinctive element; give it room.

### 6.7 How it works
Numbered steps with a small illustration-free layout: (1) Connect Instantly, (2) Pick each client's campaigns, (3) Share a private link. Each with a one-line "what you control" detail.

### 6.8 Early-access section
Dark `primary` band. Left: explanation (§8) as a short three-item list: *Join with your email*, *We invite in the order you joined*, *We onboard you personally*. Right: white form card. No counters, no "X spots left".

### 6.9 FAQ
Accordion built from native `<details>/<summary>` (accessible by default, works without JS, animate only the chevron). 6–7 questions (§8).

### 6.10 Footer
Wordmark, one-line description, links: Sign in (`/auth/login`), Privacy, Terms (**[?]** only once the pages exist; do not link dead URLs), `hello@klaroh.app` (**[?]** confirm mailbox), © year (computed server-side is fine since the page is static at build; acceptable to hard-code at build).

## 7. Animation specification

Use the **existing `framer-motion` 12.40.0** **[V]**. Import from `framer-motion` (the package already used in the app), not `motion/react`, to match code and avoid a second entry point.

### 7.1 Global rules

- Wrap the landing client components in `<MotionConfig reducedMotion="user">` so every `motion.*` component respects `prefers-reduced-motion` automatically. (No `MotionConfig` exists in the app today; existing components call `useReducedMotion` individually. **[R]** Use `MotionConfig` here for consistency within the page; leave app code alone.)
- **Reduced motion behaviour:** transforms/position animations are removed; opacity-only fades ≤ 150ms are allowed, or elements render in final state. Looping or auto-advancing animation is disabled entirely.
- Animate only `opacity` and `transform` (and SVG `pathLength`). Never animate width/height/top/left or box-shadow.
- No constant/looping motion anywhere, no parallax, no scroll-jacking, no cursor-follow effects.
- Content must be fully visible with JS disabled or animation failing: initial hidden states are applied only after hydration (see §7.8).
- Keep motion components in small client islands; keep copy as server-rendered markup. Prefer `LazyMotion` with `domAnimation` and the `m` component to keep the added JS small **[R]**; verify the bundle effect once built (**[?]** unmeasured).

### 7.2 Tokens

| Token | Value |
|---|---|
| `ease-out` (entrances) | `[0.22, 1, 0.36, 1]` |
| `ease-in-out` (state swaps) | `[0.4, 0, 0.2, 1]` |
| `dur-fast` | 0.15s (hover/tap) |
| `dur-base` | 0.35s (fades, tab swaps) |
| `dur-enter` | 0.55s (section/hero entrances) |
| `dur-draw` | 0.9s (chart line draw, once) |
| `stagger` | 0.07s between siblings, max 6 siblings (cap total at ≈ 0.4s) |
| `distance` | `y: 16px` for entrances (never > 24px) |
| spring (shared active indicator only) | `{ type: 'spring', stiffness: 500, damping: 35 }` — **identical to the app's nav indicator [V]** |

### 7.3 Hero entrance (on load, once)

Order and timing (all `ease-out`):
1. Eyebrow chip: opacity 0→1, y 8→0, 0.35s, delay 0.
2. H1: opacity 0→1, y 16→0, 0.55s, delay 0.08. Animate as a single block — **no per-word/per-letter splitting** (hurts readability, selection and screen readers).
3. Lede: 0.45s, delay 0.18.
4. Form: 0.45s, delay 0.28.
5. Product frame: opacity 0→1, y 24→0, 0.6s, delay 0.2; inside it, KPI cards stagger 0.07s starting at 0.55s; chart line draws once (`pathLength` 0→1, 0.9s) starting 0.7s; area fill fades in at 1.2s.

LCP guard **[R]:** the H1 must not start at opacity 0 for longer than the first paint → use `initial={false}` on the server render path and animate only if the component mounts at scroll position 0 and the user has not requested reduced motion; the H1 text is in the HTML, so LCP is not blocked by JS.

### 7.4 Product demonstration

- Tab change: content cross-fade `opacity` 0→1 with `y: 8→0`, `dur-base`, `AnimatePresence mode="wait"` (exit 0.12s). Tab panel height is fixed per breakpoint to avoid layout shift.
- Active-tab indicator: shared `layoutId="landing-tab"` underline/pill using the app's spring token.
- Inside a newly shown tab: KPI numbers fade/stagger only; **no count-up animations** (counting numbers look like fake live data, which contradicts the brand). Chart line draws once per tab view (not on every re-hover).
- Optional (**[R]**, off by default): auto-advance between tabs is **not** used. Visitors control the tour.
- Tooltip-like hover on chart points: CSS only, `dur-fast`.

### 7.5 Scroll-triggered sections

- Use `whileInView` with `viewport={{ once: true, margin: '-12% 0px' }}` — animate each block the first time it is ~12% inside the viewport; never re-trigger when scrolling back.
- Section pattern: heading block fades/rises (`dur-enter`), then children stagger (0.07s, max 6). Cards/steps use the same pattern.
- "How it works" connector line: `scaleX`/`scaleY` 0→1 once (`dur-draw`), origin at start.
- Header border/blur: CSS state toggled by a scroll listener or `useScroll`; no animation beyond a 150ms opacity change.
- No parallax; no sticky storytelling sections; no scroll-linked transforms.

### 7.6 Hover / tap micro-interactions

- Buttons: keep the app's `.btn` behaviour — color transition 0.15s and `transform: scale(0.98)` on `:active` **[V]** (CSS, not Motion). Do not add Motion to buttons.
- Feature cards: border color to `outline-variant` full and `translateY(-2px)` over `dur-fast` on hover (pointer-fine devices only via `@media (hover: hover)`); no shadow growth.
- FAQ chevron: rotate 180° `dur-fast`. `<details>` content is revealed natively; do not animate height.
- Links: underline offset transition 0.15s.
- Focus: standard `.btn:focus-visible` 2px outline in `primary` **[V]**; motion never replaces focus styling.

### 7.7 Waitlist form states

| State | Visual | Motion |
|---|---|---|
| Idle | Input + button | none |
| Focus | 3px `primary` 25% ring (`.input:focus`) **[V]** | 0.15s ring (CSS) |
| Validation error | `.input-error`, message below via `.field-error`, `role="alert"` | message: opacity 0→1, y −4→0, `dur-fast`; no shake |
| Submitting | Button disabled, spinner (`Loader2`, `animate-spin`) + "Joining…"; input read-only | spinner is the app's existing pattern **[V]**; label swap instant |
| Success | Form content replaced by a confirmation panel (check icon in `primary-fixed` circle, headline, 2 lines) | cross-fade `dur-base` (`AnimatePresence mode="wait"`); check icon `pathLength` draw 0.4s once; container height does not jump (min-height reserved) |
| Already on list | Same panel as success (identical response — see backend plan) | same |
| Rate limited / server error | `FormError`-style banner with retry | banner fade `dur-fast`; button re-enabled |

Focus after success moves to the confirmation heading (`tabIndex={-1}`) so screen-reader users hear the result; the live region announces once.

### 7.8 Performance and failure safety

- Motion islands are client components; copy/markup are server components.
- Hidden initial states (`opacity: 0`) are applied in a way that is safe without JS: **[R]** render content visible by default and let Motion set the initial state on mount only for elements below the fold (`whileInView`) — elements above the fold animate from slight offset but never below 0.001 opacity for longer than hydration (use `initial={false}` for SSR markup when `useReducedMotion()` is true).
- Budget: no more than ~24 simultaneously animating elements per viewport; no animation > 1s except the one-time chart draw.
- Test with 4× CPU throttle and ensure Interaction to Next Paint of tab switching stays responsive **[R, measure]**.

## 8. Exact copy draft

All copy is a **draft for the owner's approval**. Claims are limited to the "safe" list in the audit. `[?]` marks values that depend on an open decision.

### Meta

- `<title>`: **Klaroh — Outbound visibility your clients can trust** (≤ 60 chars)
- Meta description: **Klaroh gives lead-generation agencies one clear view of campaign performance, sending health and positive replies — and a private report link for every client. Join the early-access list.**
- Open Graph title/description: same as above. OG image: **[?]** to be designed (none exists).

### Header
Links: Product · How it works · FAQ · Sign in
Button: **Request early access**

### Hero
- Eyebrow: **Early access · First come, first served**
- H1: ***Outbound you can see. Reports your clients can trust.***
- Lede: **Klaroh connects to your sending platform and turns raw campaign numbers into a clear, honest view of what's working — for you, and for every client you serve. Currently works with Instantly.**
- Form label (visually present): **Work email**
- Placeholder: **you@youragency.com**
- Button: **Request early access**
- Microcopy: **No spam, no card. We'll invite agencies in the order they join. By joining you agree to our [Privacy notice].** *(link only when the page exists — [?])*

*Alternate H1s for A/B or owner preference:*
- *"Know exactly what your outbound is doing."*
- *"The calm way to report outbound."*

### Problem strip
Heading: **Reporting outbound shouldn't mean rebuilding a spreadsheet every Friday.**
1. **Reports go stale the day you send them.** *Clients ask for updates because they can't see them.*
2. **Raw numbers aren't answers.** *Open rates, warmup scores and bounce counts don't tell a client whether it's working.*
3. **Problems surface late.** *A paused mailbox or a broken DNS record can quietly cost a week of sending.*

### Product demonstration
- Heading: **One place to understand your outbound.**
- Sub: **A tour of Klaroh using sample data.**
- Tabs: **Overview · Infrastructure · Replies · Client report**
- Captions (one per tab, 14px):
  - Overview: *"Every number has one definition, shown where you can read it. Metrics Klaroh can't verify aren't shown at all."*
  - Infrastructure: *"Mailbox status, warmup score and SPF, DKIM, DMARC and MX checks per sending domain, with issues surfaced first."*
  - Replies: *"Prospect replies from your campaigns, with positive ones one click away. Read-only: you reply in your sending tool."*
  - Client report: *"A private page for each client, in plain business language. You choose what they see."*
- Frame badge: **Sample data**

### Feature pillars
Heading: **Built for agencies that answer to clients.**

1. **Trusted campaign analytics** — *Reply rate, positive rate and cost per positive response, calculated one way everywhere.* Detail: *Lifetime-to-date from your latest sync. Bounce rate stays hidden until its unit is verified.*
2. **Client reports on a private link** — *Give each client their own report. Choose the view, the campaigns and the sections.* Detail: *Links are unguessable, not indexed by search engines, and can be rotated.*
3. **Sending infrastructure, visible** — *See mailbox health, warmup and domain DNS next to the results they affect.* Detail: *A "needs attention" list is built only from states your provider reports.*
4. **Positive replies in one place** — *A read-only inbox of prospect replies, with positive conversations easy to find and optionally shown to the client.* Detail: *Automatic replies like out-of-office are not counted as replies.*

### "What we show — and what we don't"
- Heading: **Honest by default.**
- Sub: **If we can't verify a number, we don't show it — and we tell you why.**
- Shown: *Emails sent · Prospects reached · Replies · Positive responses · Reply rate · Positive response rate · Cost per positive response (from figures you enter)*
- Withheld, with reasons (from the app): *Open rate — open tracking isn't reliable enough to report · Meetings — not reliably reported by the sending platform yet · Revenue — Klaroh has no verified revenue data*
- Closing line: **Clients trust reports that admit what they don't know.**
- Also: **Data freshness is visible.** *Klaroh shows when each connection last synced and flags failed syncs or reconnect requests, rather than implying everything is live.*

### How it works
Heading: **Set up a client in minutes.** *(**[?]** "minutes" is unmeasured — consider "Simple to set up" instead.)*
1. **Connect Instantly.** *Add your API key once. It's validated, encrypted, and never shown again.*
2. **Choose each client's campaigns.** *Only the campaigns you pick are imported and synced.*
3. **Share a private report.** *Send the link. Update what they see whenever you like.*

### Early access
- Heading: **Early access, in the order you join.**
- Body: **We're opening Klaroh to a small number of agencies at a time. When you join the list, your place is set by when you signed up — no tiers, no jumping the queue. As space opens, we'll email you an invitation and help you get your first client set up.** *(**[?]** capacity and onboarding wording to be confirmed — audit §8 item 2.)*
- Three points: **Join with your work email · We invite agencies in sign-up order · We help you onboard your first client**
- Form button: **Request early access**
- Under form: **We'll only use your email to contact you about Klaroh access.** *(**[?]** legal wording from the owner.)*

### FAQ
1. **Who is Klaroh for?** *Lead-generation and cold-email agencies that run campaigns for clients and need to report on them clearly.*
2. **Which sending platforms do you support?** *Instantly today. [?] Smartlead: "We're planning Smartlead support; tell us if it matters to you in your reply." — only if the owner wants to say so.*
3. **Is it real-time?** *No — Klaroh syncs your campaign data and always shows when it last synced. Failed syncs are flagged rather than hidden.*
4. **Does Klaroh send emails or replace Instantly?** *No. Klaroh reads your campaign data and presents it. You keep sending from your existing tool.*
5. **What can my clients see?** *Only what you choose, through a private link for that client. They can't see your other clients or your account.*
6. **Where do the numbers come from?** *Directly from your connected sending platform. Anything we calculate — like reply rate — follows one published definition. Cost-related figures use amounts you enter.*
7. **How does early access work?** *Join with your email. We invite agencies in the order they joined and help with onboarding. We don't publish queue positions.*
8. **How is my data handled?** *Your API key is encrypted at rest and never displayed after saving. Client reports use random private links. **[?]** Add a link to the Privacy notice once it exists.*
9. **What does it cost?** *[?] Owner decision — recommended answer: "We'll share pricing with early-access agencies before you commit to anything."* (Do not publish the in-app $29/$79/$149 without confirmation.)

### Final CTA
- Heading: **See your outbound clearly.**
- Sub: **Join the early-access list. We'll invite agencies in the order they sign up.**
- Button: **Request early access**

### Footer
**Klaroh** — *Client visibility for lead-generation agencies.*
Sign in · Privacy · Terms *(only when live)* · hello@klaroh.app *([?] confirm)* · © {year} Klaroh

## 9. Waitlist interaction and success states

**Fields:** one visible field (work email, `type="email"`, `autocomplete="email"`, `inputmode="email"`). A hidden honeypot field (see implementation plan). Consent is implied by clear microcopy plus a linked privacy notice rather than a checkbox in v1 **[R]**; if the owner's counsel prefers explicit consent, add a required unchecked checkbox using the signup page's checkbox pattern **[V]**.

**Validation (client):** on submit, trim; empty → "Enter your work email."; fails basic pattern → "Enter a valid email address." Move focus to the field on error (matches `design.md` form rules **[V]**). Server remains the authority.

**States and exact strings:**

| State | Message |
|---|---|
| Empty | Enter your work email. |
| Invalid | Enter a valid email address. |
| Submitting | Joining… |
| Success (new or duplicate) | **You're on the list.** *We'll email you at {email} when it's your turn. Agencies are invited in the order they join.* |
| Rate limited (429) | Too many attempts. Please try again in a few minutes. |
| Server/network error | Something went wrong and your email wasn't saved. Please try again, or write to hello@klaroh.app. |
| Closed/disabled (if the list is capped or toggled off) | Early access is full for now. Email hello@klaroh.app and we'll note your interest. **[?]** |

Do **not** reveal whether an email was already registered, and do **not** show a position, count or date.

## 10. Accessibility requirements

- WCAG 2.2 AA target. Verify contrast of every text/background pair listed in §3.
- Semantic landmarks: `header`, `nav` (labelled), `main`, `section` with `aria-labelledby`, `footer`. One `h1`; headings never skip levels. Skip link ("Skip to main content") as the first focusable element.
- Form: visible `<label>` (reuse `Field`, which wires `htmlFor`, `aria-describedby`, `aria-invalid`, `role="alert"` **[V]**); success and error announced via a polite/assertive live region; focus moved to the confirmation heading on success; submit never silently disabled for empty fields (matches `design.md` **[V]**).
- Tabbed demo follows the WAI-ARIA tabs pattern: `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, roving tabindex, ←/→/Home/End keys; panels reachable without a pointer.
- The product frame is decorative-but-informative: provide a text alternative summarising the sample (visually hidden or `aria-label` on the region) and mark purely decorative SVG parts `aria-hidden`. Chart: include a visually available data table or text summary (the app's own chart pattern offers a table view **[V]**).
- Do not convey status by colour alone: chips always include an icon plus label (app rule **[V]**).
- Reduced motion honoured as specified in §7; no auto-playing content; no flashing.
- Targets ≥ 44px on touch; focus ring visible on every control; focus order follows visual order; mobile menu traps no focus and closes on Escape.
- Text resizes to 200% without loss; layout reflows at 320px with no horizontal scroll.
- Language: `<html lang="en">` **[V]**. Links have discernible names; external/mailto links indicated.
- Test: keyboard-only pass, VoiceOver/NVDA smoke test, axe (or Lighthouse) with zero serious issues.
