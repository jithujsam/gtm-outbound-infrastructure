# Klaroh Design System Reference

Authoritative source: `src/app/globals.css` (the `@theme` block, type utilities and `.btn` / `.input` classes). Shared React primitives live in `src/components/ui/`. Components must not hard-code hex values — use a token, or add one to `@theme`.

---

## Tokens

All tokens are CSS variables in `@theme`, consumed as Tailwind utilities (`bg-primary`, `text-on-surface-variant`, `rounded-lg`, `max-w-page`).

### Brand

| Token | Hex | Role |
|---|---|---|
| `--color-primary` | `#003E2A` | Actions and chrome: buttons, sidebar, focus ring |
| `--color-primary-container` | `#0F573E` | Brand green for data: charts, meters, "good" |
| `--color-on-primary` | `#FFFFFF` | Text on primary |
| `--color-on-primary-container` | `#89CBAB` | Text on dark green |
| `--color-primary-fixed` / `-dim` | `#ADF1CF` / `#92D4B4` | Tints (active nav, success chip) |
| `--color-on-primary-fixed` / `-variant` | `#002114` / `#045139` | Text on the tints |

### Surfaces, text, borders

| Token | Hex | Use |
|---|---|---|
| `--color-background` / `--color-surface` | `#F8F9FF` | Page background |
| `--color-surface-container-lowest` | `#FFFFFF` | Cards, panels, inputs, modals |
| `--color-surface-container-low` / `-container` / `-high` / `-highest` | `#EFF4FF` / `#E5EEFF` / `#DCE9FF` / `#D3E4FE` | Sidebar, hover, tracks, neutral chips |
| `--color-on-surface` | `#0B1C30` | Primary text |
| `--color-on-surface-variant` | `#404943` | Secondary text, labels, icons |
| `--color-outline` | `#707973` | Muted text, strong border |
| `--color-outline-variant` | `#BFC9C1` | Default border (use `/40`–`/60` for hairlines) |

### Status

Each tone = solid (icons, bars, text on light) + `-container` (chip background) + `on-…-container` (text on it).

| Tone | Solid | Container | On-container |
|---|---|---|---|
| success | `#0F573E` | `#ADF1CF` | `#045139` |
| warning | `#B45309` | `#FEF3C7` | `#78350F` |
| critical (= error) | `#BA1A1A` | `#FFDAD6` | `#93000A` |
| info | `#1F5FA6` | `#D8E6F8` | `#123A63` |

### Charts

`--color-chart-1` (`#0F573E`) is the default single series. `chart-2…6` are for genuinely multi-series charts, used in order. Also `chart-grid`, `chart-axis`, `chart-axis-line`, `chart-reference`, `chart-cursor`. Pass them to Recharts as `var(--color-chart-1)`.

### Radius, spacing, elevation

- Radius: `sm` 4px (chips, marks) · `md` 6px (inline buttons) · `lg` 8px (controls, cards, panels) · `xl` 12px (large modals). `rounded-full` for pills and avatars.
- Spacing: 4px base unit (`p-1` = 4px). Page gutter 16 / 24 / 32px, card padding 16px, gaps 8 / 12 / 16px. `max-w-page` = 1440px.
- Elevation: cards are flat (border only). `--shadow-modal` is for overlays.

---

## Typography

Fonts: **Inter** (400 / 500 / 600) for UI, body, tables and numbers; **Instrument Serif** (400, normal + italic) for page titles only. Both load in `src/app/layout.tsx` via `next/font`. Use `font-normal`, `font-medium`, `font-semibold` only.

| Utility | Font | Size | Use |
|---|---|---|---|
| `.type-page-title` | Instrument Serif italic | 28px (32px at md+) | One per page |
| `.type-section` | Inter 600 | 16px | Panel, section and modal titles |
| `.type-stat` | Inter 600, tabular numerals | 28px | Headline numbers |
| `.type-body` | Inter 400 | 14px | Body (also the `body` default) |
| `.type-table` | Inter 400, tabular numerals | 13px | Table cells |
| `.type-caption` | Inter 400/500 | 12px | Captions, labels, chips. **12px is the minimum anywhere.** |

Colour is not part of these utilities — add `text-on-surface` etc.

---

## Shared primitives

| Primitive | Where | Notes |
|---|---|---|
| `PageContainer` | `components/ui/PageContainer.tsx` | Page gutter + `max-w-page` frame |
| `Panel` | `components/ui/Panel.tsx` | Standard card; optional title, subtitle, action |
| `StatusChip` | `components/ui/StatusChip.tsx` | `tone`: good / neutral / warning / critical / info; always icon + label |
| `StatusBadge` | `components/analytics/ui.tsx` | Campaign status → chip. Paused = warning, Completed = info, Draft = neutral with its own icon |
| `.btn` + `-primary` `-secondary` `-ghost` `-destructive` `-danger`, `-sm`, `-icon` | `globals.css` | 36px (32px `-sm`); 44px on touch devices |
| `.label` `.input` `.select` `.textarea` `.input-sm` `.input-error` `.field-hint` `.field-error` | `globals.css` | 40px inputs (36px `-sm`); 44px on touch devices |

---

## Color Usage

Semantic mapping of how tokens are actually applied, not just their hex values.

### Primary (`#003E2A`)
Used for: primary buttons (`btn-primary` background), active nav item text, active setting tab background (`bg-primary`), focused input border, link text (`text-primary`), logout icon hover, framer-motion nav indicator pill, "Connected" badge text, active nav item text.

### Primary Container (`#0F573E`)
Used for: auth branding panel background (`bg-primary`), chart area stroke and dot color (hardcoded), `--color-success` alias, icon background for "Domain Health" card in email infra signals.

### Primary Fixed (`#ADF1CF`)
Used for: active nav item background tint (`bg-primary-fixed/20`), hover background on nav links (`bg-primary-fixed/10`), sidebar and settings avatar background, "Connected" integration badge background (`bg-primary-fixed/40`), plan badge background in billing (`bg-primary-fixed/40`), preview mode banner (`bg-primary-fixed/20`).

### Surface Container Lowest (`#FFFFFF`)
Used for: all card and panel backgrounds, modal backgrounds, input field backgrounds, sidebar header logo box background in settings.

### Surface Container Low (`#EFF4FF`)
Used for: sidebar background, public dashboard footer, logo upload drop zone background (`bg-surface-container-low/50`).

### Surface Container (`#E5EEFF`)
Used for: secondary button hover state, close/icon button hover backgrounds, empty state icon container background, chart empty state background.

### Surface Container High (`#DCE9FF`)
Used for: "Campaign Paused" and "Campaign Ended" badge backgrounds.

### On-Surface (`#0B1C30`)
Used for: all primary body text, headings, card values.

### On-Surface Variant (`#404943`)
Used for: secondary labels, field helper text, icon default color in sidebar/nav, placeholder text in inputs, inactive states.

### Outline Variant (`#BFC9C1`)
Used for: default border on all cards (`border-outline-variant/50`), input borders at rest (`border-outline-variant`), modal borders, dividers at reduced opacity, chart cursor stroke.

### Error (`#BA1A1A`)
Used for: error message text, input error border state, destructive button text (`btn-destructive`), form validation text.

### Error Container (`#FFDAD6`)
Used for: error alert backgrounds in modals and forms, "Action Required" and "Issue Flagged" stage badge backgrounds.

### Warning (`#B45309`)
Used for: "You have unsaved changes." indicator in Settings modal footer.

---

## Spacing & Layout

### Page structure
- Authenticated pages: sidebar (fixed, 240/64px) + `<main>` with dynamic `marginLeft` tracking sidebar width
- Mobile: sidebar hidden, `<main>` full width, `pb-20` padding for bottom nav
- Content max-width: `max-w-6xl` with `mx-auto px-6 lg:px-8` on authenticated pages and public dashboard

### Grid patterns observed

| Context | Class |
|---|---|
| Stat cards row (4-up) | `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4` |
| Two-column content (chart + status) | `grid grid-cols-1 gap-6 lg:grid-cols-2` |
| Public dashboard (metrics + updates) | `grid grid-cols-1 gap-8 lg:grid-cols-3` (2/3 + 1/3) |
| Email infra signals (3-up) | `grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4` |
| Settings password fields | `grid gap-4 sm:grid-cols-2` |

### Card padding
- Standard card: `p-6`
- Responsive card: `p-3 md:p-6`
- Infra signal card: `p-4 md:p-5`
- Settings integration card: `p-4`

### Form spacing
- Between fields: `space-y-4` or `space-y-5`
- Label to input: `mb-2` (below label, above input)
- Helper text: `mt-1` below input
- Form actions row: `pt-4` top padding, `gap-3` between buttons

### Section spacing
- Page title to content: `mt-8`
- Stat card section to chart section: `mb-8`
- Section heading to content: `mt-6` (Settings sections)
- Sidebar nav items: `space-y-1`

---

## Border & Radius

### Radius conventions

| Value | Tailwind | Applied to |
|---|---|---|
| 8px | `rounded-lg` | Cards, inputs, buttons, modals, most icon containers, badges |
| 12px | `rounded-xl` | SettingsModal panel, EmailInfrastructureSignals edit modal |
| 9999px | `rounded-full` | Avatars, stage badges (pill tags), nav active indicator, mobile tab pill, plan badge |
| 6px | `rounded-md` | Small inline action buttons (pencil, close X in infra modal) |

`rounded-lg` is the universal default. `rounded-xl` appears only in two modal contexts.

### Border patterns

| Context | Class |
|---|---|
| Cards (standard) | `border border-outline-variant/50` |
| Inputs at rest | `border border-outline-variant` |
| Inputs focused | `focus:border-primary focus:ring-1 focus:ring-primary/20` (modals) or `focus:ring-2 focus:ring-primary/30` (auth/inline) |
| Input error state | `border-error focus:border-error focus:ring-error/20` |
| Modal container border | `border border-outline-variant` |
| Sidebar right edge | `border-r border-outline-variant/20` |
| Horizontal dividers | `border-outline-variant/40` (modal footer/section lines), `border-outline-variant/30`, `border-outline-variant/20`, `border-outline-variant/10` |
| Upload drop zone | `border-dashed border-outline-variant` |
| Notifications empty state | `border-dashed border-outline-variant/70` |

All borders use `outline-variant` (`#BFC9C1`) at various opacities. No other border color tokens are used as borders in components (the `outline` token is only used as muted text/chart axis color).

---

## Navigation

Names, icons, routes and active rules live in `src/components/nav/nav-config.ts`; the desktop sidebar, mobile bar and More sheet all read from it. One destination, one name.

| Destination | Route | Desktop | Mobile |
|---|---|---|---|
| Overview | `/dashboard` | Sidebar (top group) | Bottom bar |
| Campaigns | `/campaigns` | Sidebar (top group) | Bottom bar |
| Inbox | `/inbox` | Sidebar (top group) | Bottom bar |
| Infrastructure | `/infrastructure` | Sidebar (top group) | More sheet |
| Clients | `/clients` | Sidebar (top group) | More sheet |
| Settings | opens the settings dialog | Sidebar (bottom group) | More sheet |

- **Two groups on desktop.** The top group is the pages people work in (36px rows, 2px apart, 14px labels). Settings opens a dialog, so it sits in the bottom group with the Collapse control, above the account, not among the pages.
- **Mobile bar: Overview, Campaigns, Inbox, More.** Replies are acted on daily, so Inbox is one tap away; Infrastructure is a periodic health check, and a fifth tab would truncate its name. The More sheet carries the same filters as the bar when moving between analytics pages.

- **Controls are not destinations.** Collapse sidebar is a control, not a nav item. There is no "Add client" in the navigation; clients are created from the Clients page.
- **Active state:** highlighted row plus a left indicator bar (desktop), filled pill (mobile); `aria-current="page"` on the active link. Settings is a button with `aria-haspopup="dialog"` and is "current" only on `/settings/*` pages.
- **Account:** the avatar button at the bottom of the sidebar opens an account menu (Log out), also when collapsed. On mobile, Account / Log out is in the More sheet.
- **Breadcrumbs** use the same names and appear only on nested pages (campaign detail, client detail, client portal settings, Settings sub-pages). Top-level pages and Infrastructure sub-pages have none.
- **Infrastructure** has one sub-navigation row (Health, Email accounts, Warmup, Domains) directly under the page title, then the filters. It is a section tab bar, not a second set of primary tabs.
- Moving between Overview, Campaigns and Infrastructure keeps the active filters (range, client, campaign, provider).
- The sidebar offset is applied with CSS (`lg:ml-60` / `lg:ml-16`), never measured in JS, so the first paint is correct.

## Sync status

One layout for every sync indicator (`SyncRow` in `src/components/sync/SyncStatus.tsx`):

`[Synced] Instantly · Last synced 9 Oct, 7:31 AM   [↻ Sync now]`

- **Where:** in the page header's action slot (Overview, Inbox), at the right of the client status strip (client page), beside the period note (single campaign). No container of its own.
- **Campaign sync** (`SyncStatus`) and **reply sync** (`ReplySyncBar`) are separate processes with separate states and timestamps; they share the layout only. Never show one as fresh because the other is.
- **States:** Not synced · Syncing · Synced · Sync failed / Sync incomplete · Reconnect needed (chip tone + icon + label). A failure reason goes on a line under the status in the error colour.
- **Times** come from the sync runs (server timestamps), never page-load time; the current year is dropped (`formatSyncShort`, `LocalTime format="dateTimeShort"`) and a timestamp never breaks across lines. Hover shows the full last-successful time.
- **Button:** `btn btn-secondary btn-sm` (32px, 44px on touch), icon-only on phones with the label kept for screen readers. Settings → Integrations uses the `detailed` variant (last run, reason, what to do).

---

## Motion

Short, functional, never decorative (`globals.css` → Motion):

| Duration | Used for |
|---|---|
| 150ms | hover / colour changes, dropdowns and menus opening (`.dropdown-panel`), a conversation expanding (`.details-body`) |
| 160ms | dialogs entering — fade + 8px rise (`.modal-panel`, `.modal-backdrop`, SettingsModal) |
| 220ms | the mobile More sheet sliding up |
| 300ms | layout — the sidebar collapsing and the page margin following |

- `MotionConfig reducedMotion="user"` (DashboardLayout) turns framer-motion movement off for people who ask for less motion; the CSS rules stop looping decoration (`animate-pulse`, `animate-ping`) and the button press-scale. Spinners keep turning (they carry meaning).
- No overshooting springs: the mobile tab pill is critically damped; tab icons don't scale.

---

## Tables and route states

**`DataTable`** (`components/ui/DataTable.tsx`): server-safe primitives `DataTable`, `Th`, `Td`, `Tr`, `EmptyRow`. Used by the campaign comparison, mailbox, step, warmup and trend tables.
- Only the page scrolls vertically: tables grow with their content and scroll sideways inside their region. Pass `maxHeight` to a table that should scroll on its own; that also makes its header sticky (sticky needs a region that scrolls vertically). `Th sticky` / `Td sticky` pins the first column while scrolling sideways.
- A soft shadow on the scrolling edge shows there is more to see. The region is keyboard-focusable and named.
- 13px cells with tabular numerals. `density="compact"` (default, ~32px rows) or `"comfortable"` (~40px).
- Sorting state belongs to the caller; pass `sort` (`asc` / `desc` / `none`) and `onSort` to `Th` to render a sort button with `aria-sort`.

**Route states.**
- `loading.tsx` files (dashboard group, Overview, Campaigns, Campaign detail, Infrastructure, Clients, Client detail, public portal) render page-shaped skeletons from `components/ui/PageSkeletons.tsx`. In-page `Suspense` fallbacks use the same bodies so the placeholder does not change shape.
- `(dashboard)/error.tsx` keeps the sidebar and navigation usable and offers *Try again* (`unstable_retry`) and *Go to Overview*; it shows only the error digest, never the message. `c/[slug]/error.tsx` is the client-facing equivalent.
- `(dashboard)/not-found.tsx` handles `notFound()` for campaigns and clients; `app/not-found.tsx` handles unmatched URLs.
- Skeleton blocks are `aria-hidden`; each loading page is wrapped in a `role="status"` region.

---

## Overview structure

Top to bottom: filters and scope line → **Needs attention** → **At a glance** (five headline KPIs: emails sent, replies, meetings booked, opportunity value, bounces) → outbound funnel → performance over time and best campaigns → top campaigns and clients → **All metrics** (the full Activity / Engagement / Deliverability / Business outcomes groups, collapsed by default).

- The headline row reuses KPIs from the groups below, so numbers, deltas and sparklines are identical to the detailed view.
- **Needs attention** is built by `lib/analytics/attention.ts` from existing thresholds only: campaign in error/suspended, bounce rate at or above `BOUNCE_WARNING_PCT` (with at least `MIN_SAMPLE` sent), mailboxes with issues, and an active campaign that sent nothing in the range. It shows at most five rows, most urgent first, each linking to the place to act. When empty it states what was checked ("All clear: …"); mailbox health is only claimed when it could be loaded.
- The mailbox check streams in separately (own `Suspense`), so it never delays the rest of the page.

---

## Dialogs and forms

One behaviour for every dialog, in `components/ui/useDialogBehavior.ts`: the page behind does not scroll (reference-counted, scrollbar width kept), Escape closes the topmost dialog only, Tab stays inside, focus moves in on open and returns to the opener on close.

- **`Modal`** (`components/ui/Modal.tsx`) for ordinary dialogs: centred panel, one z-index (60), one backdrop, body scrolls inside the panel, `aria-labelledby` / `aria-describedby`. Sizes `sm` / `md` / `lg` / `xl`.
  - `variant="alert"` (role `alertdialog`) for destructive confirmations; put `data-autofocus` on Cancel so focus starts on the safe choice.
  - `dismissOnBackdrop={false}` for forms, so a stray click never discards typed input. Confirmations still close on outside click.
  - `busy` blocks every way of closing while a request is in flight; `dismissible={false}` is for must-answer dialogs (plan limit reached).
- The large bespoke dialogs (Settings, Connect ESP, the mobile More sheet) keep their layouts and call `useDialogBehavior` directly, so they behave identically.
- **`Field`** (`components/ui/Field.tsx`) wires label, control, hint and error (`htmlFor`, `aria-describedby`, `aria-invalid`); errors use `role="alert"` and sit under the field. **`FormError`** is the form-level banner for a failed request.
- Validate on submit, show the message at the field, and move focus to the first invalid field. Submit buttons are disabled only while a request is running, never silently because a field is empty.

---

## Auth pages

Sign-in, sign-up, forgot password and new password share the same pieces: `AuthBranding` (green panel, large screens) with `AuthMobileBrand` (logo + name on small screens, where the panel is hidden), `Field` / `FormError` for per-field and form-level errors, and `PasswordInput` (show/hide toggle) for every password field.

- One `h1` per page (the form column's). The panel headline is a paragraph.
- Validate on submit, show the message at the field, focus the first invalid field; clear a field's error as soon as it is edited. Inputs carry the right `autocomplete` (`email`, `current-password`, `new-password`, `organization`, `url`).
- Password minimum is 8 characters at sign-up and on reset.
- Static files in `public/` (the logo) are excluded from the auth proxy, so signed-out visitors can load them.

---

## Client pages

- **Client list (`/clients`)** is table-first: client, live/paused (toggle + chip), campaigns, capacity per day, active inboxes, domain health, added date, row actions. Domain health uses the same score bands as warmup health (`WARMUP_GOOD` / `WARMUP_FAIR`) so "healthy" means one thing everywhere. Card view is the alternative; the choice is remembered. Missing infrastructure values show "—", never 0. One status filter, one view toggle, and two distinct empty states ("No clients yet" with a create button, "No clients match" with *Clear filters*).
- **Client detail (`/clients/[slug]`)** uses `DataTable` for the campaign overview and the shared section-title style. Controls that did nothing ("coming soon" date-range and granularity toggles, mailbox status pills over an always-empty table) were removed rather than left looking broken. The client detail keeps its own data model; it is not yet built on the analytics shell.

---

## Component Inventory

`src/components/`

| File | Description |
|---|---|
| `AuthBranding.tsx` | Left-panel on auth pages; full-height `bg-primary` with blurred radial glow, serif headline, supporting text, social proof footer |
| `Sidebar.tsx` | Fixed left nav; collapsible (240px → 64px); nested client list with expand/collapse; framer-motion spring active indicator; agency avatar + logout |
| `DashboardLayout.tsx` | Authenticated shell; tracks sidebar width via ResizeObserver and applies `marginLeft` to `<main>`; mounts MobileBottomNav |
| `MobileBottomNav.tsx` | Fixed bottom bar (hidden on lg+); framer-motion layoutId pill indicator; opens SettingsModal inline |
| `MobileNav.tsx` | Additional mobile nav component (not fully read) |
| `SettingsModal.tsx` | Large two-pane modal (tab sidebar + content area); AnimatePresence enter/exit; body scroll lock; swipe gesture on mobile to switch tabs; sections: General, Account, Billing, Notifications |
| `CreateClientModal.tsx` | Form modal for creating a client; no animation; slug auto-generated from name |
| `EditClientModal.tsx` | Form modal for editing a client |
| `DeleteClientModal.tsx` | Confirmation modal for destructive client deletion |
| `integrations/ConnectEspModal.tsx` | Client onboarding: provider → connect → select + import campaigns |
| `EditCampaignModal.tsx` | Form modal for editing a campaign |
| `DeleteCampaignModal.tsx` | Confirmation modal for destructive campaign deletion |
| `ConnectorModal.tsx` | Modal for connecting a data source/integration |
| `CampaignDropdown.tsx` | Dropdown selector for switching between campaigns |
| `Toggle.tsx` | Animated boolean switch; framer-motion spring thumb and background color transition |
| `EmailInfrastructureSignals.tsx` | Three-metric card group (sending capacity, active inboxes, domain health); inline edit modal per card |
| `CampaignSectionSkeleton.tsx` | Skeleton loader for the campaign metrics section |
| `ClientDataSkeleton.tsx` | Skeleton loader for the client data area |
| `IntegrationSkeleton.tsx` | Skeleton loader for integration card state |
| `ProjectStatusSkeleton.tsx` | Skeleton loader for the project status panel |

---

## Interaction Patterns

### Modals — two distinct patterns

**Pattern A — simple conditional render** (CreateClientModal, DeleteClientModal, DeleteCampaignModal, EditClientModal, EditCampaignModal, ConnectorModal):
- Mount/unmount: `if (!open) return null` — instant, no animation
- Overlay: `fixed inset-0 z-40 bg-black/50`
- Panel: `fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-xl`
- Backdrop click closes modal

**Pattern B — animated** (SettingsModal):
- Mount/unmount: `AnimatePresence` with `motion.div`; fade + `y: 8 → 0` ease-out over 0.16s (same as `.modal-panel`); respects `prefers-reduced-motion`
- Overlay: `fixed inset-0 z-[60] bg-on-surface/40` (no blur, like every other dialog)
- Panel: fills screen on mobile; `sm:max-w-3xl sm:h-[680px] sm:rounded-xl` on desktop
- Backdrop mousedown closes modal

**Pattern C — simple in-place render** (EmailInfrastructureSignals edit modal):
- No AnimatePresence; renders when `editing !== null`
- Overlay: `fixed inset-0 z-50 bg-scrim/40` (note: `scrim` token not defined — see Known Inconsistencies)
- Panel: `rounded-xl max-w-sm` (differs from Pattern A)

### Loading states

- **Button loading**: `Loader2` from lucide-react with `animate-spin`, button `disabled`, text changes to in-progress copy ("Creating…", "Saving…", "Posting…")
- **Button disabled appearance**: `opacity: 0.5; cursor: not-allowed` via `.btn:disabled`
- **Section loading**: Dedicated skeleton components (`CampaignSectionSkeleton`, etc.) rendered via `<Suspense fallback={...}>` or conditional rendering

### Empty states

Consistent structure used across the codebase:
1. Container: `rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-12 text-center`
2. Optional icon container: `mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-fixed/20` with `text-primary` icon
3. Heading: `.type-section italic text-on-surface mb-2` (when present)
4. Supporting text: `font-sans text-sm font-normal text-on-surface-variant`

Some empty states omit the heading and icon (e.g. chart "No data yet" placeholders use a simpler centered `<p>` inside a sized container).

### Active navigation

- **Framer-motion layoutId pill**: A `motion.span` with `layoutId="activeNav"` (sidebar) or `layoutId="activeClient"` (client list) animates with `spring` physics (stiffness 500, damping 35) when the active item changes. Pill is 3px × 20px, `rounded-full`, `bg-primary`, positioned absolute at the left edge of the item.
- **Active item background**: `bg-primary-fixed/20`
- **Active item text**: `text-primary font-semibold`
- **Inactive hover**: `hover:bg-primary-fixed/10`
- Mobile bottom nav uses a separate `layoutId="tab-pill"` horizontal pill with `bg-[#D6EAE0]`

### Form validation display

- Per-field error text: `<p className="font-sans text-xs text-error mt-1">` below the input
- Error input border: toggled inline via template literal: `border-error focus:border-error focus:ring-error/20`
- Modal-level error banner: `rounded-lg border border-error/50 bg-error/10 px-4 py-3` with `text-sm text-error` inside
- Settings modal: error displayed via `AlertCircle` icon + inline `text-sm text-error` in the footer bar

### Button active/press state

All `.btn` elements have `transform: scale(0.98)` on `:active`. Nav links and icon buttons use `active:scale-[0.98]` or `active:scale-[0.95]`. Toggle uses `scaleY: 0.95` via framer-motion.

---

## Intentional Constraints

- **No gradients** on UI surfaces. The only gradient is the chart area fill (`linearGradient` in the SVG `<defs>` for the Recharts AreaChart), which is a data visualization element, not a UI surface treatment.
- **One exception to no-gradient**: AuthBranding uses two blurred `rounded-full` divs at `opacity-20` for a soft light effect — this is decorative art direction on the marketing/auth panel only, not replicated in the app.
- **No drop shadows on cards**. Cards use border-only definition (`border border-outline-variant/50`). `shadow-sm` appears only on public dashboard stat cards and is the only shadow used on card elements. `shadow-xl` is used on simple modal panels.
- **Inter weights restricted to 400, 500, 600**. No `font-light` (300), `font-black` (900), or non-standard weights appear in components. `font-bold` (700) appears only in one inline auth element and on the public dashboard agency name.
- **Instrument Serif always at weight 400, italic**. The three type scale classes (`.type-page-title`, `.type-section`, `.type-stat`) are all italic weight 400. `h1`–`h6` default to weight 400 via the global rule. The `font-medium` override in `AuthBranding` for the marketing headline is the only deviation.
- **All interactive elements use token colors for hover/active states** — with the exception of MobileBottomNav and Toggle (see Known Inconsistencies).
- **No `outline` color token used as a border**. `--color-outline` (`#707973`) only appears as muted text (`text-outline` / `text-on-surface-variant`) and chart axis labels. All borders use `outline-variant`.
- **Consistent border radius of 8px (`rounded-lg`) as the default**. Only `rounded-xl` (12px) breaks from this pattern, and only for large modal containers.

---

## Known Inconsistencies

### 1. `tailwind.config.ts` color values diverge from `globals.css` tokens

**✅ Fixed (branch `final-design-op-audit`)** — the entire `theme.extend.colors` block was deleted from `tailwind.config.ts`; colors now resolve solely from the `@theme` block in globals.css. (`fontFamily` and `boxShadow` extensions retained.)

`tailwind.config.ts` defines a separate `theme.extend.colors` block with different hex values:
- `primary-accent: #2D6A4F` vs. `--color-primary: #003E2A`
- `surface: #FCF9F8` vs. `--color-surface: #F8F9FF`
- `border-default: #E9E9E7` vs. `--color-outline-variant: #BFC9C1`
- `success: #16A34A` vs. `--color-success: #0F573E`

The `@theme` block in `globals.css` supersedes `tailwind.config.ts` for the Tailwind v4 `@import "tailwindcss"` setup. The config file appears to be a legacy artifact. It is referenced by nothing in the current codebase component patterns.

### 2. `MobileBottomNav` uses hardcoded JavaScript color constants

**✅ Fixed (branch `final-design-op-audit`)** — the three constants now reference CSS variables: `ACTIVE_COLOR` → `var(--color-primary)`, `INACTIVE_COLOR` → `var(--color-on-surface-variant)`, `PILL_BG` → `var(--color-primary-fixed)`. (One unrelated hex remains: the nav's top `borderColor: '#E9E9E7'` on line 36 — not part of this issue, left untouched.)

`src/components/MobileBottomNav.tsx` lines 10–12 define:
```js
const ACTIVE_COLOR = '#003E2A';
const INACTIVE_COLOR = '#6B7280';
const PILL_BG = '#D6EAE0';
```
These are applied via inline `style={{ color: ... }}` in framer-motion animated spans, bypassing the token system. `INACTIVE_COLOR` (`#6B7280`) has no token equivalent. `PILL_BG` (`#D6EAE0`) has no token equivalent.

### 3. `Toggle` uses hardcoded color values inconsistent with primary token

**✅ Fixed (branch `final-design-op-audit`)** — the animated `backgroundColor` now uses `var(--color-primary)` (on) and `var(--color-outline-variant)` (off), replacing the hardcoded `#2D6A4F`/`#D1D5DB`.

`src/components/Toggle.tsx` animates `backgroundColor` between `#2D6A4F` (on) and `#D1D5DB` (off). The "on" color `#2D6A4F` matches the deprecated `primary-accent` value in `tailwind.config.ts`, not `--color-primary: #003E2A`. Off state `#D1D5DB` has no token equivalent.

### 4. `AuthBranding` headline overrides the global heading weight rule

**✅ Fixed (branch `final-design-op-audit`)** — the `font-medium` class was removed from the `h1`; it now inherits the global heading weight (400).

`src/components/AuthBranding.tsx` line 27 applies `font-medium` (weight 500) to an `h1`. The global CSS rule sets all headings to weight 400. This is the only heading in the codebase with an explicit weight override.

### 5. `EmailInfrastructureSignals` edit modal differs from all other modals

**✅ Fixed (branch `final-design-op-audit`)** — the panel is now `rounded-lg max-w-md` and the heading uses `.type-section`, matching every other modal.

Its panel uses `rounded-xl max-w-sm` while all other modals in the codebase use `rounded-lg max-w-md`. This modal also has a non-standard heading style: `font-sans text-base font-semibold` instead of `.type-section`.

### 6. `EmailInfrastructureSignals` backdrop uses undefined `scrim` token

**✅ Fixed (branch `final-design-op-audit`)** — the overlay is now `bg-on-surface/40`, matching SettingsModal; the backdrop is no longer transparent.

The edit modal overlay is `bg-scrim/40`. The token `--color-scrim` is not defined in `globals.css` or `tailwind.config.ts`. Tailwind will resolve this as transparent. Other modals use `bg-black/50` (simple modals) or `bg-on-surface/40` (SettingsModal).

### 7. Campaign section chart uses hardcoded hex values

**⏳ Not fixed (deferred)** — chart colors are explicitly out of scope for the `final-design-op-audit` pass and remain a separate task. The same hardcoded chart hex also appears in `src/app/dashboard/dashboard-client.tsx`.

`src/app/clients/campaign-section.tsx` passes raw hex strings directly to Recharts SVG props:
- Stroke and dots: `#0F573E` (= primary-container, not primary)
- Grid lines: `#E5EEFF` (= surface-container)
- X-axis tick fill: `#404943` (= on-surface-variant)
- Y-axis tick fill: `#707973` (= outline)
- Tooltip cursor: `#BFC9C1` (= outline-variant)
- Chart gradient `stopColor`: `#0F573E`

### 8. Auth page inputs are taller than dashboard inputs

**✅ Fixed (branch `final-design-op-audit`)** — all six login/signup inputs were changed from `h-12` to `h-11` (44px), matching the dashboard standard.

Login/signup inputs use `h-12` (48px). Dashboard and modal inputs use `h-11` (44px, via the `inputClass` constant in SettingsModal) or no fixed height with `py-2.5` padding. These are the same interactive element in different contexts but have different heights.

### 9. `focus:ring` width inconsistency across inputs

**◑ Partially fixed (branch `final-design-op-audit`)** — the seven simple form modals were standardized to `focus:ring-1 focus:ring-primary/20 focus:border-primary` (the actual changes landed in `EditCampaignModal` and `ConnectorModal`; the others already conformed). By instruction, SettingsModal and auth inputs keep `focus:ring-2 focus:ring-primary/30`, and `PostRemarkForm` (`ring-2/30`) plus the `EmailInfrastructureSignals` edit input (`ring-1` without `/20`) were left untouched.

Auth page inputs: `focus:ring-2 focus:ring-primary/30`
PostRemarkForm select/textarea: `focus:ring-2 focus:ring-primary/30`
Modal inputs (CreateClientModal, SettingsModal `inputClass`): `focus:ring-1 focus:ring-primary/20`
EmailInfrastructureSignals edit input: `focus:ring-1 focus:ring-primary`

Three different ring width + opacity combinations are in use for the same focused input state.

---

## Client portal (`/c/[slug]/[token]`)

The client-facing report is a separate product surface from the operator dashboards — not the same UI with fewer
elements. It has no sidebar: a white header (agency logo + name, the **At a glance / Detailed report** switch), the page
title in Instrument Serif, then cards on the page background.

- **Language:** business words only (`PORTAL_METRICS` in `src/lib/analytics/portal.ts`): "Prospects reached", "Replies",
  "Positive responses". Never Instantly, warmup, DNS or database terms.
- **Summary card:** `border-l-4 border-l-primary-container` (the active/left-border indicator), a verdict chip
  (Producing results / Early results / Low response so far / Gathering data) and a status chip, then the generated
  sentences at 18–20px.
- **KPI cards:** individual cards (not a joined tile strip), 28px semibold value, 12px caption. Missing values show "—"
  in muted ink with "Not reported yet".
- **Progress over time:** one series at a time (`--color-chart-1`), area with a 2px line, tooltip and a table view; fewer
  than two recorded days shows an explanation instead of a chart.
- **Status:** `StatusChip` tones only (icon + label), e.g. infrastructure "Operating normally" (good) / "Needs attention"
  (warning) / "Not sending" (critical) / "Not reported yet" (neutral).
- **Agency settings:** `/clients/[slug]/portal` — panels for what the client sees, campaigns in the report, campaign
  economics, the private link and a live preview of the automatic summary; a sticky save bar.
