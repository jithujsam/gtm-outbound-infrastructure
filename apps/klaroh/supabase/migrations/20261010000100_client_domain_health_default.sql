-- ═══════════════════════════════════════════════════════════════════════════
-- 20261010000100_client_domain_health_default.sql — no default "Healthy"
--
-- clients.domain_health_status is a label the agency types in (with
-- domain_health_score). It defaulted to 'Healthy', so every new client
-- looked healthy before anyone had entered or checked anything. New clients
-- now start with no status (null = not entered); the app shows "—" and never
-- shows a status without a score.
--
-- Existing rows are not changed: values already stored (including defaults
-- stored on earlier clients) stay as they are. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clients alter column domain_health_status drop default;
