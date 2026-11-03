import { NextRequest, NextResponse } from 'next/server';
import { getSessionWorkspace, getWorkspaceProfile } from '@/lib/data/workspace';

/**
 * GET /api/workspace — the signed-in user's workspace profile (name, website,
 * logo, timezone, plan). Creates the workspace on first use.
 */
export async function GET() {
  const session = await getSessionWorkspace();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await getWorkspaceProfile(session.supabase, session.workspaceId);
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }
  return NextResponse.json(workspace);
}

const MAX_NAME = 200;
const MAX_URL = 500;

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('invalid');
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error('too long');
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * PATCH /api/workspace — updates the workspace profile. Only owners/admins can
 * (RLS); plan and creation date are never writable from here (DB trigger).
 */
export async function PATCH(request: NextRequest) {
  const session = await getSessionWorkspace();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const update: Record<string, string | null> = {};
  try {
    const name = optionalText(body.name, MAX_NAME);
    const website = optionalText(body.website, MAX_URL);
    const logoUrl = optionalText(body.logo_url, MAX_URL);
    const timezone = optionalText(body.timezone, 64);
    if (name !== undefined) update.name = name;
    if (website !== undefined) update.website = website;
    if (logoUrl !== undefined) {
      if (logoUrl !== null && !logoUrl.startsWith('https://')) throw new Error('invalid logo');
      update.logo_url = logoUrl;
    }
    if (timezone !== undefined) update.timezone = timezone ?? 'UTC';
  } catch {
    return NextResponse.json({ error: 'Invalid workspace details' }, { status: 400 });
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await session.supabase
    .from('workspaces')
    .update(update)
    .eq('id', session.workspaceId)
    .select('id, name, website, logo_url, timezone, plan, created_at')
    .maybeSingle();

  if (error) {
    console.error('PATCH /api/workspace error:', error.message);
    return NextResponse.json({ error: 'Failed to save workspace' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Only workspace owners can change these settings' }, { status: 403 });
  }
  return NextResponse.json(data);
}
