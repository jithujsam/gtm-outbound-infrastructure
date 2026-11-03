import { getSessionWorkspace } from '@/lib/data/workspace';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Removes a campaign from a client (deletes the campaign ↔ client link). When
 * no other client uses the campaign, the database then deletes the campaign
 * with its statistics (see 20261008000200_delete_cleanup.sql). The provider campaign is untouched.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWorkspace();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { supabase, workspaceId } = session;

    const { campaignId, clientId } = await request.json();

    if (!campaignId || typeof campaignId !== 'string' || !clientId || typeof clientId !== 'string') {
      return NextResponse.json({ error: 'Missing campaignId or clientId' }, { status: 400 });
    }

    const { data: removed, error } = await supabase
      .from('campaign_client_map')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('client_id', clientId)
      .eq('workspace_id', workspaceId)
      .select('campaign_id');

    if (error) {
      console.error('Error removing campaign from client:', error);
      return NextResponse.json({ error: 'Failed to remove campaign' }, { status: 500 });
    }

    if (!removed || removed.length === 0) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
