"use client";

import { RunHistory } from "@/components/validation/run-history";

export default function LogsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Validation Runs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every validation run with usage, cost, and per-lead results.
        </p>
      </div>
      <RunHistory />
    </div>
  );
}
