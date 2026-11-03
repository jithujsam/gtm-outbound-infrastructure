import { NextRequest, NextResponse } from 'next/server';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { parseEconomics, parsePortalSettings } from '@/lib/analytics/portal';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Saves what a client sees in their portal and the commercial figures of the
 * client's campaigns. Workspace members only (RLS + the explicit workspace
 * check below); campaigns must be the client's own.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionWorkspace();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { supabase, workspaceId } = session;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const clientId = body?.clientId;
    if (typeof clientId !== 'string' || !UUID.test(clientId)) return NextResponse.json({ error: 'Invalid client' }, { status: 400 });
    const settings = parsePortalSettings(body?.settings);
    if (!settings.ok) return NextResponse.json({ error: settings.error }, { status: 400 });
    const economics = parseEconomics(body?.economics);
    if (!economics.ok) return NextResponse.json({ error: economics.error }, { status: 400 });

    const [{ data: client }, { data: links }] = await Promise.all([
      supabase.from('clients').select('id').eq('id', clientId).eq('workspace_id', workspaceId).maybeSingle(),
      supabase.from('campaign_client_map').select('campaign_id').eq('client_id', clientId),
    ]);
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    const own = new Set((links ?? []).map((l) => l.campaign_id as string));
    const s = settings.value;
    if (s.campaignIds?.some((id) => !own.has(id)) || economics.value.some((e) => !own.has(e.campaignId))) {
      return NextResponse.json({ error: 'A campaign does not belong to this client' }, { status: 400 });
    }

    const { data: saved, error } = await supabase
      .from('client_portals')
      .update({
        mode: s.mode,
        metrics: s.metrics,
        campaign_ids: s.campaignIds,
        show_infrastructure: s.showInfrastructure,
        show_economics: s.showEconomics,
        show_conversations: s.showConversations,
      })
      .eq('client_id', clientId)
      .select('client_id')
      .maybeSingle();
    if (error || !saved) {
      if (error) console.error('client portal update failed:', error.message);
      return NextResponse.json({ error: 'Could not save the portal settings' }, { status: 500 });
    }

    // Economics: a campaign with neither a cost nor a value has no economics (row removed).
    const clear = economics.value.filter((e) => e.cost === null && e.valuePerPositive === null).map((e) => e.campaignId);
    const upsert = economics.value
      .filter((e) => e.cost !== null || e.valuePerPositive !== null)
      .map((e) => ({ campaign_id: e.campaignId, client_id: clientId, currency: e.currency, cost: e.cost, value_per_positive: e.valuePerPositive }));
    if (clear.length) {
      const { error: delError } = await supabase.from('campaign_economics').delete().eq('client_id', clientId).in('campaign_id', clear);
      if (delError) console.error('campaign economics delete failed:', delError.message);
    }
    if (upsert.length) {
      const { error: upError } = await supabase.from('campaign_economics').upsert(upsert, { onConflict: 'campaign_id,client_id' });
      if (upError) {
        console.error('campaign economics upsert failed:', upError.message);
        return NextResponse.json({ error: 'Could not save the campaign economics' }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
