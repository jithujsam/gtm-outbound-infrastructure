import { createClient } from "@/lib/supabase/server";
import type { IntegrationSettings } from "@/types";

export async function getIntegrationSettings(): Promise<IntegrationSettings | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data } = await supabase
    .from("integration_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data;
}

export async function getIntegrationStatus(): Promise<{
  llm_configured: boolean;
  llm_provider: string | null;
  clearout_configured: boolean;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data } = await supabase
    .from("integration_settings")
    .select("llm_api_key, llm_provider, clearout_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    llm_configured: !!(data?.llm_api_key),
    llm_provider: data?.llm_provider ?? null,
    clearout_configured: !!(data?.clearout_api_key),
  };
}

export async function upsertIntegrationSettings(
  settings: {
    clearout_api_key?: string;
    llm_api_key?: string;
    llm_provider?: string;
    clearout_requests_per_minute?: number;
    clearout_timeout_seconds?: number;
  }
): Promise<IntegrationSettings> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("integration_settings")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("integration_settings")
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("integration_settings")
    .insert({ ...settings, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}
