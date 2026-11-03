---
name: klaroh-design-system
description: Use when designing, building, restyling, or reviewing any UI in the Klaroh application (agency dashboards, campaign pages, client portals, auth, modals, charts, tables, badges, empty/loading/error states). Teach the agent to treat the existing Klaroh UI as the source of truth and design within its system instead of inventing a new visual language.
---

# Klaroh Design System — Design With the Existing UI

Klaroh is a Next.js 16 (App Router) + Tailwind CSS v4 client-visibility platform for lead generation agencies. **The existing UI is the source of truth.** Before touching any UI, study the current implementation. Do not redesigned welcome pages, and never introduce a competing visual language.

The authoritative design lives in **`src/app/globals.css`** (the `@theme` token block + `.input` / `.btn` component classes) and the compiled patterns in **`src/components/**`** and **`src/app/**`**. `tailwind.config.ts` is a legacy artifact — theming resolves from `globals.css`, not the config.

---

## 0. Mandatory workflow (follow in order, every time)

1. **Study before designing.** Read the relevant source first: the page in `src/app/**`, its co-located sections, any `src/components/**` it uses, and `globals.css`. Never design from memory or "modern SaaS" intuition.
2. **Identify the pattern vocabulary** the app already uses for this task: tokens, typography, spacing, borders, radius, density, layout, hierarchy, responsive behavior, interaction patterns.
3. **Reuse in priority order:** existing component → existing pattern → composition of existing patterns → only then a new pattern. Before creating a new component/pattern, state internally which Klaroh pattern it extends and why none of the 25 existing components in `src/components/*` fit.
4. **Make it belong.** New UI must look like it was designed by the same designer: same radius scale (predominantly `rounded-lg`), same border style (`border-outline-variant` at various opacities), same surfaces, same button/input classes.
5. **Preserve semantics.** Keep status colors, button behaviors, spacing hierarchy, and component conventions identical in meaning and appearance.
6. **Follow the existing responsive behavior** (desktop `lg+` sidebar ↔ mobile bottom nav; collapsing grids; tables wrapped in `overflow-x-auto`).
7. **Never alter** application logic, APIs, DB schemas, auth, data models, sync, or metric calculations unless explicitly requested.
8. **Verify visually.** After implementing a UI change, re-read the result against neighboring components and revise anything that reads as a different product.

After a change, show the user where the change lives and which Klaroh pattern it extends (e.g. "campaign-section badge pattern" or "empty state pattern").

---

## 1. Design tokens (source of truth: `src/app/globals.css` `@theme`)

### Color — Primary (deep forest green accent; the ONLY accent color)
| Token | Hex | Use |
|---|---|---|
| `primary` | `#003E2A` | Primary buttons, active sidebar/text accents, sidebar background, focus borders, links (`text-primary`), toggle-on |
| `primary-container` | `#0F573E` | `--color-success`, chart stroke, `bg-primary-container` icon chips |
| `on-primary` | `#FFFFFF` | Text on `primary` |
| `on-primary-container` | `#89CBAB` | Supporting text on the dark auth panel |
| `primary-fixed` | `#ADF1CF` | Soft green tint — icon chips, active-hover tints (`bg-primary-fixed/20/30/40`), preview banner |
| `on-primary-fixed` | `#002114` | Text on `primary-fixed` |

### Color — Surfaces (very light blue-tinted neutrals; cool, not warm)
| Token | Hex | Use |
|---|---|---|
| `surface` / `background` | `#F8F9FF` | Page background |
| `surface-container-lowest` | `#FFFFFF` | All cards, modals, inputs |
| `surface-container-low` | `#EFF4FF` | Table headers, sub-cells, chart empty area |
| `surface-container` | `#E5EEFF` | Hover states, inactive pill bg, chart grid |
| `surface-container-high` | `#DCE9FF` | Elevated hover |
| `surface-container-highest` | `#D3E4FE` | Rarely used |

### Color — Text & lines
| Token | Hex | Use |
|---|---|---|
| `on-surface` | `#0B1C30` | Body/headings |
| `on-surface-variant` | `#404943` | Secondary labels, placeholder, captions |
| `outline` | `#707973` | Muted text, chart Y-axis tick fill (never as a border) |
| `outline-variant` | `#BFC9C1` | **All** borders (`border-outline-variant/50` on cards, `/70` inputs, `/40/*/20/*/10` dividers) |

### Color — Secondary / tertiary (for icon-chip variety only)
`secondary-container #D5E0F8` + `on-secondary-container #586377`; `tertiary-fixed #E0E3E5` + `on-tertiary-fixed #191C1E`.

### Color — Status (do not re-map these meanings)
| Token | Hex | Used for |
|---|---|---|
| `error` | `#BA1A1A` | Errors, destructive, negative deltas |
| `error-container` | `#FFDAD6` | Error banner bg (`bg-error-container/40`), unhealthy status badges |
| `success` | `#0F573E` | Positive deltas, "Active" text |
| `warning` | `#D97706` | Trial/limit warnings, unsaved-changes indicator |

Shadows: only `--shadow-modal: 0 8px 32px rgba(11,28,48,0.10)` (modals, dropdowns, toasts). Cards are border-defined — no card drop shadows.

Fonts: **Inter only** (weights 400/500/600), loaded via `next/font`. `--font-serif` is declared but **not loaded** in the current build.

---

## 2. Typography conventions (as-built, NOT design.md)

HEADINGS ARE INTER, NOT SERIF. `design.md` documents an older serif-italic `Instrument Serif` system; the current reverted build does **not** load that font and `globals.css` has **no** `.type-page-title/.type-section/.type-stat` rules. Those class names still appear in some markup (clients page `h1`, billing page, some modal `h2`s) but resolve to nothing. Do not rely on them, and do not add a serif type scale.

Standard type patterns actually in use:
- **Page title (H1):** `font-sans text-xl font-semibold tracking-tight text-on-surface` (e.g. "Performance Overview", "Remarks"). Subtitle directly under: `font-sans mt-1 text-sm text-on-surface-variant`.
- **Card section heading:** `font-sans text-sm font-semibold text-on-surface uppercase tracking-wider` (e.g. "Campaign Performance", "Project Status").
- **Big metric value:** `font-sans text-3xl font-semibold text-on-surface`.
- **Card/row title:** `font-sans text-base font-semibold text-on-surface`; client names inside cards `text-primary`.
- **Label/caption:** `text-xs font-medium text-on-surface-variant`; tiny sub-captions `text-xs text-on-surface-variant`. Upload helpers `text-xs`.
- **Eyebrows/uppercase microtext:** `text-xs font-semibold uppercase tracking-wider text-on-surface-variant` (or `tracking-wide`).
- **Body paragraphs:** `font-sans text-sm text-on-surface` / `text-on-surface-variant`, `leading-relaxed` for long copy.
- **Links:** `text-primary font-medium hover:underline`, or card links `text-primary text-xs/sm font-medium hover:underline` with `ArrowRight size={12/14}`.
- **Monospace:** `font-mono` only for API keys / campaign-id hashes, `tracking-wide/wider`, `break-all`, `text-xs text-on-surface-variant`.

---

## 3. Core component classes (reuse these, don't reinvent)

### Buttons — `.btn` system (`globals.css`)
One footprint: 36px tall (`h-2.25rem`), `px-4`, Inter 0.875rem/500, `rounded-lg`, `gap-2`, `:active` scale(0.98), `:disabled` opacity-0.5.
- `.btn .btn-primary` — `bg-primary`, white text, hover `opacity: 0.9`. Primary CTA.
- `.btn .btn-secondary` — white bg, `border border-outline-variant`, hover `bg-surface-container`.
- `.btn .btn-destructive` — white bg, border, `text-error`, hover `bg-error/10`.
- Solid destructive in delete confirms: `btn border border-error/50 bg-error text-white hover:opacity-90`.
- Adding a class like `w-full`, `flex-1`, `gap-1.5`, `text-xs` on top is the norm.
- Icon-only buttons: `h-9 w-9 flex items-center justify-center rounded-lg border border-outline-variant (bg-surface|bg-surface-container-lowest) text-on-surface-variant hover:bg-surface-container active:scale-[0.96]`; delete variants swap `text-error hover:bg-error/10`.
- Include lucide icon + label with a gap; spinner = `Loader2 size={16} animate-spin` + in-progress copy ("Saving…", "Syncing…", "Creating…").
- Text-button variants inside Settings: `btn text-error hover:bg-error-container/40` (Disconnect).

### Inputs — `.input` (`globals.css`)
Height 2.75rem, w-full, `rounded-lg`, 1px `outline-variant` border, white bg, `px-3`, 0.875rem, focus `border-primary` + `box-shadow 0 0 0 2px color-mix(primary 30%)`. `.input-error` uses `--color-error`. Disabled = opacity 0.5 not-allowed.
- Inline (non-modal) inputs use the utility equivalent: `h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm ... focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20`.
- Textareas: `resize-y`; selects use `.input` too.
- Labels: `font-sans mb-1.5 block text-sm font-medium text-on-surface-variant`. Helper text `mt-1 text-xs text-on-surface-variant`. Error text `mt-1 text-xs text-error`; error input has `input-error`.

### Cards
`rounded-lg border border-outline-variant/50 bg-surface-container-lowest` with padding `p-6` (standard), `p-3 md:p-6` (responsive), `p-4`, or `p-5`. Larger page-level containers may use `rounded-xl`. No shadows on cards (only `hover:shadow-modal` on the Overview client cards, and `shadow-sm` on a few public stat cards). Sub-cells inside cards use `bg-surface-container-low`.

### Badges / pills
`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold` (or `font-medium`). Semantic colors:
- Connected/Live/Updated: `bg-primary-fixed/30 text-primary` (+ `span h-1.5 w-1.5 rounded-full bg-primary animate-pulse`).
- Offline/Inactive: `bg-surface-container text-on-surface-variant` (+ gray static dot).
- Unhealthy/Suspended: `text-error bg-error-container` (see `src/lib/instantly-status.ts`).
- Integration pill (dashboard header): `rounded-full border border-primary/10 bg-primary-fixed/20 px-3 py-1` + pulsing dot, then `text-xs font-semibold uppercase tracking-wider text-primary`.
- Active plan: `rounded-full bg-primary-fixed/40 px-2.5 py-1 text-xs font-semibold text-primary`.
- Author badge (remarks): agency `bg-primary-fixed/40 text-primary`; client `bg-secondary-container text-on-secondary-container`.
- Recommendation tag: `rounded-full bg-primary px-4 py-1 text-sm font-medium text-on-primary`.
- Mobile status toggle fallback: `bg-success/20 text-success` = Active, `bg-surface-container text-on-surface-variant` = Paused.

### Tables
- Wrap in `overflow-x-auto rounded-xl border border-outline-variant/50` (client list) or `rounded-lg`.
- `thead`: `bg-surface-container-low`; `th`: `px-4 md:px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant` (numeric cols `text-right`).
- `tbody tr`: `border-b border-outline-variant/20 hover:bg-surface-container-low/50`.
- `td`: `px-4 md:px-6 py-4`. Numeric values: `text-right text-sm font-medium tabular-nums text-on-surface sm hidden md:table-cell`-style responsive hiding.
- Rows in the Instantly picker use `divide-y divide-outline-variant/30` and a primary action that is `opacity-0 group-hover:opacity-100`.

### Forms
- Modal forms: `space-y-4`; actions row `flex gap-3 justify-end pt-4`; Cancel = `btn btn-secondary`, submit = `btn btn-primary` (disabled while invalid).
- Page-level forms: `space-y-5`.
- Error banner: `rounded-lg border border-error/50 bg-error/10 px-4 py-3` with `text-sm text-error` (page-level auth errors use `border-error-container bg-error-container/40`).

### Loading states
- Page-level `Suspense` fallback: skeleton blocks matching the page shape — `h-12 w-48 animate-pulse rounded-lg bg-outline-variant/20` (title), then `h-6 w-96 ...` (subtitle).
- Dedicated skeletons exist: `CampaignSectionSkeleton`, `IntegrationSkeleton`, `ProjectStatusSkeleton`. Reuse or mirror them (same pulse + `bg-outline-variant/20–30` + `rounded-lg`, matching real card dimensions).
- Buttons: `Loader2 animate-spin` + disabled + in-progress label. Full-area: centered `Loader2 size={20} animate-spin text-on-surface-variant`.

### Empty states (consistent recipe)
1. `rounded-lg (or rounded-xl) border border-outline-variant/50 bg-surface-container-lowest p-12 text-center`
2. Icon box: `mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-fixed/20` with `lucide` icon `size={20–24} text-primary`
3. Heading: `text-base font-semibold text-on-surface mb-2` (e.g. "No campaigns yet")
4. Copy: `text-sm text-on-surface-variant` (may wrap in `max-w-sm`)
5. Optional CTA `btn btn-primary` ("+ Add First Client")
Chart/timeline empties use a simpler centered `text-sm text-on-surface-variant` on `bg-surface-container-low` in the chart's height.

### Toasts
`fixed bottom-24 md:bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-on-surface px-4 py-2.5 text-sm text-surface shadow-modal`.

---

## 4. Modals — use the existing patterns

Three patterns already exist; pick the nearest one.

**Pattern A — static form/confirm modal** (`CreateClientModal`, `EditClientModal`, `DeleteClientModal`, `EditCampaignModal`, `DeleteCampaignModal`):
- `if (!open) return null`.
- Backdrop: `fixed inset-0 z-40 bg-black/50` (click closes).
- Panel: `fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-modal`.
- Title `text-base font-semibold text-on-surface`; header icon for destructive: `h-10 w-10 rounded-lg bg-error/10` + `AlertTriangle text-error`; confirm copy in a `rounded-lg border border-outline-variant/50 p-4` box.
- Close X: `rounded-lg p-1 text-on-surface-variant hover:bg-surface-container`.

**Pattern B — multi-step / wide** (`CreateCampaignModal`): same A backbone but `rounded-xl`, dynamic width (`max-w-md` ↔ `max-w-3xl max-h-[85vh] flex flex-col` for the picker step), back-chevron in header, option cards with custom radio circles, bordered footer `border-t border-outline-variant/40 px-6 py-3`.

**Pattern C — centered overlay modals** (`CreateCampaignModal`, `EmailInfrastructureSignals` edit, `RemarksView` composer): overlay `fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4`, panel `rounded-xl bg-surface-container-lowest shadow-modal`, header band with `border-b border-outline-variant` + `title: text-sm font-semibold uppercase tracking-wider` for the small edit modal; selectable cards with `active ? 'border-primary bg-surface-container' : 'border-outline-variant hover:border-primary'`.

**SettingsModal** is the only animated one (`AnimatePresence`, fade + y 8, `sm:max-w-3xl sm:h-[680px] sm:rounded-xl`, overlay `z-[60] bg-on-surface/40 backdrop-blur-sm`); use it as-is, don't copy its scale for new modals.

---

## 5. Charts & data display (Recharts — follow the house style)

Chart wrappers live in a card; header = section heading (`text-sm font-semibold uppercase tracking-wider`) + subtitle `text-xs/text-sm text-on-surface-variant` + a right-side control button (`btn btn-secondary` with `ChevronDown` "Current Month", or a refresh button with `RefreshCw` + spin while `syncing` → "Syncing…").

Shared chart style (copy `ChartTooltip` + axis props verbatim):
- **Tooltip:** `rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2`, uppercase micro label `text-xs` + value `text-sm font-semibold` (or `text-lg font-medium`).
- **CartesianGrid:** `stroke="#E5EEFF"` (surface-container), `strokeWidth={1}`, `vertical={false}` / `horizontal={false}`.
- **XAxis:** `tickLine={false} axisLine={false} tick={{ fill:'#404943', fontSize:12 }} dy={8}`. **YAxis:** `tickLine={false} axisLine={false} width={40} tick={{ fill:'#707973', fontSize:11 }}`.
- **Cursor:** `stroke:'#BFC9C1', strokeDasharray:'4 4'` (area) or `fill:'rgba(15,87,62,0.06)'` (bars).

Chart types by data:
- **Weekly / cumulative leads trend** (legacy `week_1..4_leads`): `AreaChart` with `linearGradient` `#0F573E` 0.15 → 0, `Area stroke="#0F573E" strokeWidth={2}`, `dot={{ fill:'#0F573E', r:4, stroke:'#fff', strokeWidth:2 }}`, `activeDot r:6`. Used by overview, campaign section, and public portal.
- **Instantly outreach funnel** (`Leads → Contacted → Opened → Replied → Opportunities`): vertical `BarChart`, `Bar fill="#0F573E" radius={[0,4,4,0]} maxBarSize={26}`, `LabelList position="right"` with formatted values, category YAxis.
- If you introduce a new chart, reuse these exact colors, tooltip, and axis conventions, and prefer the smart Y-axis with nice intervals + ~15% headroom already implemented (`src/app/(dashboard)/clients/campaign-section.tsx` and `src/app/c/[slug]/public-client-view.tsx`).

### Analytics guidance (dashboard redesigns)
- Prioritize information hierarchy and the most useful visualization, not generic metric walls. Trends → charts; precise records → tables; comparisons → compact summaries; workflow/relations → visual lanes or timelines.
- The existing fixed 4 stat cards + chart + project-status layout is the reference; extend it with detail tables or funnel visuals (as the Instantly "Detailed Metrics"/"Campaign Details" `<dl>` grids do) rather than stacking more identical metric cards.

### Detail grids (`dl` pattern)
Instantly detail sections use `dl.grid.grid-cols-2.gap-x-6.gap-y-3.md:grid-cols-3`, `dt` = `text-xs uppercase tracking-wider text-on-surface-variant`, `dd` = `mt-0.5 text-sm font-medium text-on-surface`. Values may be a status pill.

---

## 6. Layout & responsive conventions

- **Shell:** fixed sidebar (`bg-primary`, 240px expanded / 64px collapsed, animated width) on `lg+`; `MobileBottomNav` (`lg:hidden`, `h-16`, white bg, primary pill indicator) below `lg`, with `pb-20` on `<main>` so content clears it. `<main>` uses `marginLeft = sidebarWidth` (0 on mobile).
- Top header bar (DashboardLayout): `h-14 border-b border-outline-variant/10 bg-[#F8F9FF] px-4 md:px-6 lg:px-8` — breadcrumbs left (`font-sans text-xs font-medium tracking-wide`, separators `/` at `text-on-surface-variant/30`, current crumb `text-primary font-semibold`), client actions right (Live pill + `Toggle`, share + external-link icon buttons 32px).
- **Page wrapper:** `px-4 py-4 md:px-6 md:py-4 lg:px-8 lg:pb-16 lg:pt-4` (varies `pt-4/6/8` by page) → `<div className="mx-auto max-w-[1440px]">`.
- **Grids used today:**
  - Stat cards: `grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4`.
  - Chart + project status: `grid grid-cols-1 gap-6 lg:grid-cols-2` (campaign) or `lg:grid-cols-12` with `lg:col-span-8`/`lg:col-span-4` (overview dashboard).
  - Client cards: `grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3` (or `sm:grid-cols-2 xl:grid-cols-3` on Overview).
  - Overview stats + leaderboard: `grid grid-cols-1 gap-6 lg:grid-cols-3` (`lg:col-span-2` stats, `lg:grid-cols-2` inside).
  - Remarks pages: `lg:grid-cols-2 lg:items-start` (chart slot + tabs/timeline).
- **Headers** switch from stacked (`flex flex-col gap-4`) to row (`md:flex-row md:items-end md:justify-between`). Toolbars stack on mobile (`flex flex-col gap-3 md:flex-row md:items-center md:justify-between`).
- **Responsive select/dropdown:** mobile uses a pill dropdown (`rounded-full border h-8 px-3 text-xs`) via `md:hidden`; desktop uses a bordered `<select>` `hidden md:block`. View toggles: mobile = 8px-icon buttons w/ `bg-primary` active, desktop = bordered `p-1` segmented container with `bg-primary-fixed/20 text-primary` active.
- **Motion:** framer-motion everywhere but respect `useReducedMotion()` (skip counters, y-offsets, scale). Stagger reveal: container `staggerChildren 0.07`, items `opacity 0/y 12 → visible`, `duration 0.3 easeOut`. Collapse/bottom-nav pills use spring physics. Chevrons rotate 180° on open.

---

## 7. What NOT to do (anti-patterns explicitly avoided today)

- No generic SaaS-dashboard aesthetics, no excessive rounded cards, no gradients (the only gradient is the chart area fill), no glassmorphism (only modal overlays use a 40% on-surface blur), no giant/hero typography, no drop shadows on cards, no arbitrary/decorative colors, no serif type (font isn't loaded).
- Do not switch headings to `Instrument Serif` or reintroduce `.type-page-title/.type-section/.type-stat` — they are undefined in the current build; if you encounter them in markup you are touching, upgrade them to the Inter equivalents above.
- Do not add new status colors; reuse `instantly-status.ts` and the pill classes above.
- Do not restyle the sidebar/bottom-nav/modal primitives; extend from them.

---

## 8. Hard resource constraints

- **Do NOT run `tsc`, `npx tsc --noEmit`, or `npm run build`** unless the user explicitly asks.
- Do not modify application logic, APIs, database schemas, authentication, data models, synchronization, or metric calculations unless explicitly requested.
- UI-only changes: keep them scoped to components and markup. Prefer `edit` of existing files; create new components/canonical patterns only when no existing component fits (and then model them on the closest existing one).

---

## 9. Quick reference — where patterns live

| Concern | Reference files |
|---|---|
| Tokens, buttons, inputs | `src/app/globals.css` |
| Sidebar / mobile nav / shell | `src/components/{Sidebar,MobileBottomNav,DashboardLayout}.tsx`, `src/components/SidebarContext.tsx` |
| Overview dashboards | `src/app/(dashboard)/dashboard/*` (overview-layout), `src/lib/data/overview.ts` |
| Client dashboard + campaigns | `src/app/(dashboard)/clients/{dashboard-layout,campaign-section,integration-section,project-status}.tsx`, `src/components/CampaignSectionSkeleton.tsx`, `src/lib/instantly-status.ts` |
| Client list (grid/list, table) | `src/app/(dashboard)/clients/{page,dashboard-client-list}.tsx` |
| Remarks | `src/app/(dashboard)/remarks/**`, `src/components/{RemarksView,RemarksTimeline,PostRemarkForm}.tsx`, `src/lib/utils/relative-time.ts` |
| Public client portal | `src/app/c/[slug]/*` |
| Auth | `src/app/auth/**`, `src/components/AuthBranding.tsx` |
| Settings & billing | `src/components/SettingsModal.tsx`, `src/app/(dashboard)/settings/**` |
| Modals | `src/components/{CreateClientModal,EditClientModal,DeleteClientModal,CreateCampaignModal,EditCampaignModal,DeleteCampaignModal,LimitReachedModal}.tsx` |
| Charts | Recharts usage in `clients/campaign-section.tsx`, `clients/client-dashboard.tsx`, `c/[slug]/public-client-view.tsx` |
| Toggle | `src/components/Toggle.tsx` |