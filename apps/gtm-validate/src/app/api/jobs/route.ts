import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEmailRunStats } from "@/lib/jobs";
import { fetchRunStats } from "@/lib/run-stats";

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(_request.url);
  const projectId = url.searchParams.get("project_id")?.trim();

  let query = supabase
    .from("validation_jobs")
    .select("*, projects(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: jobs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = await Promise.all(
    (jobs ?? []).map(async (job: any) => {
      let emailRunStats = null;
      if (job.type === "email") {
        emailRunStats = await getEmailRunStats(supabase, job.id);
      }

      return {
        ...job,
        projectName: job.projects?.name ?? null,
        emailRunStats,
        runStats: await fetchRunStats(supabase, job.id),
      };
    })
  );

  return NextResponse.json(enriched);
}
