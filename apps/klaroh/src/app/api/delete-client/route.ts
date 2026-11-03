import { getSessionWorkspace } from '@/lib/data/workspace';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWorkspace();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { supabase, workspaceId } = session;

    const { clientId } = await request.json();

    if (!clientId || typeof clientId !== 'string') {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
    }

    // Deletes the client; the database cascades its campaign links, portal and economics
    // and deletes every campaign no other client uses (with its statistics).
    const { data: deleted, error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)
      .select('id');

    if (error) {
      console.error('Error deleting client:', error);
      return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
    }
    // Nothing deleted (unknown id, another workspace, or blocked): never report success.
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
