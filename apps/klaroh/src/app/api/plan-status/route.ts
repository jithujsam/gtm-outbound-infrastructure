import { NextResponse } from 'next/server';
import { getSessionWorkspace, getWorkspaceProfile } from '@/lib/data/workspace';
import {
  PLAN_LIMITS,
  isTrialExpired,
  getEffectivePlan,
  getDaysRemaining,
} from '@/lib/plan-limits';

export async function GET() {
  try {
    const session = await getSessionWorkspace();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { supabase, workspaceId } = session;

    const workspace = await getWorkspaceProfile(supabase, workspaceId);
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const { count } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id);

    const plan = workspace.plan ?? 'trial';
    const createdAt = workspace.created_at;
    const effectivePlan = getEffectivePlan(plan, createdAt);
    const limit = PLAN_LIMITS[effectivePlan] ?? 3;
    const clientCount = count ?? 0;
    const trialExpired = plan === 'trial' && isTrialExpired(createdAt);
    const daysRemaining = plan === 'trial' ? getDaysRemaining(createdAt) : 0;
    const limitReached = clientCount >= limit;

    return NextResponse.json({
      plan,
      effectivePlan,
      limit,
      clientCount,
      trialExpired,
      daysRemaining,
      limitReached,
    });
  } catch (err) {
    console.error('GET /api/plan-status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
