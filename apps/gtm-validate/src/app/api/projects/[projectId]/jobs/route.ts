import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createValidationJob } from "@/lib/jobs";
import { getMaxJobSize } from "@/lib/processor";
import { OPENAI_MODELS } from "@/lib/validation/openai";
import { fetchRunStats } from "@/lib/run-stats";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: jobs, error } = await supabase
    .from("validation_jobs")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Attach run-level aggregates. Small job counts make per-job RPC calls
  // acceptable and keeps the run aggregation in one place.
  const jobsList = (jobs ?? []) as any[];
  const enriched = await Promise.all(
    jobsList.map(async (job: any) => ({
      ...job,
      runStats: await fetchRunStats(supabase, job.id),
    }))
  );

  return NextResponse.json(enriched);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    type: "icp" | "email";
    mode: "selected" | "continuous";
    leadIds?: string[];
    prompt?: string;
    model?: string;
    provider?: string;
    temperature?: number;
    maxTokens?: number;
  };

  try {
    body = await _request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!["icp", "email"].includes(body.type) || !["selected", "continuous"].includes(body.mode)) {
    return NextResponse.json(
      { error: "type must be icp or email, and mode must be selected or continuous" },
      { status: 400 }
    );
  }

  if (body.type === "icp") {
    if (body.provider && body.provider !== "openai") {
      return NextResponse.json({ error: "OpenAI is the only supported provider" }, { status: 400 });
    }
    if (body.model && !(OPENAI_MODELS as readonly string[]).includes(body.model)) {
      return NextResponse.json({ error: `Unsupported model: ${body.model}` }, { status: 400 });
    }
  }

  let leadIds: string[];

  if (body.mode === "continuous") {
    if (body.type === "icp") {
      const { data } = await supabase
        .from("leads")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .is("vertical_match", null);

      leadIds = ((data as any[]) ?? []).map((l: any) => l.id);
    } else {
      const { data } = await supabase
        .from("leads")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .is("email_check", null);

      leadIds = ((data as any[]) ?? []).map((l: any) => l.id);
    }

    if (leadIds.length === 0) {
      return NextResponse.json(
        { error: "No unvalidated leads found" },
        { status: 400 }
      );
    }
  } else {
    if (!Array.isArray(body.leadIds) || body.leadIds.length === 0) {
      return NextResponse.json(
        { error: "leadIds required for selected mode" },
        { status: 400 }
      );
    }
    leadIds = body.leadIds;
  }

  const maxSize = getMaxJobSize();
  if (leadIds.length > maxSize) {
    return NextResponse.json(
      { error: `Cannot process more than ${maxSize} leads per job. Selected: ${leadIds.length}` },
      { status: 400 }
    );
  }

  try {
    const result = await createValidationJob({
      userId: user.id,
      projectId,
      type: body.type,
      mode: body.mode,
      leadIds,
      prompt: body.prompt,
      model: body.model,
      llmProvider: body.type === "icp" ? "openai" : undefined,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
