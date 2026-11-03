import { Suspense } from "react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ICP_VERTICALS, type DashboardStats, type Project } from "@/types";

export const dynamic = "force-dynamic";

interface VerticalCount {
  vertical: string;
  count: number;
}

async function getDashboardData(): Promise<{
  stats: DashboardStats;
  projects: (Project & { lead_count: number })[];
  verticalBreakdown: VerticalCount[];
}> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const [
      { count: totalProjects },
      { count: totalLeads },
      { count: validatedLeads },
      { count: icpMatches },
      { data: recentProjects },
      { data: verticalRows },
    ] = await Promise.all([
      supabase.from("projects").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }).not("email_check", "is", null),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("vertical_match", true),
      supabase.from("projects").select("*, leads(count)").order("created_at", { ascending: false }).limit(5),
      supabase.rpc("get_dashboard_vertical_breakdown"),
    ]);

    const verticalCounts: Record<string, number> = {};
    const rpcData = verticalRows as { data?: Array<{ matched_vertical: string; count: number }> } | Array<{ matched_vertical: string; count: number }> | null;
    const rows = Array.isArray(rpcData) ? rpcData : rpcData?.data ?? [];
    for (const row of rows) {
      verticalCounts[row.matched_vertical] = Number(row.count);
    }

    const verticalBreakdown: VerticalCount[] = ICP_VERTICALS.map((v) => ({ vertical: v, count: verticalCounts[v] ?? 0 }));

    const projects = recentProjects?.map((p) => ({
      ...p,
      lead_count: (p.leads as unknown as { count: number }[])?.[0]?.count ?? 0,
    })) ?? [];

    return {
      stats: {
        totalProjects: totalProjects ?? 0,
        totalLeads: totalLeads ?? 0,
        validatedLeads: validatedLeads ?? 0,
        icpMatchRate: totalLeads && totalLeads > 0 ? Math.round(((icpMatches ?? 0) / totalLeads) * 100) : 0,
      },
      projects,
      verticalBreakdown,
    };
  } catch {
    return {
      stats: { totalProjects: 0, totalLeads: 0, validatedLeads: 0, icpMatchRate: 0 },
      projects: [],
      verticalBreakdown: [],
    };
  }
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your lead validation pipeline.
        </p>
      </div>

      <Suspense fallback={<StatsSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const { stats, projects, verticalBreakdown } = await getDashboardData();

  const { DashboardCharts } = await import("@/components/charts/dashboard-charts");
  const { RecentProjects } = await import("@/components/dashboard/recent-projects");

  return (
    <>

      <StatsCards stats={stats} />
      <DashboardCharts
        icpRate={stats.icpMatchRate}
        validatedCount={stats.validatedLeads}
        totalLeads={stats.totalLeads}
        verticalBreakdown={verticalBreakdown}
      />
      <RecentProjects projects={projects} />
    </>
  );
}

function StatsSkeleton() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-8 rounded-md" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ICP Match Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48">
            <Skeleton className="size-40 rounded-full" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Projects</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
