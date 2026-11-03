import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processJobBatch, processEmailBatch } from "@/lib/processor";

// The email processor bounds its own work (see EMAIL_TIME_BUDGET_MS); this is
// the hard ceiling for the last in-flight Clearout request.
export const maxDuration = 300;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: job } = await supabase
    .from("validation_jobs")
    .select("id, user_id, project_id, type, status, llm_provider, model, temperature, max_tokens, prompt")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { data: settings } = await supabase
    .from("integration_settings")
    .select("llm_api_key, clearout_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (job.type === "icp") {
    const llmApiKey = settings?.llm_api_key;
    if (!llmApiKey) {
      return NextResponse.json(
        { error: "LLM API key not configured" },
        { status: 400 }
      );
    }

    const prompt = job.prompt || "";
    if (!prompt.trim()) {
      return NextResponse.json(
        { error: "Job has no prompt configured" },
        { status: 400 }
      );
    }

    try {
      const result = await processJobBatch(jobId, llmApiKey, prompt);
      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Processing failed" },
        { status: 500 }
      );
    }
  }

  if (job.type === "email") {
    const clearoutApiKey = settings?.clearout_api_key;
    if (!clearoutApiKey) {
      return NextResponse.json(
        { error: "Clearout API key not configured" },
        { status: 400 }
      );
    }

    try {
      const result = await processEmailBatch(jobId, clearoutApiKey);
      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Processing failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { error: `Unknown job type: ${job.type}` },
    { status: 400 }
  );
}
