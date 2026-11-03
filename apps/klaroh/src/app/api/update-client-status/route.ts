import { getSessionWorkspace } from '@/lib/data/workspace';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWorkspace();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { supabase, workspaceId } = session;

    const { clientId, status } = await request.json();

    if (!clientId || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['active', 'paused', 'ended'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { error } = await supabase
      .from('clients')
      .update({ status })
      .eq('id', clientId)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error('Error updating client status:', error);
      return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
