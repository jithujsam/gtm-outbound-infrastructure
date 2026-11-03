"use client";

import { useState, useCallback } from "react";
import { LeadsTable } from "@/components/spreadsheet/leads-table";
import type { Lead } from "@/types";

interface ProjectLeadsProps {
  projectId: string;
  initialLeads: Lead[];
  initialTotal: number;
  onValidationComplete?: () => void;
}

export function ProjectLeads({ projectId, initialLeads, initialTotal, onValidationComplete }: ProjectLeadsProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleValidationComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onValidationComplete?.();
  }, [onValidationComplete]);

  return (
    <LeadsTable
      projectId={projectId}
      initialData={initialLeads}
      initialTotal={initialTotal}
      refreshKey={refreshKey}
      onValidationComplete={handleValidationComplete}
    />
  );
}
