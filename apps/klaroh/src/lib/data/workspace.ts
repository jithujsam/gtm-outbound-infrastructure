// Workspace identity: auth user → workspace membership → workspace.
//
// SECURITY: never 'use server' — these helpers take a Supabase client and are
// called by route handlers and server components after authentication. The
// workspace is always derived from the authenticated session, never from a
// caller-supplied id.

import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export interface WorkspaceProfile {
  id: string;
  name: string | null;
  website: string | null;
  logo_url: string | null;
  timezone: string;
  plan: string;
  created_at: string;
}

export interface SessionWorkspace {
  supabase: SupabaseClient;
  user: User;
  userId: string;
  workspaceId: string;
}

const PROFILE_COLUMNS = 'id, name, website, logo_url, timezone, plan, created_at';

function metadataString(user: User, key: string): string | null {
  const value = (user.user_metadata as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Returns the user's workspace id, creating the workspace (with the user as
 * owner) on first use. The agency name/website typed at signup travel in the
 * auth user metadata, so a workspace created after email confirmation still
 * gets them.
 */
export async function ensureWorkspaceId(supabase: SupabaseClient, user: User): Promise<string | null> {
  const { data, error } = await supabase.rpc('ensure_workspace', {
    p_name: metadataString(user, 'agency_name'),
    p_website: metadataString(user, 'agency_website'),
  });
  if (error || typeof data !== 'string') {
    if (error) console.warn('ensure_workspace error:', error.message);
    return null;
  }
  return data;
}

/**
 * Resolves the workspace of the CURRENTLY AUTHENTICATED session (validated with
 * `getUser()`), or null when signed out.
 */
export async function getSessionWorkspace(): Promise<SessionWorkspace | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaceId = await ensureWorkspaceId(supabase, user);
  if (!workspaceId) return null;

  return { supabase, user, userId: user.id, workspaceId };
}

export async function getWorkspaceProfile(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<WorkspaceProfile | null> {
  const { data, error } = await supabase
    .from('workspaces')
    .select(PROFILE_COLUMNS)
    .eq('id', workspaceId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('getWorkspaceProfile error:', error.message);
    return null;
  }
  return data as WorkspaceProfile;
}

export type WorkspaceRole = 'owner' | 'admin' | 'member';

/** The signed-in user's role in the session workspace (null if not a member). */
export async function getSessionRole(session: SessionWorkspace): Promise<WorkspaceRole | null> {
  const { data, error } = await session.supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', session.workspaceId)
    .eq('user_id', session.userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.role as WorkspaceRole;
}

/** Owners and admins manage the workspace's provider credentials. */
export const canManageIntegrations = (role: WorkspaceRole | null): boolean => role === 'owner' || role === 'admin';
