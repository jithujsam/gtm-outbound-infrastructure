import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Client } from '@/lib/types';

export type { Client };

const LIST_COLUMNS =
  'id, name, slug, status, created_at, sending_capacity, active_inboxes, domain_health_score, domain_health_status, campaign_client_map(count)';

type ClientListRow = Omit<Client, 'campaign_count'> & { campaign_client_map?: { count: number }[] | null };

/** The workspace's clients, newest first, with their campaign counts. */
export async function getWorkspaceClients(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select(LIST_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    if (error) console.warn('getWorkspaceClients error:', error.message);
    return [];
  }

  return (data as unknown as ClientListRow[]).map(({ campaign_client_map, ...client }) => ({
    ...client,
    campaign_count: campaign_client_map?.[0]?.count ?? 0,
  }));
}

/**
 * Lookup by slug for authenticated workspace pages. Workspace-scoped by the
 * clients RLS policy, so it only resolves the caller's own client.
 */
export async function getClientBySlug(slug: string): Promise<Client | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('clients')
      .select('id, slug, name, status, created_at, sending_capacity, active_inboxes, domain_health_score, domain_health_status')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !data) {
      if (error) console.warn('getClientBySlug error:', error.message);
      return null;
    }

    return data as Client;
  } catch (err) {
    console.warn('getClientBySlug failed:', err);
    return null;
  }
}

/**
 * Public read for the /c/[slug] page via a SECURITY DEFINER RPC (no public
 * RLS policy). Returns only public-safe columns for a single client.
 */
export async function getPublicClientBySlug(slug: string): Promise<Client | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc('get_public_client_by_slug', { p_slug: slug })
      .maybeSingle();

    if (error || !data) {
      if (error) console.warn('getPublicClientBySlug error:', error.message);
      return null;
    }
    return data as Client;
  } catch (err) {
    console.warn('getPublicClientBySlug failed:', err);
    return null;
  }
}
