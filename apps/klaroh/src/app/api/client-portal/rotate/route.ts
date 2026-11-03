import { NextRequest, NextResponse } from 'next/server';
import { getSessionWorkspace } from '@/lib/data/workspace';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Replaces a client's report link: the old link stops working immediately. */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWorkspace();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { clientId?: unknown } | null;
    if (typeof body?.clientId !== 'string' || !UUID.test(body.clientId)) return NextResponse.json({ error: 'Invalid client' }, { status: 400 });

    const { data, error } = await session.supabase.rpc('rotate_client_portal_token', { p_client_id: body.clientId });
    if (error || typeof data !== 'string') {
      if (error) console.warn('rotate_client_portal_token:', error.message);
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    return NextResponse.json({ token: data });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
