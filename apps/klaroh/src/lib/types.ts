// Shared domain types for the new Klaroh schema.
// Safe to import from both server and client components (types only).

export type ClientStatus = 'active' | 'paused' | 'ended';

export interface Client {
  id: string;
  name: string;
  slug: string;
  status: ClientStatus;
  client_email?: string | null;
  created_at: string;
  campaign_count?: number;
  sending_capacity?: number | null;
  active_inboxes?: number | null;
  domain_health_score?: number | null;
  domain_health_status?: string | null;
}

// A campaign as Klaroh displays it: provider-neutral identity (campaigns_v2)
// plus its latest statistics snapshot (campaign_stats). Built by
// toCampaignView() in lib/campaign-view.ts from the get_client_campaigns /
// get_public_client_campaigns read models. Metric values are cumulative
// (lifetime-to-date); null = not reported by the provider.
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'error' | 'suspended' | 'unknown';

export interface CampaignView {
  id: string;
  client_id: string | null;
  /** Klaroh display name (the agency's own name, else the provider's). */
  name: string;
  /** Name at the provider. */
  provider_name: string | null;
  provider: string | null;
  status: CampaignStatus;
  is_evergreen: boolean | null;
  sender_count: number | null;
  daily_limit: number | null;
  start_date: string | null;
  end_date: string | null;
  external_created_at: string | null;
  external_updated_at: string | null;
  last_synced_at: string | null;
  /** When the latest snapshot was captured. */
  captured_at: string | null;
  leads: number | null;
  contacted: number | null;
  new_leads_contacted: number | null;
  emails_sent: number | null;
  opens: number | null;
  opens_unique: number | null;
  replies: number | null;
  replies_unique: number | null;
  clicks: number | null;
  clicks_unique: number | null;
  bounces: number | null;
  unsubscribes: number | null;
  completed: number | null;
  opportunities: number | null;
  opportunity_value: number | null;
  interested: number | null;
  meetings_booked: number | null;
  meetings_completed: number | null;
  closed: number | null;
  /** Set when the provider no longer returns this campaign (history kept, no longer updated). */
  unavailable_since: string | null;
}

// A campaign offered by the campaign picker: a provider campaign, with its
// current metrics, that can be imported for a client. Discovery is transient —
// these are never stored unless the user imports them.
export interface ProviderCampaignOption {
  external_id: string;
  name: string;
  status: CampaignStatus;
  external_created_at: string | null;
  /** Already on the client the picker was opened for. */
  linked?: boolean;
  emails_sent: number | null;
  contacted: number | null;
  opens: number | null;
  opens_unique: number | null;
  replies: number | null;
  replies_unique: number | null;
  opportunities: number | null;
  leads: number | null;
}

// A workspace integration as the browser sees it: identity and status only —
// never the credential (not even encrypted).
export interface IntegrationSummary {
  id: string;
  provider: string;
  label: string;
  connected: boolean;
  /** When the connection was last created/updated. */
  updated_at: string | null;
  /** Clients with at least one campaign from this integration. */
  client_count: number;
  /** Campaigns from this integration used by at least one client. */
  campaign_count: number;
}
