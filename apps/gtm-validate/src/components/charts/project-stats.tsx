"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectStatsData {
  leads: {
    total: number;
    icpValidated: number;
    icpNotValidated: number;
    icpMatch: number;
    emailValidated: number;
    safeToSend: number;
  };
}

export function ProjectStats({ projectId, refreshKey }: { projectId: string; refreshKey: number }) {
  const [stats, setStats] = useState<ProjectStatsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/projects/${projectId}/stats`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load stats");
        return r.json();
      })
      .then((d) => { if (!cancelled) setStats(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!stats) {
    return (
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-6 w-8" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const { leads } = stats;

  const items = [
    ["Total leads", String(leads.total)],
    ["ICP validated", String(leads.icpValidated)],
    ["ICP not validated", String(leads.icpNotValidated)],
    ["ICP matched", String(leads.icpMatch)],
    ["Email validated", String(leads.emailValidated)],
    ["Safe to send", String(leads.safeToSend)],
  ];

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-sm font-semibold tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}
