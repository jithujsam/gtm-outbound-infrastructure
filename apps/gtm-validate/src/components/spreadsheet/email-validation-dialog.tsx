"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2, MailCheck, ShieldCheck, Timer, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDuration, formatDateTime, type RunStats } from "@/lib/format";
import { loadClearoutRateSettings, saveClearoutRateSettings } from "@/app/settings/actions";
import { spacingSeconds } from "@/lib/clearout-rate";

export interface EmailValidationDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  totalCount: number;
  onValidationComplete: (completedIds: string[], runStats: RunStats | null) => void;
  onBatchComplete?: (completedIds: string[]) => void;
}

interface EmailActivityItem {
  leadId: string;
  company: string;
  status: "success" | "failed";
  emailCheck: "Valid" | "Invalid" | "Unknown" | null;
  safeToSend: boolean | null;
  error?: string;
}

interface EmailProgressState {
  completed: number;
  failed: number;
  pending: number;
  total: number;
}

interface EmailStats {
  valid: number;
  invalid: number;
  unknown: number;
}

export function EmailValidationDialog({
  projectId,
  open,
  onOpenChange,
  selectedIds,
  totalCount,
  onValidationComplete,
  onBatchComplete,
}: EmailValidationDialogProps) {
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState<EmailProgressState | null>(null);
  const [activity, setActivity] = useState<EmailActivityItem[]>([]);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [emailStats, setEmailStats] = useState<EmailStats>({ valid: 0, invalid: 0, unknown: 0 });
  const [rateLimited, setRateLimited] = useState<{ resetAt: string } | null>(null);
  const [requestsPerMinute, setRequestsPerMinute] = useState(3);
  const [timeoutSeconds, setTimeoutSeconds] = useState(45);
  const [rpmInput, setRpmInput] = useState("3");
  const [timeoutInput, setTimeoutInput] = useState("45");
  const [rpmError, setRpmError] = useState<string | null>(null);
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [nextRequestAt, setNextRequestAt] = useState<string | null>(null);
  const [nextInSeconds, setNextInSeconds] = useState<number | null>(null);
  const seenLeadIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    loadClearoutRateSettings().then((res) => {
      if (res.error) {
        toast.error("Failed to load Clearout settings");
      } else {
        setRequestsPerMinute(res.settings.requestsPerMinute);
        setTimeoutSeconds(res.settings.timeoutSeconds);
        setRpmInput(String(res.settings.requestsPerMinute));
        setTimeoutInput(String(res.settings.timeoutSeconds));
      }
    });
  }, [open]);

  useEffect(() => {
    if (!validating || !nextRequestAt) {
      setNextInSeconds(null);
      return;
    }
    const tick = () => {
      const diff = Math.ceil((new Date(nextRequestAt).getTime() - Date.now()) / 1000);
      setNextInSeconds(Math.max(0, diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [validating, nextRequestAt]);

  const commitSettings = useCallback(async (): Promise<boolean> => {
    setRpmError(null);
    setTimeoutError(null);

    const result = await saveClearoutRateSettings({
      requestsPerMinute: rpmInput,
      timeoutSeconds: timeoutInput,
    });

    if (result.error) {
      toast.error(result.error);
      return false;
    }

    setRequestsPerMinute(result.settings.requestsPerMinute);
    setTimeoutSeconds(result.settings.timeoutSeconds);
    setRpmInput(String(result.settings.requestsPerMinute));
    setTimeoutInput(String(result.settings.timeoutSeconds));

    if (result.errors.requestsPerMinute) setRpmError(result.errors.requestsPerMinute);
    if (result.errors.timeoutSeconds) setTimeoutError(result.errors.timeoutSeconds);

    if (result.errors.requestsPerMinute || result.errors.timeoutSeconds) {
      toast.error("Check the Clearout settings values.");
      return false;
    }

    return true;
  }, [rpmInput, timeoutInput]);

  const fetchJobDetail = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/jobs/${jobId}/detail`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  const applyEmailStats = useCallback((items: any[]) => {
    const completed = items.filter((i: any) => i.status === "completed");
    setEmailStats({
      valid: completed.filter((i: any) => i.lead?.email_check === "Valid").length,
      invalid: completed.filter((i: any) => i.lead?.email_check === "Invalid").length,
      unknown: completed.filter((i: any) => i.lead?.email_check === "Unknown").length,
    });
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
      });
    }

    if (detail.job?.provider_reset_at) {
      setRateLimited({ resetAt: detail.job.provider_reset_at });
    } else {
      setRateLimited(null);
    }

    const items = detail.items ?? [];
    applyEmailStats(items);

    const newActivity: EmailActivityItem[] = [];
    const newlyCompleted: string[] = [];

    for (const item of items) {
      if (item.status !== "completed" && item.status !== "failed") continue;
      if (seenLeadIds.current.has(item.lead_id)) continue;
      seenLeadIds.current.add(item.lead_id);

      const lead = item.lead;
      if (item.status === "completed") newlyCompleted.push(item.lead_id);

      newActivity.push({
        leadId: item.lead_id,
        company: lead?.company_name ?? "Unknown lead",
        status: item.status === "completed" ? "success" : "failed",
        emailCheck: item.status === "completed" ? (lead?.email_check ?? null) : null,
        safeToSend: item.status === "completed" ? (lead?.safe_to_send ?? null) : null,
        error: item.error_message ?? undefined,
      });
    }

    if (newActivity.length > 0) {
      setActivity((prev) => [...newActivity.reverse(), ...prev]);
    }

    return newlyCompleted;
  }, [fetchJobDetail, applyEmailStats]);

  const runValidation = async (all: boolean) => {
    if (!all && selectedIds.length === 0) return;

    setSavingSettings(true);
    const ok = await commitSettings();
    setSavingSettings(false);
    if (!ok) return;

    setValidating(true);
    setProgress({
      completed: 0,
      failed: 0,
      pending: all ? totalCount : selectedIds.length,
      total: all ? totalCount : selectedIds.length,
    });
    setActivity([]);
    setRunStats(null);
    setEmailStats({ valid: 0, invalid: 0, unknown: 0 });
    setRateLimited(null);
    seenLeadIds.current = new Set();

    try {
      const body: any = { type: "email", mode: all ? "continuous" : "selected" };
      if (!all) body.leadIds = selectedIds;

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
          if (typeof status.nextRequestAt === "string") {
            setNextRequestAt(status.nextRequestAt);
          }

          const job = status as any;
          if (job.provider_reset_at) {
            const resetAt = new Date(job.provider_reset_at);
            if (resetAt.getTime() > Date.now()) {
              setRateLimited({ resetAt: job.provider_reset_at });
              const waitMs = Math.min(resetAt.getTime() - Date.now(), 60_000);
              await new Promise((r) => setTimeout(r, waitMs));
              continue;
            }
            setRateLimited(null);
          }

          if (
            status.progress?.pending === 0 ||
            ["completed", "completed_with_errors", "failed", "cancelled"].includes(status.status) ||
            (status.status === "paused" && !status.provider_reset_at)
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

        const newlyCompleted = await refreshActivityFromDetail(currentJobId);
        if (newlyCompleted.length > 0) {
          onBatchComplete?.(newlyCompleted);
        }

        if (result.providerRateLimited) {
          const resetAt = result.resetAt ? new Date(result.resetAt) : null;
          setRateLimited(resetAt ? { resetAt: result.resetAt } : null);
          toast.error("Clearout rate limit reached. Validation is paused.");
          break;
        }

        if (result.paused) {
          toast.error(`Job paused: ${result.pausedReason || "Unknown error"}`);
          break;
        }

        if (result.complete) break;

        await new Promise((r) => setTimeout(r, 500));
      }

      const finalNewlyCompleted = await refreshActivityFromDetail(currentJobId);
      if (finalNewlyCompleted.length > 0) {
        onBatchComplete?.(finalNewlyCompleted);
      }

      const finalDetail = await fetchJobDetail(currentJobId);
      const finalStats: RunStats | null = finalDetail?.runStats ?? null;
      setRunStats(finalStats);
      if (finalDetail?.items) applyEmailStats(finalDetail.items);
      if (finalDetail?.job?.provider_reset_at) {
        setRateLimited({ resetAt: finalDetail.job.provider_reset_at });
      }

      const completedIds = (finalDetail?.items ?? [])
        .filter((i: any) => i.status === "completed")
        .map((i: any) => i.lead_id);

      onValidationComplete(completedIds, finalStats);
    } catch (err: any) {
      toast.error(`Email validation failed: ${err.message}`);
    } finally {
      setValidating(false);
    }
  };

  const processedCount = progress ? progress.completed + progress.failed : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Email Validation</DialogTitle>
          <DialogDescription>
            {selectedIds.length > 0
              ? `${selectedIds.length} lead${selectedIds.length !== 1 ? "s" : ""} selected`
              : `${totalCount} leads in project`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-1">
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

              {validating && nextInSeconds !== null && progress && progress.pending > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Timer className="size-3.5" />
                  {nextInSeconds > 0
                    ? `Next Clearout request in ${nextInSeconds} second${nextInSeconds === 1 ? "" : "s"}`
                    : "Waiting for next Clearout request slot"}
                </div>
              )}

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
                        <>
                          {item.emailCheck && (
                            <Badge
                              variant={item.emailCheck === "Valid" ? "default" : item.emailCheck === "Invalid" ? "destructive" : "secondary"}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {item.emailCheck}
                            </Badge>
                          )}
                          {item.safeToSend === true && (
                            <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                              <ShieldCheck className="size-3" />
                              Safe
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 truncate">
                          Failed{item.error ? ` — ${item.error}` : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {rateLimited && (
                <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <ShieldCheck className="size-3.5" />
                    Clearout rate limit reached. Validation is paused.
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Continuing after the limit resets
                    {rateLimited.resetAt ? ` at ${formatDateTime(rateLimited.resetAt)}` : "."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Validated: {progress?.completed ?? 0} · Failed: {progress?.failed ?? 0} · Waiting: {progress?.pending ?? 0}
                  </p>
                </div>
              )}
            </div>
          )}

          {(validating || !runStats) && (
            <div className={`space-y-2 border-t pt-3 ${validating ? "opacity-70" : ""}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Gauge className="size-3.5" />
                Validation settings
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Requests per minute</label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={rpmInput}
                    disabled={validating || savingSettings}
                    aria-invalid={rpmError ? true : undefined}
                    onChange={(e) => setRpmInput(e.target.value)}
                    className="h-8 text-xs"
                  />
                  {rpmError && <p className="text-[10px] text-red-600 dark:text-red-400">{rpmError}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Request timeout</label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={5}
                      max={120}
                      value={timeoutInput}
                      disabled={validating || savingSettings}
                      aria-invalid={timeoutError ? true : undefined}
                      onChange={(e) => setTimeoutInput(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">seconds</span>
                  </div>
                  {timeoutError && <p className="text-[10px] text-red-600 dark:text-red-400">{timeoutError}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs rounded-md bg-muted/40 px-2 py-1.5">
                <span className="text-muted-foreground">Request spacing</span>
                <span className="font-medium tabular-nums">
                  {spacingSeconds(requestsPerMinute).toFixed(spacingSeconds(requestsPerMinute) % 1 === 0 ? 0 : 1)} seconds between requests
                </span>
              </div>

              <div className="flex items-center justify-between text-xs rounded-md bg-muted/40 px-2 py-1.5">
                <span className="text-muted-foreground">Provider</span>
                <span className="font-medium">Clearout</span>
              </div>
            </div>
          )}

          {runStats && !validating && (
            <EmailRunSummary
              stats={runStats}
              emailStats={emailStats}
              rateLimited={rateLimited}
            />
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
                  disabled={totalCount === 0 || validating || savingSettings}
                  onClick={() => runValidation(true)}
                >
                  Validate All ({totalCount})
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={selectedIds.length === 0 || validating || savingSettings}
                  onClick={() => runValidation(false)}
                >
                  {validating ? (
                    <>
                      <MailCheck className="size-3.5 animate-pulse" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <MailCheck className="size-3.5" />
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

function EmailRunSummary({ stats, emailStats, rateLimited }: { stats: RunStats; emailStats: EmailStats; rateLimited: { resetAt: string } | null }) {
  const waiting = Math.max(0, stats.leadsRequested - stats.leadsProcessed);

  const rows = [
    ["Leads requested", String(stats.leadsRequested)],
    ["Validated", String(stats.successful)],
    ["Failed", String(stats.failed)],
    ["Waiting", String(waiting)],
    ["Valid", String(emailStats.valid)],
    ["Invalid", String(emailStats.invalid)],
    ["Unknown", String(emailStats.unknown)],
    ["API requests", String(stats.apiRequests)],
    ["Duration", formatDuration(stats.totalDurationMs)],
  ];

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
      <div className="text-sm font-medium">Run summary</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-xs border-b border-border/50 py-0.5">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{value}</span>
          </div>
        ))}
      </div>
      {rateLimited && (
        <div className="mt-2 rounded-md bg-amber-50 dark:bg-amber-950/20 p-2 text-xs text-amber-700 dark:text-amber-400">
          Clearout rate limit reached. Continuing after the limit resets
          {rateLimited.resetAt ? ` at ${formatDateTime(rateLimited.resetAt)}` : "."}
        </div>
      )}
    </div>
  );
}
