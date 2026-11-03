# Remarks System — Investigation Report (Phase 1)

Read before building. Findings from the existing codebase that shape the implementation.

## What exists that can be reused

- **Migration convention.** Numbered SQL files in `supabase/` (`01_…` → `19_…`), each idempotent-ish and self-documenting. New work lands as `20_remarks_rebuild.sql` — no editing of historical files.
- **Resend is fully configured.** `src/lib/resend.ts` (singleton) + `src/lib/email/send-email.ts` (`sendEmail()` wrapper that also writes an `email_logs` audit row). `email_logs.email_type` **already** includes `'remark_notification'`. HTML email templates live in `src/lib/email/templates/`. → No new Resend setup; just a new template + a `sendEmail({ email_type: 'remark_notification' })` call.
- **Supabase clients.** `lib/supabase/server.ts` (RLS, cookie session), `client.ts` (browser), `admin.ts` (service-role, bypasses RLS). API routes follow a clear pattern: `getUser()` → `resolveAgencyId()` → `checkRateLimit()` → admin client for writes (`create-client/route.ts` is the template).
- **Rate limiting.** `lib/rate-limit.ts` (`checkRateLimit`, `clientIp`) backed by the `check_rate_limit` RPC. Reused on the public POST/upload paths to stop anon abuse.
- **Storage pattern.** `SettingsModal` uploads to a public bucket `agency-assets` via `supabase.storage…getPublicUrl`. The attachment bucket mirrors this.
- **Design primitives.** `.btn`/`.btn-primary`, `.type-page-title`/`.type-section`, focus-ring standard (`focus:ring-1 focus:ring-primary/20 focus:border-primary`), card pattern (`rounded-lg border border-outline-variant/50 bg-surface-container-lowest`), Pattern-A modal, empty-state pattern — all documented in `design.md` and used verbatim.
- **`client_email` is half-wired already.** `CreateClientModal` already renders a "Client Email" field and `create-client/route.ts` already sends an invite email with it — but it is **never persisted** (no column). Phase 2/5 finish this.

## What conflicts with the plan

1. **RLS public-read (the big one).** Phase 2 asks for "Public can read remarks by `client_id`" as an RLS policy. The codebase **deliberately removed** the blanket `public_read_remarks USING (true)` policy in `17_security_hardening.sql` — `AUDIT.md` flags it as a CRITICAL multi-tenant data breach (anon key ships in the browser; `USING(true)` lets anyone dump every agency's remarks). The established secure pattern is a `SECURITY DEFINER` RPC scoped to one `client_id` (`get_public_remarks`). **Decision:** implement public read via the scoped RPC, not a blanket SELECT policy. This satisfies the hard rule "a client must never read another client's remarks" far better than `USING(true)`.
2. **Schema is breaking.** The current `remarks` table is `(client_id, stage, text)` and is consumed by `RemarksTimeline`, `PostRemarkForm`, `project-status.tsx`, `lib/data/remarks.ts`, the `get_public_remarks` RPC, the `set_remark_agency_id` trigger, `/clients/[slug]` and `/c/[slug]`. Dropping/recreating it forces updating every one of those. All are in (or adjacent to) the remarks scope, so this is acceptable — but `RemarkStage`/`REMARK_STAGES`/`Remark` in `lib/types.ts` and the `data/index.ts` re-export must change too or the build breaks.
3. **`agency_id` already on remarks.** Migration 18 already added `agency_id` + an auto-fill trigger. The rebuild keeps that idea but the trigger must become **`SECURITY DEFINER`** — the new anon insert path cannot read `clients` under RLS (blanket client read was dropped in 17), so an invoker-rights trigger would null out `agency_id` and fail the NOT NULL. (Migration 18's trigger only ever ran for authenticated agencies, so it didn't hit this.)
4. **`PostRemarkForm` is dead code.** Grep shows it is imported nowhere. Safe to repurpose into the new shared composer.

## What I'd do differently and why

- **Public read & insert via scoped RPC + a narrow anon INSERT policy**, not blanket policies (see conflict 1). Anon gets `INSERT … WITH CHECK (author_type = 'client')` only — it can post but cannot read the table directly; reads always go through the scoped RPC.
- **One shared remarks UI** (`RemarksView` + `RemarksTimeline` + `PostRemarkForm`) reused by the authenticated `/remarks/[slug]` page and the public `/c/[slug]` Remarks tab, parameterised by an `isPublic` flag — avoids two near-identical implementations.
- **Sidebar "Remarks" → `/remarks` index** (a client picker), because remarks are per-client and a top-level nav item has no single client context. This matches the existing top-level `NavLink` pattern while staying useful.
- **API routes do the writing; the browser never inserts remarks directly** — consistent with the post-audit direction (move privileged work server-side, validate, rate-limit).

## Risks

- **Data loss:** dropping `remarks` deletes existing rows. Intentional per spec (append-only rebuild); flagged as a manual/destructive step.
- **Storage bucket:** `remark-attachments` must exist and be public. Included as SQL in the migration *and* flagged as a manual step in case the SQL editor lacks storage-schema rights.
- **Trigger rights:** `SECURITY DEFINER` trigger reads `clients` — scoped to a single `id` lookup, no injection surface (parameterised), search_path pinned.
- **Build not verifiable offline if deps fail to install** — mitigated by matching existing patterns exactly and a typecheck once `node_modules` is present.
</content>
</invoke>
