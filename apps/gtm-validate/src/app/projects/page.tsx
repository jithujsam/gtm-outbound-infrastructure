"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectCard, ProjectCardSkeleton } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import type { Project } from "@/types";

export default function ProjectsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [projects, setProjects] = useState<(Awaited<ReturnType<typeof fetchProjects>>) | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const data = await fetchProjects();
    setProjects(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleProjectCreated = useCallback(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your lead validation projects.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="self-start sm:self-auto">
          <Plus className="size-4" />
          New Project
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-6">
        {loading
          ? [...Array(3)].map((_, i) => <ProjectCardSkeleton key={i} />)
          : projects?.map((project) => (
              <ProjectCard key={project.id} project={project} onUpdated={loadProjects} onDeleted={loadProjects} />
            ))}
      </div>

      {!loading && projects?.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No projects yet.</p>
          <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Create your first project
          </Button>
        </div>
      )}

      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleProjectCreated}
      />
    </>
  );
}

async function fetchProjects(): Promise<(Project & { lead_count: number })[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) return [];
  return res.json();
}
