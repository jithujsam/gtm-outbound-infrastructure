"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Project } from "@/types";

const CARD_COLORS = [
  "border-l-violet-500",
  "border-l-indigo-500",
  "border-l-blue-500",
  "border-l-emerald-500",
  "border-l-amber-500",
  "border-l-rose-500",
];

export function ProjectCard({ project, onUpdated, onDeleted }: {
  project: Project & { lead_count: number };
  onUpdated?: () => void;
  onDeleted?: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editDesc, setEditDesc] = useState(project.description ?? "");
  const [saving, setSaving] = useState(false);

  const colorClass = CARD_COLORS[project.name.length % CARD_COLORS.length];

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Project updated");
      setEditOpen(false);
      onUpdated?.();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Project deleted");
      setDeleteOpen(false);
      onDeleted?.();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card className={`hover:shadow-sm transition-all h-full border-l-4 ${colorClass}`}>
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <Link href={`/projects/${project.id}`} className="flex-1 min-w-0">
            <CardTitle className="text-base truncate hover:text-primary transition-colors">{project.name}</CardTitle>
          </Link>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.preventDefault(); setEditOpen(true); }}>
              <Pencil className="size-3.5 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.preventDefault(); setDeleteOpen(true); }}>
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Link href={`/projects/${project.id}`}>
            {project.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{project.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {project.lead_count} lead{project.lead_count !== 1 ? "s" : ""}
            </p>
          </Link>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update the project details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Q4 D2C Campaign"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Input
                id="edit-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !editName.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{project.name}&rdquo; and all its leads. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? "Deleting..." : "Delete"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProjectCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-48 mb-2" />
        <Skeleton className="h-3 w-16" />
      </CardContent>
    </Card>
  );
}
