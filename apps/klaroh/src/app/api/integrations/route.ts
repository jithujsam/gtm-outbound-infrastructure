import { NextRequest, NextResponse } from 'next/server';
import { canManageIntegrations, getSessionRole, getSessionWorkspace } from '@/lib/data/workspace';
import { upsertIntegrationKey } from '@/lib/data/integration-secrets';
import { getIntegrationSummaries } from '@/lib/data/integration-summary';
import { getProviderAdapter } from '@/lib/providers';
import { getProviderCatalogEntry, PROVIDER_CATALOG } from '@/lib/providers/catalog';
import { classifyProviderError } from '@/lib/providers/types';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/integrations — the provider catalog and the workspace's
 * integrations (status and usage only; credentials never leave the server).
 */
export async function GET() {
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [integrations, role] = await Promise.all([
    getIntegrationSummaries(session.supabase, session.workspaceId),
    getSessionRole(session),
  ]);
  return NextResponse.json({
    providers: PROVIDER_CATALOG,
    integrations,
    canManage: canManageIntegrations(role),
  });
}

/**
 * POST /api/integrations { provider, apiKey } — validates the key against the
 * provider, then stores it encrypted as the workspace's integration for that
 * provider (creating it, or replacing the key of the existing one). Returns the
 * integration's id and status — never the key.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
  const provider = typeof body.provider === 'string' ? body.provider : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

  const entry = getProviderCatalogEntry(provider);
  const adapter = getProviderAdapter(provider);
  if (!entry || !entry.available || !adapter) {
    return NextResponse.json({ error: 'This provider is not available yet.' }, { status: 400 });
  }
  if (apiKey.length < entry.minCredentialLength || apiKey.length > 500) {
    return NextResponse.json({ error: `That doesn't look like a valid ${entry.label} API key.` }, { status: 400 });
  }

  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageIntegrations(await getSessionRole(session))) {
    return NextResponse.json(
      { error: 'Only workspace owners and admins can connect integrations.' },
      { status: 403 }
    );
  }

  // Each attempt makes a live provider call: 20 key checks per user per hour.
  if (!(await checkRateLimit(`integration-key:${session.userId}`, 20, 3600))) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  // Validate BEFORE persisting, so an invalid key never replaces a working one.
  const validation = await adapter.validateCredentials(apiKey);
  if (!validation.ok) {
    const kind = classifyProviderError(validation.error);
    return NextResponse.json(
      {
        error: adapter.userSafeError(validation.error, `Your ${entry.label} API key could not be validated.`),
        kind,
      },
      { status: kind === 'auth' ? 400 : 502 }
    );
  }

  let secrets;
  try {
    secrets = createAdminClient();
  } catch (err) {
    console.error('integrations POST: admin client unavailable:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to save integration' }, { status: 500 });
  }
  const integrationId = await upsertIntegrationKey(secrets, session.workspaceId, provider, entry.label, apiKey);
  if (!integrationId) {
    return NextResponse.json({ error: 'Failed to save integration' }, { status: 500 });
  }

  return NextResponse.json({ integration: { id: integrationId, provider, label: entry.label, connected: true } });
}
