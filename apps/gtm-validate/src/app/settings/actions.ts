"use server";

import { revalidatePath } from "next/cache";
import { upsertIntegrationSettings, getIntegrationStatus } from "@/lib/integration-settings";
import { getValidationPrompt, saveValidationPrompt, getDefaultIcpPrompt } from "@/lib/validation-prompts";
import { createClient } from "@/lib/supabase/server";
import {
  sanitizeClearoutRateSettings,
  hasClearoutRateSettingsErrors,
  DEFAULT_CLEAROUT_RPM,
  DEFAULT_CLEAROUT_TIMEOUT_SECONDS,
  type ClearoutRateSettings,
  type ClearoutRateSettingsError,
} from "@/lib/clearout-rate";

export async function saveSettings(formData: FormData) {
  const settings = {
    clearout_api_key: (formData.get("clearout_api_key") as string) || undefined,
    llm_api_key: (formData.get("llm_api_key") as string) || undefined,
    llm_provider: (formData.get("llm_provider") as string) || undefined,
  };

  try {
    await upsertIntegrationSettings(settings);
    revalidatePath("/integrations");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save settings" };
  }
}

export async function loadSettings() {
  try {
    const status = await getIntegrationStatus();
    return { settings: status, error: null };
  } catch (e) {
    return { settings: null, error: e instanceof Error ? e.message : "Failed to load settings" };
  }
}

export async function loadClearoutRateSettings(): Promise<{
  settings: ClearoutRateSettings;
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { settings: { requestsPerMinute: DEFAULT_CLEAROUT_RPM, timeoutSeconds: DEFAULT_CLEAROUT_TIMEOUT_SECONDS }, error: "Not authenticated" };

    const { data } = await supabase
      .from("integration_settings")
      .select("clearout_requests_per_minute, clearout_timeout_seconds")
      .eq("user_id", user.id)
      .maybeSingle();

    return {
      settings: {
        requestsPerMinute: data?.clearout_requests_per_minute ?? DEFAULT_CLEAROUT_RPM,
        timeoutSeconds: data?.clearout_timeout_seconds ?? DEFAULT_CLEAROUT_TIMEOUT_SECONDS,
      },
      error: null,
    };
  } catch (e) {
    return {
      settings: { requestsPerMinute: DEFAULT_CLEAROUT_RPM, timeoutSeconds: DEFAULT_CLEAROUT_TIMEOUT_SECONDS },
      error: e instanceof Error ? e.message : "Failed to load Clearout settings",
    };
  }
}

export async function saveClearoutRateSettings(input: {
  requestsPerMinute?: unknown;
  timeoutSeconds?: unknown;
}): Promise<{
  settings: ClearoutRateSettings;
  errors: ClearoutRateSettingsError;
  error: string | null;
}> {
  const { settings, errors } = sanitizeClearoutRateSettings(input);
  if (hasClearoutRateSettingsErrors(errors)) {
    return { settings, errors, error: null };
  }

  try {
    await upsertIntegrationSettings({
      clearout_requests_per_minute: settings.requestsPerMinute,
      clearout_timeout_seconds: settings.timeoutSeconds,
    });
    return { settings, errors: {}, error: null };
  } catch (e) {
    return {
      settings,
      errors: {},
      error: e instanceof Error ? e.message : "Failed to save Clearout settings",
    };
  }
}

export async function getIcpPrompt(projectId: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { prompt: null, error: "Not authenticated" };

    const saved = await getValidationPrompt(user.id, projectId, "icp");
    return { prompt: saved ?? getDefaultIcpPrompt(), error: null };
  } catch (e) {
    return { prompt: getDefaultIcpPrompt(), error: null };
  }
}

export async function saveIcpPrompt(projectId: string, prompt: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    await saveValidationPrompt(user.id, projectId, "icp", prompt);
    return { success: true, error: null };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to save prompt" };
  }
}
