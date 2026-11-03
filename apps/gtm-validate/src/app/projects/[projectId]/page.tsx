import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lead } from "@/types";

export const dynamic = "force-dynamic";

async function getProjectWithLeads(projectId: string) {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (!project) return null;

    const { data: leads, count } = await supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(10);

    return { project, leads: (leads ?? []) as Lead[], total: count ?? 0 };
  } catch {
    return null;
  }
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<ProjectShellSkeleton />}>
      <ProjectContent params={params} />
    </Suspense>
  );
}

async function ProjectContent({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const result = await getProjectWithLeads(projectId);

  if (!result) notFound();

  const { project, leads, total } = result;
  const { ProjectLeadsClient } = await import("./project-leads-client");

  return (
    <div className="space-y-4">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="size-3.5" />
        Projects
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
        <p className="text-sm text-muted-foreground">{total} lead{total !== 1 ? "s" : ""}</p>
      </div>

      <Card>
        <CardContent className="pt-4 pb-2">
          <ProjectLeadsClient
            projectId={projectId}
            initialLeads={leads}
            initialTotal={total}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectShellSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-20" />
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-24" />
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
