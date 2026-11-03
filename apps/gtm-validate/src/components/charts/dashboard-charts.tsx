"use client";

import { DonutChart } from "./donut-chart";
import type { DonutSlice } from "./donut-chart";
import { BarChart } from "./bar-chart";

interface DashboardChartsProps {
  icpRate: number;
  validatedCount: number;
  totalLeads: number;
  verticalBreakdown: { vertical: string; count: number }[];
}

const VERTICAL_COLORS = [
  "#f97316", // orange — D2C/E-com
  "#64748b", // slate — Defense/Aviation
  "#3b82f6", // blue — Fintech
  "#10b981", // emerald — Pharma
  "#8b5cf6", // purple — Semiconductor
];

const VERTICAL_NAMES = [
  "D2C / E-commerce",
  "Defense / Aviation",
  "Fintech",
  "Pharma",
  "Semiconductor / Data Center",
];

export function DashboardCharts({ icpRate, validatedCount, totalLeads, verticalBreakdown }: DashboardChartsProps) {
  const notValidated = totalLeads - validatedCount;
  const notMatched = totalLeads - Math.round((icpRate / 100) * totalLeads);

  const icpSlices: DonutSlice[] = [
    { label: "ICP Match", value: Math.round((icpRate / 100) * totalLeads), color: "#10b981" },
    { label: "No Match", value: Math.max(notMatched, 0), color: "#e5e7eb" },
  ];

  const barItems = VERTICAL_NAMES.map((name, i) => {
    const found = verticalBreakdown.find((v) => v.vertical === name);
    return {
      label: name,
      value: found?.count ?? 0,
      color: VERTICAL_COLORS[i],
    };
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">ICP Match Rate</h3>
        <DonutChart slices={icpSlices} centerLabel={`${icpRate}%`} size={160} />
      </div>
      <div className="rounded-lg border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Leads by Vertical</h3>
        <BarChart items={barItems} />
      </div>
    </div>
  );
}
