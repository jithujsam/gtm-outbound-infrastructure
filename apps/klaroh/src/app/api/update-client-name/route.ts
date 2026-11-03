import { getSessionWorkspace } from '@/lib/data/workspace';
import { isValidSlug } from '@/lib/slug-utils';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWorkspace();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { supabase, workspaceId } = session;

    const { clientId, name, slug: providedSlug, client_email } = await request.json();

    if (!clientId || typeof clientId !== 'string') {
      return NextResponse.json({ error: 'Invalid client ID' }, { status: 400 });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid client name' }, { status: 400 });
    }

    let slug = providedSlug;
    if (!slug) {
      slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    } else if (typeof slug !== 'string') {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }

    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }

    // Verify ownership via workspace_id (RLS enforces it as well)
    const { data: existing } = await supabase
      .from('clients')
      .select('id, slug')
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // client_email is optional. Only touch the column when the key is present in
    // the request body: a provided address is saved (trimmed), an explicit empty
    // string clears it. Omitting the key entirely leaves it unchanged.
    const updateFields: { name: string; slug: string; client_email?: string | null } = {
      name: name.trim(),
      slug,
    };
    if (client_email !== undefined) {
      updateFields.client_email =
        typeof client_email === 'string' && client_email.trim().includes('@')
          ? client_email.trim()
          : null;
    }

    const { data, error } = await supabase
      .from('clients')
      .update(updateFields)
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)
      .select()
      .maybeSingle();

    if (error?.code === '23505') {
      return NextResponse.json({ error: 'This slug is already taken. Please choose a different one.' }, { status: 409 });
    }

    if (error) {
      console.error('Error updating client:', error);
      return NextResponse.json({ error: error.message || 'Failed to update client' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
