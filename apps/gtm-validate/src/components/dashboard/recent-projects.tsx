import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Project } from "@/types";

interface RecentProjectsProps {
  projects: (Project & { lead_count: number })[] | null;
}

export function RecentProjects({ projects }: RecentProjectsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Projects</CardTitle>
      </CardHeader>
      <CardContent>
        {!projects ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No projects yet. Create your first project to get started.
          </p>
        ) : (
          <div className="divide-y">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center justify-between py-3 hover:bg-muted/50 rounded-md px-2 -mx-2 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{project.name}</p>
                  {project.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {project.description}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-4">
                  {project.lead_count} leads
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
