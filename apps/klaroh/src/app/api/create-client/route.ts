import { getSessionWorkspace, getWorkspaceProfile } from '@/lib/data/workspace';
import { sendEmail, DEFAULT_FROM_EMAIL } from '@/lib/email/send-email';
import { clientInviteEmailHtml } from '@/lib/email/templates/client-invite';
import { getPortalToken, portalPath } from '@/lib/data/portal';
import { checkRateLimit } from '@/lib/rate-limit';
import { PLAN_LIMITS, isTrialExpired } from '@/lib/plan-limits';
import { clientSlugBase, isValidSlug, withSuffix } from '@/lib/slug-utils';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWorkspace();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { supabase, user, workspaceId } = session;

    // 30 client creations per workspace per hour
    if (!(await checkRateLimit(`createclient:${workspaceId}`, 30, 3600))) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // ── Plan enforcement (server-side gate) ──────────────────────────────
    const workspace = await getWorkspaceProfile(supabase, workspaceId);

    const plan = workspace?.plan ?? 'trial';
    const createdAt = workspace?.created_at ?? new Date().toISOString();
    const trialExpired = plan === 'trial' && isTrialExpired(createdAt);
    const effectivePlan = trialExpired ? 'basic' : plan;
    const limit = PLAN_LIMITS[effectivePlan] ?? 3;

    const { count: clientCount } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    const current = clientCount ?? 0;

    if (trialExpired && current >= limit) {
      return NextResponse.json(
        { error: 'TRIAL_EXPIRED', plan: 'basic', limit },
        { status: 403 }
      );
    }

    if (current >= limit) {
      return NextResponse.json(
        { error: 'LIMIT_REACHED', plan: effectivePlan, limit, current },
        { status: 403 }
      );
    }
    // ── End plan enforcement ─────────────────────────────────────────────

    const { name, slug: providedSlug, client_email } = await request.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 200) {
      return NextResponse.json({ error: 'Invalid client name' }, { status: 400 });
    }

    // The slug (the client's public link) is generated from the name unless one
    // is explicitly supplied; a generated slug that is taken gets a suffix.
    if (providedSlug !== undefined && providedSlug !== null && providedSlug !== '' &&
        (typeof providedSlug !== 'string' || !isValidSlug(providedSlug))) {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }
    const explicitSlug = typeof providedSlug === 'string' && providedSlug ? providedSlug : null;
    const base = explicitSlug ?? (clientSlugBase(name) || 'client');

    const email =
      client_email && typeof client_email === 'string' && client_email.includes('@') ? client_email.trim() : null;

    let data: { id: string; name: string; slug: string; status: string; created_at: string } | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const slug = attempt === 0 ? base : withSuffix(base, attempt);
      const result = await supabase
        .from('clients')
        .insert({ name: name.trim(), slug, workspace_id: workspaceId, status: 'active', client_email: email })
        .select('id, name, slug, status, created_at')
        .single();

      if (result.error?.code === '23505') {
        if (explicitSlug) {
          return NextResponse.json({ error: 'This link is already taken. Please choose a different one.' }, { status: 409 });
        }
        continue;
      }
      if (result.error) {
        console.error('Error creating client:', result.error);
        return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
      }
      data = result.data;
      break;
    }
    if (!data) {
      return NextResponse.json({ error: 'Could not create a unique link for this client. Try a different name.' }, { status: 409 });
    }

    // Send client invite email if an email address was provided
    // The database gives every new client a portal with a private token; the email carries that link.
    const token = email ? await getPortalToken(supabase, data.id) : null;
    if (email && token) {
      const agencyName = workspace?.name ?? 'Your agency';

      sendEmail({
        to_email: email,
        to_name: data.name,
        from_email: DEFAULT_FROM_EMAIL,
        from_name: agencyName,
        subject: 'Your campaign dashboard is ready',
        html: clientInviteEmailHtml(data.name, agencyName, portalPath(data.slug, token)),
        email_type: 'client_invite',
        user_id: user.id,
        client_id: data.id,
      }).catch((err: unknown) => console.error('Client invite email error:', err));
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
