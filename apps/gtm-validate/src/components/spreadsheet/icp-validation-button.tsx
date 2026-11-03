"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Brain, CheckCircle2, XCircle, Loader2, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getIcpPrompt, saveIcpPrompt } from "@/app/settings/actions";
import { toast } from "sonner";
import { formatCost, formatTokens, formatDuration, type RunStats } from "@/lib/format";

const ICP_MODEL = "gpt-4.1-mini-2025-04-14";
const ICP_MODEL_LABEL = "GPT-4.1 mini";

export interface IcpValidationDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  totalCount: number;
  onValidationComplete: (completedIds: string[], runStats: RunStats | null) => void;
  onBatchComplete?: (completedIds: string[]) => void;
  fetchAllIds: () => Promise<string[]>;
}

interface ActivityItem {
  leadId: string;
  company: string;
  status: "success" | "failed";
  matchedVertical: string | null;
  error?: string;
}

interface ProgressState {
  completed: number;
  failed: number;
  pending: number;
  total: number;
  matched: number;
  noMatch: number;
}

export function IcpValidationDialog({
  projectId,
  open,
  onOpenChange,
  selectedIds,
  totalCount,
  onValidationComplete,
  onBatchComplete,
  fetchAllIds,
}: IcpValidationDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState(ICP_MODEL);
  const [temperature, setTemperature] = useState("0.2");
  const [maxTokens, setMaxTokens] = useState("512");
  const seenLeadIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setProgress(null);
    setActivity([]);
    setRunStats(null);
    seenLeadIds.current = new Set();

    getIcpPrompt(projectId).then((promptResult) => {
      if (cancelled) return;
      if (promptResult.prompt) setPrompt(promptResult.prompt);
      // OpenAI-only product. Always default to OpenAI, ignoring any legacy
      // provider value that may still exist in the database.
      setProvider("openai");
      setModel(ICP_MODEL);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, projectId]);


  const fetchJobDetail = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/jobs/${jobId}/detail`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  const refreshActivityFromDetail = useCallback(async (jobId: string): Promise<string[]> => {
    const detail = await fetchJobDetail(jobId);
    if (!detail) return [];

    if (detail.runStats) {
      setRunStats(detail.runStats);
      setProgress({
        completed: detail.runStats.successful,
        failed: detail.runStats.failed,
        pending: Math.max(0, detail.runStats.leadsRequested - detail.runStats.leadsProcessed),
        total: detail.runStats.leadsRequested,
        matched: detail.runStats.matched,
        noMatch: detail.runStats.noMatch,
      });
    }

    const newActivity: ActivityItem[] = [];
    const newlyCompleted: string[] = [];
    for (const item of detail.items ?? []) {
      if (item.status !== "completed" && item.status !== "failed") continue;
      if (seenLeadIds.current.has(item.lead_id)) continue;
      seenLeadIds.current.add(item.lead_id);

      const lead = item.lead;
      if (item.status === "completed") newlyCompleted.push(item.lead_id);

      newActivity.push({
        leadId: item.lead_id,
        company: lead?.company_name ?? "Unknown lead",
        status: item.status === "completed" ? "success" : "failed",
        matchedVertical: item.status === "completed" ? lead?.matched_vertical ?? null : null,
        error: item.error_message ?? undefined,
      });
    }

    if (newActivity.length > 0) {
      setActivity((prev) => [...newActivity.reverse(), ...prev]);
    }

    return newlyCompleted;
  }, [fetchJobDetail]);

  const runValidation = async (all: boolean) => {
    let ids: string[];
    if (all) {
      ids = await fetchAllIds();
    } else {
      ids = selectedIds;
    }
    if (ids.length === 0) return;

    setValidating(true);
    setProgress({ completed: 0, failed: 0, pending: ids.length, total: ids.length, matched: 0, noMatch: 0 });
    setActivity([]);
    setRunStats(null);
    seenLeadIds.current = new Set();

    try {
      // Persist the edited criteria so the next run starts from them.
      // (Nothing saved the prompt before, so edits were lost on reopen.)
      const saved = await saveIcpPrompt(projectId, prompt);
      if (!saved.success) toast.error(`Prompt not saved: ${saved.error ?? "unknown error"}`);

      const parsedTemperature = parseFloat(temperature);
      const parsedMaxTokens = parseInt(maxTokens, 10);
      const body: any = {
        type: "icp",
        mode: all ? "continuous" : "selected",
        prompt,
        provider,
        model,
        temperature: Number.isFinite(parsedTemperature) ? parsedTemperature : 0.2,
        maxTokens: Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0 ? parsedMaxTokens : 512,
      };
      if (!all) body.leadIds = ids;

      const jobRes = await fetch(`/api/projects/${projectId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!jobRes.ok) {
        const text = await jobRes.text();
        let msg = text;
        try { msg = JSON.parse(text).error || text; } catch {}
        throw new Error(msg);
      }

      const jobJson = await jobRes.json();
      const currentJobId = jobJson.jobId;
      setProgress((p) => p ? { ...p, total: jobJson.totalLeads, pending: jobJson.totalLeads } : null);

      while (true) {
        const statusRes = await fetch(`/api/jobs/${currentJobId}`);
        if (statusRes.ok) {
          const status = await statusRes.json();
          if (status.progress) {
            setProgress((p) => p ? {
              ...p,
              completed: status.progress.completed,
              failed: status.progress.failed,
              pending: status.progress.pending,
              total: status.progress.total,
            } : p);
          }
          if (status.runStats) setRunStats(status.runStats);

          if (
            status.progress.pending === 0 ||
            ["completed", "completed_with_errors", "failed", "cancelled", "paused"].includes(status.status)
          ) {
            break;
          }
        }

        const processRes = await fetch(`/api/jobs/${currentJobId}/process`, { method: "POST" });
        if (!processRes.ok) {
          const text = await processRes.text();
          let msg = text;
          try { msg = JSON.parse(text).error || text; } catch {}
          throw new Error(msg);
        }

        const result = await processRes.json();

        // Refresh per-lead activity from actual job data (not fake progress).
        const newlyCompleted = await refreshActivityFromDetail(currentJobId);
        if (newlyCompleted.length > 0) {
          onBatchComplete?.(newlyCompleted);
        }

        if (result.paused) {
          toast.error(`Job paused: ${result.pausedReason || "Unknown error"}`);
          break;
        }

        if (result.complete) break;

        await new Promise((r) => setTimeout(r, 500));
      }

      // Final refresh for definitive numbers and activity.
      const finalNewlyCompleted = await refreshActivityFromDetail(currentJobId);
      if (finalNewlyCompleted.length > 0) {
        onBatchComplete?.(finalNewlyCompleted);
      }
      const finalDetail = await fetchJobDetail(currentJobId);
      const finalStats: RunStats | null = finalDetail?.runStats ?? null;
      setRunStats(finalStats);

      const completedIds = (finalDetail?.items ?? [])
        .filter((i: any) => i.status === "completed")
        .map((i: any) => i.lead_id);

      onValidationComplete(completedIds, finalStats);
    } catch (err: any) {
      toast.error(`ICP validation failed: ${err.message}`);
    } finally {
      setValidating(false);
    }
  };

  const processedCount = progress ? progress.completed + progress.failed : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>ICP Validation</DialogTitle>
          <DialogDescription>
            {selectedIds.length > 0
              ? `${selectedIds.length} lead${selectedIds.length !== 1 ? "s" : ""} selected`
              : `${totalCount} leads in project`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              Loading prompt...
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Provider</label>
                  <div className="flex h-8 items-center gap-1.5 rounded-md border bg-muted/40 px-3 text-xs">
                    <Lock className="size-3 text-muted-foreground" />
                    OpenAI
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Model</label>
                  <div className="flex h-8 items-center gap-1.5 rounded-md border bg-muted/40 px-3 text-xs">
                    <Lock className="size-3 text-muted-foreground" />
                    {ICP_MODEL_LABEL}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Temp</label>
                  <Input
                    className="h-8 text-xs w-[60px]"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    disabled={validating}
                    placeholder="0.2"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Max Tokens</label>
                  <Input
                    className="h-8 text-xs w-[90px]"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(e.target.value)}
                    disabled={validating}
                    placeholder="512"
                  />
                </div>
              </div>

              <div className="space-y-2 relative">
                <label className="text-sm font-medium">Prompt</label>
                <textarea
                  className="w-full min-h-[140px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y font-mono"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={validating}
                />
                <p className="text-[11px] text-muted-foreground">
                  These criteria are sent once per batch, followed by each lead&apos;s company data.
                </p>
              </div>
            </>
          )}

          {validating && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Validating {processedCount} of {progress?.total ?? 0} leads
                </span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-emerald-500" />
                    {progress?.completed ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="size-3 text-red-500" />
                    {progress?.failed ?? 0}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    {progress?.pending ?? 0}
                  </span>
                </span>
              </div>

              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{
                    width: `${progress?.total ? (processedCount / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>

              {activity.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto rounded-md border bg-muted/20 p-2">
                  {activity.map((item) => (
                    <div key={item.leadId} className="flex items-center gap-2 text-xs">
                      {item.status === "success" ? (
                        <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="size-3.5 text-red-500 shrink-0" />
                      )}
                      <span className="font-medium truncate">{item.company}</span>
                      {item.status === "success" ? (
                        item.matchedVertical ? (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">{item.matchedVertical}</Badge>
                        ) : (
                          <span className="text-muted-foreground">No match</span>
                        )
                      ) : (
                        <span className="text-red-600 dark:text-red-400 truncate">
                          Failed{item.error ? ` — ${item.error}` : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {runStats && !validating && (
            <RunSummary stats={runStats} model={model} />
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={validating}
            >
              {runStats && !validating ? "Close" : "Cancel"}
            </Button>
            {!runStats && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={totalCount === 0 || validating || loading}
                  onClick={() => runValidation(true)}
                >
                  Validate All ({totalCount})
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={selectedIds.length === 0 || validating || loading}
                  onClick={() => runValidation(false)}
                >
                  {validating ? (
                    <>
                      <Brain className="size-3.5 animate-pulse" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <Brain className="size-3.5" />
                      Validate Selected ({selectedIds.length})
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RunSummary({ stats, model }: { stats: RunStats; model: string }) {
  const rows = [
    ["Leads requested", String(stats.leadsRequested)],
    ["Leads processed", String(stats.leadsProcessed)],
    ["Successful", String(stats.successful)],
    ["Failed", String(stats.failed)],
    ["ICP matched", String(stats.matched)],
    ["ICP not matched", String(stats.noMatch)],
    ["API requests", String(stats.apiRequests)],
    ["Input tokens", formatTokens(stats.inputTokens)],
    ["Cached input tokens", formatTokens(stats.cachedInputTokens)],
    ["Output tokens", formatTokens(stats.outputTokens)],
    ["Total tokens", formatTokens(stats.totalTokens)],
    ["Total cost", formatCost(stats.totalCost)],
    ["Duration", formatDuration(stats.totalDurationMs)],
    ["Model", model],
  ];

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <ChevronRight className="size-4 text-muted-foreground" />
        Run summary
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-xs border-b border-border/50 py-0.5">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
