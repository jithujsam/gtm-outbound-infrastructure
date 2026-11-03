// V2 campaign reads (campaigns_v2 + latest campaign_stats). Client-safe: takes
// whichever Supabase client the caller has — the server client in pages, the
// browser client in components. RLS decides what is visible. (The public portal
// reads through get_client_portal(token) — see src/lib/data/portal.ts.)

import type { SupabaseClient } from '@supabase/supabase-js';
import { toCampaignView } from '../campaign-view.ts';
import type { CampaignView } from '../types.ts';

/** The workspace's campaigns attached to `clientId` (all clients when null). */
export async function getClientCampaigns(
  supabase: SupabaseClient,
  clientId: string | null
): Promise<CampaignView[]> {
  const { data, error } = await supabase.rpc('get_client_campaigns', { p_client_id: clientId });
  if (error || !data) {
    if (error) console.warn('getClientCampaigns error:', error.message);
    return [];
  }
  const views = (data as Record<string, unknown>[]).map(toCampaignView);
  return withAvailability(supabase, views);
}

/** Adds campaigns_v2.unavailable_since (not part of the get_client_campaigns read model). */
async function withAvailability(supabase: SupabaseClient, views: CampaignView[]): Promise<CampaignView[]> {
  if (views.length === 0) return views;
  const { data, error } = await supabase
    .from('campaigns_v2')
    .select('id, unavailable_since')
    .in('id', [...new Set(views.map((v) => v.id))])
    .not('unavailable_since', 'is', null);
  if (error || !data?.length) return views;
  const since = new Map(data.map((r) => [r.id as string, r.unavailable_since as string]));
  return views.map((v) => (since.has(v.id) ? { ...v, unavailable_since: since.get(v.id)! } : v));
}
