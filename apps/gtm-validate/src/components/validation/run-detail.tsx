"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCost, formatDuration, formatTokens, formatDateTime, formatProvider, type RunStats } from "@/lib/format";
import { ChevronDown, ChevronRight, XCircle, CheckCircle2, Clock } from "lucide-react";

interface JobRequest {
  id: string;
  provider: string;
  model: string | null;
  leads_in_request: number | null;
  status: string;
  duration_ms: number | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  input_cost: number | null;
  cached_input_cost: number | null;
  output_cost: number | null;
  total_cost: number | null;
  request_id: string | null;
  created_at: string;
  error_message: string | null;
  raw_response: unknown;
  raw_error: unknown;
}

interface JobItem {
  id: string;
  lead_id: string;
  status: string;
  attempt: number;
  error_message: string | null;
  completed_at: string | null;
  next_attempt_at: string | null;
  lead: {
    full_name: string | null;
    company_name: string | null;
    email: string | null;
    vertical_match: boolean | null;
    matched_vertical: string | null;
    reasoning: string | null;
    email_check: string | null;
    safe_to_send: boolean | null;
  } | null;
}

interface RunDetailData {
  job: {
    id: string;
    type: string;
    status: string;
    model: string | null;
    llm_provider: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    total_leads: number;
    completed_leads: number;
    failed_leads: number;
    skipped_leads: number;
    error_message: string | null;
    provider_reset_at: string | null;
    requests_per_minute: number | null;
    timeout_seconds: number | null;
  };
  requests: JobRequest[];
  items: JobItem[];
  runStats: RunStats | null;
  emailRunStats?: {
    valid: number;
    invalid: number;
    unknown: number;
  } | null;
}

export function RunDetail({ jobId, onClose }: { jobId: string; onClose?: () => void }) {
  const [data, setData] = useState<RunDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/detail`);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Failed to load run");
      }
      setData(await res.json());
    } catch (err: any) {
      setError(err.message || "Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400">
        {error || "Run not found"}
      </div>
    );
  }

  const { job, requests, items, runStats, emailRunStats } = data;
  const waiting = runStats ? Math.max(0, runStats.leadsRequested - runStats.leadsProcessed) : 0;

  return (
    <div className="space-y-5">
      {onClose && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ChevronLeftIcon />
            Back
          </Button>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold tracking-tight">
            {job.type === "icp" ? "ICP Validation" : "Email Validation"}
          </h2>
          <StatusBadge status={job.status} />
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {formatDateTime(job.created_at)}
          {job.llm_provider ? ` · ${formatProvider(job.llm_provider)}` : ""}
          {job.model ? ` · ${job.model}` : ""}
        </p>
        {job.provider_reset_at && (
          <div className="mt-2 rounded-md bg-amber-50 dark:bg-amber-950/20 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
            Clearout rate limit reached. Continuing after the limit resets at {formatDateTime(job.provider_reset_at)}.
          </div>
        )}
      </div>

      {runStats && (
        <SummaryGrid
          stats={runStats}
          emailRunStats={job.type === "email" ? emailRunStats : null}
        />
      )}

      {job.type === "email" && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Email validation settings</h3>
          <div className="rounded-md border overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
              <div className="bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground">Provider</p>
                <p className="text-sm font-semibold">Clearout</p>
              </div>
              <div className="bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground">Requests per minute</p>
                <p className="text-sm font-semibold tabular-nums">{job.requests_per_minute ?? 3}</p>
              </div>
              <div className="bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground">Request timeout</p>
                <p className="text-sm font-semibold tabular-nums">{job.timeout_seconds ?? 45} seconds</p>
              </div>
              <div className="bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground">Request spacing</p>
                <p className="text-sm font-semibold tabular-nums">
                  {(60 / (job.requests_per_minute ?? 3)).toFixed((60 / (job.requests_per_minute ?? 3)) % 1 === 0 ? 0 : 1)} seconds
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold mb-2">Requests</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API requests recorded for this run.</p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 font-medium">Leads</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Duration</th>
                    <th className="px-3 py-2 font-medium">Input</th>
                    <th className="px-3 py-2 font-medium">Cached</th>
                    <th className="px-3 py-2 font-medium">Output</th>
                    <th className="px-3 py-2 font-medium">Cost</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r, i) => {
                    const isOpen = openRequest === r.id;
                    return (
                      <RequestRow
                        key={r.id}
                        request={r}
                        index={i}
                        isOpen={isOpen}
                        showRaw={showRaw.has(r.id)}
                        onToggle={() => setOpenRequest(isOpen ? null : r.id)}
                        onToggleRaw={() => {
                          setShowRaw((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          });
                        }}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">Leads</h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leads recorded for this run.</p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Lead</th>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                    <th className="px-3 py-2 font-medium">Matched Vertical</th>
                    <th className="px-3 py-2 font-medium">Reasoning</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const lead = item.lead;
                    const failed = item.status === "failed";
                    const completed = item.status === "completed";
                    const waiting = item.status === "pending" && job.provider_reset_at;

                    return (
                      <tr key={item.id} className="border-b last:border-0 align-top">
                        <td className="px-3 py-2 text-xs">{lead?.full_name ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">{lead?.company_name ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          {lead?.vertical_match === true ? (
                            <Badge variant="default" className="text-[10px]">Match</Badge>
                          ) : lead?.vertical_match === false ? (
                            <Badge variant="outline" className="text-[10px]">No match</Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{lead?.matched_vertical ?? "—"}</td>
                        <td className="px-3 py-2 text-xs max-w-[240px] truncate" title={lead?.reasoning ?? ""}>{lead?.reasoning ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          {failed ? (
                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                              <XCircle className="size-3" /> Failed
                            </span>
                          ) : completed ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="size-3" /> Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              {waiting ? (
                                <>
                                  <ClockIcon /> Waiting for Clearout reset
                                </>
                              ) : (
                                <>
                                  <ClockIcon /> Pending
                                </>
                              )}
                            </span>
                          )}
                          {item.error_message && (
                            <span className="block text-[10px] text-muted-foreground mt-0.5 max-w-[220px] truncate" title={item.error_message}>
                              {item.error_message}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryGrid({ stats, emailRunStats }: { stats: RunStats; emailRunStats: { valid: number; invalid: number; unknown: number } | null | undefined }) {
  const waiting = Math.max(0, stats.leadsRequested - stats.leadsProcessed);

  const commonRows = [
    ["Leads requested", String(stats.leadsRequested)],
    ["Leads processed", String(stats.leadsProcessed)],
    ["Successful", String(stats.successful)],
    ["Failed", String(stats.failed)],
  ];

  const emailRows = emailRunStats
    ? [
        ["Waiting", String(waiting)],
        ["Valid", String(emailRunStats.valid)],
        ["Invalid", String(emailRunStats.invalid)],
        ["Unknown", String(emailRunStats.unknown)],
      ]
    : [];

  const icpRows = !emailRunStats
    ? [
        ["ICP matches", String(stats.matched)],
        ["ICP no matches", String(stats.noMatch)],
        ["Input tokens", formatTokens(stats.inputTokens)],
        ["Cached input tokens", formatTokens(stats.cachedInputTokens)],
        ["Output tokens", formatTokens(stats.outputTokens)],
        ["Total tokens", formatTokens(stats.totalTokens)],
        ["Total cost", formatCost(stats.totalCost)],
      ]
    : [];

  const finalRows = [
    ...commonRows,
    ...emailRows,
    ...icpRows,
    ["API requests", String(stats.apiRequests)],
    ["Duration", formatDuration(stats.totalDurationMs)],
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-md overflow-hidden">
      {finalRows.map(([label, value]) => (
        <div key={label} className="bg-card p-2.5">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

function RequestRow({
  request,
  index,
  isOpen,
  showRaw,
  onToggle,
  onToggleRaw,
}: {
  request: JobRequest;
  index: number;
  isOpen: boolean;
  showRaw: boolean;
  onToggle: () => void;
  onToggleRaw: () => void;
}) {
  const failed = request.status !== "success";
  return (
    <>
      <tr
        className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer ${isOpen ? "bg-muted/40" : ""}`}
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{index + 1}</td>
        <td className="px-3 py-2 text-xs">{formatProvider(request.provider)}</td>
        <td className="px-3 py-2 text-xs">{request.model ?? "—"}</td>
        <td className="px-3 py-2 text-xs tabular-nums">{request.leads_in_request ?? "—"}</td>
        <td className="px-3 py-2 text-xs">
          {failed ? (
            <Badge variant="destructive" className="text-[10px]">{request.status}</Badge>
          ) : (
            <Badge variant="default" className="text-[10px]">success</Badge>
          )}
        </td>
        <td className="px-3 py-2 text-xs tabular-nums">{formatDuration(request.duration_ms)}</td>
        <td className="px-3 py-2 text-xs tabular-nums">{formatTokens(request.input_tokens)}</td>
        <td className="px-3 py-2 text-xs tabular-nums">{formatTokens(request.cached_input_tokens)}</td>
        <td className="px-3 py-2 text-xs tabular-nums">{formatTokens(request.output_tokens)}</td>
        <td className="px-3 py-2 text-xs tabular-nums">{formatCost(request.total_cost)}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b bg-muted/20">
          <td colSpan={11} className="px-3 py-2">
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span className="text-muted-foreground">Request ID: <span className="font-mono">{request.request_id ?? "—"}</span></span>
                <span className="text-muted-foreground">Timestamp: {formatDateTime(request.created_at)}</span>
                <span className="text-muted-foreground">Total tokens: {formatTokens(request.total_tokens)}</span>
              </div>
              {request.error_message && (
                <div className="text-red-600 dark:text-red-400">
                  Error: {request.error_message}
                </div>
              )}
              {(request.raw_response != null || request.raw_error != null) && (
                <div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onToggleRaw}>
                    {showRaw ? "Hide raw response" : "Show raw response"}
                  </Button>
                  {showRaw && (
                    <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-[10px] whitespace-pre-wrap break-all">
                      {JSON.stringify(request.raw_response ?? request.raw_error ?? null, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
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

function ChevronLeftIcon() {
  return <span aria-hidden>←</span>;
}

function ClockIcon() {
  return <Clock className="size-3" />;
}
