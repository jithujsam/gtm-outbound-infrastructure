// Client portal reads and settings.
//
// Public: getPortalReport(token) — the ONLY way the public portal reads data,
// through the SECURITY DEFINER get_client_portal(token). The random token is
// the authorization; the slug in the URL is cosmetic.
//
// Agency: portal settings and campaign economics through the caller's
// RLS-scoped client (workspace members only).

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { SnapshotRow } from '../analytics/history.ts';
import type { LeadInterest } from '../providers/types.ts';
import {
  DEFAULT_PORTAL_SETTINGS,
  isPortalMetric,
  portalCampaignFromRow,
  type Economics,
  type PortalAccountRow,
  type PortalCampaign,
  type PortalSettings,
} from '../analytics/portal.ts';

export const PORTAL_TOKEN = /^[0-9a-f]{64}$/;

export interface PortalReport {
  status: string;
  slug: string;
  clientName: string;
  agencyName: string | null;
  agencyLogoUrl: string | null;
  settings: PortalSettings & { allCampaigns: boolean };
  /** Every campaign of the client (the report may include fewer). */
  totalCampaigns: number;
  campaigns: PortalCampaign[];
  history: SnapshotRow[];
  /** null when the agency hides the infrastructure section. */
  infrastructure: PortalAccountRow[] | null;
}

export type PortalLookup = { kind: 'missing' } | { kind: 'inactive'; slug: string } | { kind: 'ok'; report: PortalReport };

function toSettings(raw: Record<string, unknown> | undefined): PortalSettings & { allCampaigns: boolean } {
  const metrics = Array.isArray(raw?.metrics) ? (raw.metrics as unknown[]).filter(isPortalMetric) : DEFAULT_PORTAL_SETTINGS.metrics;
  return {
    mode: raw?.mode === 'simple' ? 'simple' : 'advanced',
    metrics,
    campaignIds: null,
    allCampaigns: raw?.all_campaigns !== false,
    showInfrastructure: raw?.show_infrastructure !== false,
    showEconomics: raw?.show_economics !== false,
    showConversations: raw?.show_conversations !== false,
  };
}

export async function getPortalReport(token: string): Promise<PortalLookup> {
  if (!PORTAL_TOKEN.test(token)) return { kind: 'missing' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_client_portal', { p_token: token });
  if (error) throw new Error(`get_client_portal failed: ${error.message}`);
  if (!data) return { kind: 'missing' };
  const d = data as Record<string, unknown>;
  if (d.status !== 'active') return { kind: 'inactive', slug: String(d.slug ?? '') };
  const branding = (d.branding ?? {}) as Record<string, string | null>;
  return {
    kind: 'ok',
    report: {
      status: 'active',
      slug: String(d.slug),
      clientName: String(d.client_name ?? ''),
      agencyName: branding.agency_name ?? null,
      agencyLogoUrl: branding.agency_logo_url ?? null,
      settings: toSettings(d.settings as Record<string, unknown> | undefined),
      totalCampaigns: Number(d.total_campaigns ?? 0),
      campaigns: ((d.campaigns ?? []) as Record<string, unknown>[]).map(portalCampaignFromRow),
      history: (d.history ?? []) as SnapshotRow[],
      infrastructure: Array.isArray(d.infrastructure) ? (d.infrastructure as PortalAccountRow[]) : null,
    },
  };
}

/** The portal path for a client: readable slug + the token that authorizes it. */
export const portalPath = (slug: string, token: string) => `/c/${encodeURIComponent(slug)}/${token}`;

export interface PortalConfig {
  token: string;
  tokenCreatedAt: string;
  settings: PortalSettings;
  economics: Record<string, Economics>;
}

/** The agency's view of a client's portal (RLS: own workspace only). */
export async function getPortalConfig(supabase: SupabaseClient, clientId: string): Promise<PortalConfig | null> {
  const [{ data: p, error }, { data: econ }] = await Promise.all([
    supabase
      .from('client_portals')
      .select('access_token, token_created_at, mode, metrics, campaign_ids, show_infrastructure, show_economics, show_conversations')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase.from('campaign_economics').select('campaign_id, currency, cost, value_per_positive').eq('client_id', clientId),
  ]);
  if (error) console.warn('getPortalConfig error:', error.message);
  if (!p) return null;
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    token: p.access_token as string,
    tokenCreatedAt: p.token_created_at as string,
    settings: {
      mode: p.mode === 'simple' ? 'simple' : 'advanced',
      metrics: ((p.metrics as string[]) ?? []).filter(isPortalMetric),
      campaignIds: (p.campaign_ids as string[] | null) ?? null,
      showInfrastructure: !!p.show_infrastructure,
      showEconomics: !!p.show_economics,
      showConversations: p.show_conversations !== false,
    },
    economics: Object.fromEntries(
      (econ ?? []).map((e) => [
        e.campaign_id as string,
        { currency: e.currency as string, cost: n(e.cost), valuePerPositive: n(e.value_per_positive) },
      ])
    ),
  };
}

/** Only the token (for share / preview links). */
export async function getPortalToken(supabase: SupabaseClient, clientId: string): Promise<string | null> {
  const { data } = await supabase.from('client_portals').select('access_token').eq('client_id', clientId).maybeSingle();
  return (data?.access_token as string | undefined) ?? null;
}

// ── conversations with interested prospects (token-authorized) ─────────────

export interface PortalConversation {
  key: string;
  leadName: string | null;
  leadCompany: string | null;
  leadEmail: string | null;
  campaign: string;
  interest: LeadInterest | null;
  subject: string | null;
  replies: number;
  lastReplyAt: string | null;
  messages: { sentAt: string; fromName: string | null; body: string | null }[];
}

export interface PortalConversations {
  enabled: boolean;
  everSynced: boolean;
  lastSyncedAt: string | null;
  lastSyncFailed: boolean;
  conversations: PortalConversation[];
}

/** The client's positive conversations (the token decides the client; nothing else is trusted). */
export async function getPortalConversations(token: string): Promise<PortalConversations> {
  const off: PortalConversations = { enabled: false, everSynced: false, lastSyncedAt: null, lastSyncFailed: false, conversations: [] };
  if (!PORTAL_TOKEN.test(token)) return off;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_client_portal_conversations', { p_token: token });
  if (error) {
    // the report still renders without this section
    console.warn('get_client_portal_conversations failed:', error.message);
    return off;
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (!d.enabled) return off;
  return {
    enabled: true,
    everSynced: !!d.ever_synced,
    lastSyncedAt: (d.last_synced_at as string | null) ?? null,
    lastSyncFailed: !!d.last_sync_failed,
    conversations: ((d.conversations ?? []) as Record<string, unknown>[]).map((c, i) => ({
      key: `c${i}`,
      leadName: (c.lead_name as string | null) ?? null,
      leadCompany: (c.lead_company as string | null) ?? null,
      leadEmail: (c.lead_email as string | null) ?? null,
      campaign: String(c.campaign ?? ''),
      interest: (c.interest as LeadInterest | null) ?? null,
      subject: (c.subject as string | null) ?? null,
      replies: Number(c.replies ?? 0),
      lastReplyAt: (c.last_reply_at as string | null) ?? null,
      messages: ((c.messages ?? []) as Record<string, unknown>[]).map((m) => ({
        sentAt: String(m.sent_at),
        fromName: (m.from_name as string | null) ?? null,
        body: (m.body as string | null) ?? null,
      })),
    })),
  };
}
