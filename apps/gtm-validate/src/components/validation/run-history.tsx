"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RunDetail } from "@/components/validation/run-detail";
import { formatCost, formatDuration, formatTokens, formatDateTime, type RunStats } from "@/lib/format";
import { ChevronRight } from "lucide-react";

interface EmailRunStats {
  valid: number;
  invalid: number;
  unknown: number;
}

interface Run {
  id: string;
  type: string;
  status: string;
  model: string | null;
  llm_provider: string | null;
  created_at: string;
  total_leads: number;
  completed_leads: number;
  failed_leads: number;
  provider_reset_at?: string | null;
  projectName: string | null;
  runStats: RunStats | null;
  emailRunStats?: EmailRunStats | null;
}

export function RunHistory({ projectId, refreshKey = 0 }: { projectId?: string; refreshKey?: number }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = projectId ? `/api/jobs?project_id=${encodeURIComponent(projectId)}` : "/api/jobs";
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Failed to load runs");
      }
      setRuns(await res.json());
    } catch (err: any) {
      setError(err.message || "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!runs || runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No validation runs yet.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {runs.map((run) => (
          <button
            key={run.id}
            onClick={() => setSelectedId(run.id)}
            className="w-full text-left rounded-md border bg-card hover:bg-muted/30 transition-colors p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm font-medium truncate">
                  {run.type === "icp" ? "ICP Validation" : "Email Validation"}
                  {run.projectName ? ` — ${run.projectName}` : ""}
                </h3>
                <StatusBadge status={run.status} />
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              {formatDateTime(run.created_at)}
              {run.model ? ` · ${run.model}` : ""}
            </p>

            {run.provider_reset_at && (
              <div className="mt-2 rounded-md bg-amber-50 dark:bg-amber-950/20 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                Clearout rate limit reached. Continuing after the limit resets at {formatDateTime(run.provider_reset_at)}.
              </div>
            )}

            {run.runStats && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span><span className="font-medium text-foreground">{run.runStats.leadsRequested}</span> leads</span>
                <span><span className="font-medium text-foreground">{run.runStats.successful}</span> successful</span>
                <span><span className="font-medium text-foreground">{run.runStats.failed}</span> failed</span>
                {run.type === "email" ? (
                  <>
                    <span><span className="font-medium text-foreground">{Math.max(0, run.runStats.leadsRequested - run.runStats.leadsProcessed)}</span> waiting</span>
                    {run.emailRunStats && (
                      <>
                        <span><span className="font-medium text-foreground">{run.emailRunStats.valid}</span> valid</span>
                        <span><span className="font-medium text-foreground">{run.emailRunStats.invalid}</span> invalid</span>
                        <span><span className="font-medium text-foreground">{run.emailRunStats.unknown}</span> unknown</span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span><span className="font-medium text-foreground">{run.runStats.matched}</span> matched</span>
                    <span><span className="font-medium text-foreground">{run.runStats.noMatch}</span> no match</span>
                    <span>{formatTokens(run.runStats.totalTokens)} tokens</span>
                    <span>{formatCost(run.runStats.totalCost)}</span>
                  </>
                )}
                <span><span className="font-medium text-foreground">{run.runStats.apiRequests}</span> API requests</span>
                <span>{formatDuration(run.runStats.totalDurationMs)}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      <Dialog open={selectedId !== null} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-4xl max-h-[calc(100vh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Run Details</DialogTitle>
            <DialogDescription>Operational detail for this validation run.</DialogDescription>
          </DialogHeader>
          {selectedId && <RunDetail jobId={selectedId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
    completed: "default",
    completed_with_errors: "secondary",
    running: "secondary",
    queued: "outline",
    paused: "destructive",
    failed: "destructive",
    cancelled: "outline",
  };
  return <Badge variant={map[status] ?? "outline"} className="text-[10px]">{status}</Badge>;
}
