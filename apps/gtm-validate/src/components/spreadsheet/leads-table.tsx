"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
} from "@tanstack/react-table";
import type { Lead } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Popover } from "@/components/ui/popover";
import { ImportLeadsDialog } from "@/components/spreadsheet/import-leads-dialog";
import { IcpValidationDialog } from "@/components/spreadsheet/icp-validation-button";
import { EmailValidationDialog } from "@/components/spreadsheet/email-validation-dialog";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  X,
  Columns3,
  Upload,
  CheckCircle2,
  MailCheck,
  ListFilter,
} from "lucide-react";

const STORAGE_KEY_PREFIX = "leads-table-columns-";

interface LeadWithFx extends Lead {
  __justValidated?: boolean;
}

const ALL_COLUMNS: ColumnDef<LeadWithFx>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        className="size-3.5 rounded border-input cursor-pointer"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected();
        }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        className="size-3.5 rounded border-input cursor-pointer"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
      />
    ),
    size: 36,
    minSize: 36,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "company_name",
    header: "Company",
    size: 170,
    minSize: 120,
    enableSorting: true,
    cell: ({ getValue }) => <span className="truncate block max-w-[170px]" title={getValue<string>()}>{getValue<string>()}</span>,
  },
  {
    accessorKey: "full_name",
    header: "Person",
    size: 150,
    minSize: 100,
    enableSorting: true,
    cell: ({ getValue }) => <span className="truncate block max-w-[150px]" title={getValue<string>()}>{getValue<string>()}</span>,
  },
  {
    accessorKey: "position",
    header: "Job Title",
    size: 140,
    minSize: 90,
    enableSorting: true,
    cell: ({ getValue }) => <span className="truncate block max-w-[140px]" title={getValue<string>()}>{getValue<string>()}</span>,
  },
  {
    accessorKey: "email",
    header: "Email",
    size: 210,
    minSize: 150,
    enableSorting: true,
    cell: ({ getValue }) => <span className="truncate block max-w-[210px]" title={getValue<string>()}>{getValue<string>()}</span>,
  },
  {
    accessorKey: "industry",
    header: "Industry",
    size: 130,
    minSize: 90,
    enableSorting: true,
    cell: ({ getValue }) => <span className="truncate block max-w-[130px]" title={getValue<string>()}>{getValue<string>()}</span>,
  },
  {
    accessorKey: "domain",
    header: "Website",
    size: 140,
    minSize: 100,
    enableSorting: true,
    cell: ({ getValue }) => <span className="truncate block max-w-[140px]" title={getValue<string>() ?? ""}>{getValue<string>() ?? "—"}</span>,
  },
  {
    accessorKey: "vertical_match",
    header: "ICP Match",
    size: 110,
    minSize: 90,
    enableSorting: true,
    cell: ({ row }) => {
      const val = row.getValue<boolean | null>("vertical_match");
      if (val === null) return <span className="text-muted-foreground text-xs">—</span>;
      return <Badge variant={val ? "default" : "outline"} className="text-[10px] px-1.5 py-0">{val ? "Match" : "No match"}</Badge>;
    },
  },
  {
    accessorKey: "matched_vertical",
    header: "Matched Vertical",
    size: 150,
    minSize: 100,
    enableSorting: true,
    cell: ({ getValue }) => <span className="truncate block max-w-[150px]" title={getValue<string | null>() ?? ""}>{getValue<string | null>() ?? "—"}</span>,
  },
  {
    accessorKey: "reasoning",
    header: "ICP Reasoning",
    size: 220,
    minSize: 140,
    enableSorting: false,
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      if (!val) return <span className="text-muted-foreground text-xs">—</span>;
      return <span className="truncate block max-w-[220px]" title={val}>{val}</span>;
    },
  },
  {
    accessorKey: "email_check",
    header: "Email Status",
    size: 110,
    minSize: 90,
    enableSorting: true,
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      if (!val) return <span className="text-muted-foreground text-xs">—</span>;
      const v = val === "Valid" ? "default" : val === "Invalid" ? "destructive" : "secondary";
      return <Badge variant={v as any} className="text-[10px] px-1.5 py-0">{val}</Badge>;
    },
  },
  {
    accessorKey: "safe_to_send",
    header: "Safe to Send",
    size: 100,
    minSize: 80,
    enableSorting: true,
    cell: ({ getValue }) => {
      const val = getValue<boolean | null>();
      if (val === null) return <span className="text-muted-foreground text-xs">—</span>;
      return <Badge variant={val ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">{val ? "Yes" : "No"}</Badge>;
    },
  },
  {
    accessorKey: "email_score",
    header: "Email Score",
    size: 90,
    minSize: 70,
    enableSorting: true,
    cell: ({ getValue }) => <span className="text-muted-foreground tabular-nums">{getValue<number | null>() ?? "—"}</span>,
  },
  {
    accessorKey: "state",
    header: "State",
    size: 80,
    minSize: 60,
    enableSorting: true,
  },
  {
    accessorKey: "country",
    header: "Country",
    size: 90,
    minSize: 70,
    enableSorting: true,
  },
  {
    accessorKey: "created_at",
    header: "Created",
    size: 150,
    minSize: 110,
    enableSorting: true,
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      if (!val) return <span className="text-muted-foreground text-xs">—</span>;
      return <span className="text-xs text-muted-foreground tabular-nums">{new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>;
    },
  },
];

const DEFAULT_VISIBLE: Record<string, boolean> = {
  select: true,
  company_name: true,
  full_name: true,
  position: true,
  email: true,
  industry: true,
  domain: true,
  vertical_match: true,
  matched_vertical: true,
  reasoning: false,
  email_check: true,
  safe_to_send: true,
  email_score: false,
  state: false,
  country: false,
  created_at: true,
};

const PAGE_SIZES = [10, 20, 50, 100];

interface FilterState {
  email_check: string[];
  vertical_match: string[];
  safe_to_send: string[];
  industry: string;
  company: string;
  domain: string;
}

const EMPTY_FILTERS: FilterState = {
  email_check: [],
  vertical_match: [],
  safe_to_send: [],
  industry: "",
  company: "",
  domain: "",
};

interface LeadsTableProps {
  projectId: string;
  initialData: Lead[];
  initialTotal: number;
  refreshKey?: number;
  onValidationComplete?: () => void;
}

export function LeadsTable({ projectId, initialData, initialTotal, refreshKey, onValidationComplete }: LeadsTableProps) {
  const [data, setData] = useState<LeadWithFx[]>(initialData);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [validating, setValidating] = useState<"icp" | "email" | null>(null);
  const [icpDialogOpen, setIcpDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [fadeIds, setFadeIds] = useState<Set<string>>(new Set());
  const [retainedLeads, setRetainedLeads] = useState<Map<string, LeadWithFx>>(new Map());
  const fadeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const storageKey = STORAGE_KEY_PREFIX + projectId;
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (typeof window === "undefined") return DEFAULT_VISIBLE;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return { ...DEFAULT_VISIBLE, ...JSON.parse(stored) };
    } catch {}
    return DEFAULT_VISIBLE;
  });

  const mountedRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(columnVisibility)); } catch {}
  }, [columnVisibility, storageKey]);

  const buildParams = useCallback((page: number, size: number, sortCol?: string, sortDir?: string) => {
    const params = new URLSearchParams({ page: String(page + 1), limit: String(size) });
    if (globalFilter) params.set("search", globalFilter);
    if (filters.email_check.length) filters.email_check.forEach((v) => params.append("email_check", v));
    if (filters.vertical_match.length) filters.vertical_match.forEach((v) => params.append("vertical_match", v));
    if (filters.safe_to_send.length) filters.safe_to_send.forEach((v) => params.append("safe_to_send", v));
    if (filters.industry) params.set("industry", filters.industry);
    if (filters.company) params.set("company", filters.company);
    if (filters.domain) params.set("domain", filters.domain);
    if (sortCol) { params.set("sort", sortCol); params.set("order", sortDir ?? "asc"); }
    return params;
  }, [globalFilter, filters]);

  const fetchPage = useCallback(async (page: number, size: number, sortCol?: string, sortDir?: string) => {
    setLoading(true);
    try {
      const params = buildParams(page, size, sortCol, sortDir);
      const res = await fetch(`/api/projects/${projectId}/leads?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load leads");
      setData(json.data);
      setTotalCount(json.total);
      setPageIndex(Math.min(page, Math.max(0, Math.ceil(json.total / size) - 1)));
      setRowSelection({});
    } catch (err: any) {
      toast.error(err.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [projectId, buildParams]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const c = sorting[0];
    fetchPage(pageIndex, pageSize, c?.id, c?.desc ? "desc" : "asc");
  }, [pageIndex, pageSize, globalFilter, filters, sorting, refreshKey]);

  const activeFilterCount = useMemo(() => {
    return (
      filters.email_check.length +
      filters.vertical_match.length +
      filters.safe_to_send.length +
      (filters.industry ? 1 : 0) +
      (filters.company ? 1 : 0) +
      (filters.domain ? 1 : 0)
    );
  }, [filters]);

  const fetchAllIds = useCallback(async (): Promise<string[]> => {
    const params = buildParams(0, 1000);
    params.set("idsonly", "true");
    const res = await fetch(`/api/projects/${projectId}/leads?${params}`);
    const json = await res.json();
    return json.ids ?? [];
  }, [projectId, buildParams]);

  const fetchLeadsByIds = useCallback(async (ids: string[]): Promise<LeadWithFx[]> => {
    if (ids.length === 0) return [];
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("limit", String(ids.length));
    ids.forEach((id) => params.append("ids", id));
    const res = await fetch(`/api/projects/${projectId}/leads?${params}`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []) as LeadWithFx[];
  }, [projectId]);

  const handleBatchComplete = useCallback(async (ids: string[]) => {
    // Track the completed leads independently of the filtered table data.
    setFadeIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });

    // Fetch the completed leads' fresh data (with the new ICP result) so they
    // can be retained and rendered even if the current filter would exclude them.
    const completedRows = await fetchLeadsByIds(ids);
    if (completedRows.length > 0) {
      setRetainedLeads((prev) => {
        const next = new Map(prev);
        completedRows.forEach((lead) => next.set(lead.id, lead));
        return next;
      });
    }

    ids.forEach((id) => {
      const existing = fadeTimers.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setFadeIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setRetainedLeads((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        fadeTimers.current.delete(id);
        // Reapply the active filter after the animation so a lead that no
        // longer matches is removed, while a matching lead stays normally.
        fetchPage(pageIndex, pageSize, sorting[0]?.id, sorting[0]?.desc ? "desc" : "asc");
      }, 6000);
      fadeTimers.current.set(id, timer);
    });

    // Refresh the filtered result set, but the retained leads above remain
    // mounted for the duration of the animation.
    fetchPage(pageIndex, pageSize, sorting[0]?.id, sorting[0]?.desc ? "desc" : "asc");
  }, [fetchLeadsByIds, fetchPage, pageIndex, pageSize, sorting]);

  const handleValidationComplete = useCallback((ids: string[], stillMatch: (lead: Lead) => boolean) => {
    onValidationComplete?.();
    handleBatchComplete(ids);
  }, [onValidationComplete, handleBatchComplete]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPageIndex(0);
  };

  const toggleArrayFilter = (key: "email_check" | "vertical_match" | "safe_to_send", value: string) => {
    setFilters((prev) => {
      const current = prev[key];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
    setPageIndex(0);
  };

  const setTextFilter = (key: "industry" | "company" | "domain", value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPageIndex(0);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPageIndex(0);
  };

  const displayData = useMemo(() => {
    if (retainedLeads.size === 0) return data;
    const merged = [...data];
    const existingIds = new Set(data.map((d) => d.id));
    retainedLeads.forEach((lead, id) => {
      if (!existingIds.has(id)) merged.push(lead);
    });
    return merged;
  }, [data, retainedLeads]);

  const table = useReactTable({
    data: displayData,
    columns: ALL_COLUMNS,
    state: { sorting, globalFilter, columnVisibility, rowSelection, pagination: { pageIndex, pageSize } },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.max(Math.ceil(totalCount / pageSize), 1),
  });

  const start = totalCount === 0 ? 0 : pageIndex * pageSize + 1;
  const end = totalCount === 0 ? 0 : Math.min((pageIndex + 1) * pageSize, totalCount);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[140px] sm:min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={globalFilter}
            onChange={(e) => { setGlobalFilter(e.target.value); setPageIndex(0); }}
            className="pl-8 h-8 text-xs"
          />
          {globalFilter && (
            <button
              onClick={() => setGlobalFilter("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Popover
            trigger={
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 relative">
                <ListFilter className="size-3.5" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            }
            align="end"
          >
            <div className="w-full sm:w-[280px] max-h-[70vh] overflow-y-auto space-y-4 p-2">
              <FilterGroup label="ICP">
                <FilterCheckbox label="ICP Match" checked={filters.vertical_match.includes("true")} onChange={() => toggleArrayFilter("vertical_match", "true")} />
                <FilterCheckbox label="ICP No Match" checked={filters.vertical_match.includes("false")} onChange={() => toggleArrayFilter("vertical_match", "false")} />
                <FilterCheckbox label="ICP Not Validated" checked={filters.vertical_match.includes("null")} onChange={() => toggleArrayFilter("vertical_match", "null")} />
              </FilterGroup>

              <FilterGroup label="Email">
                <FilterCheckbox label="Email Valid" checked={filters.email_check.includes("Valid")} onChange={() => toggleArrayFilter("email_check", "Valid")} />
                <FilterCheckbox label="Email Invalid" checked={filters.email_check.includes("Invalid")} onChange={() => toggleArrayFilter("email_check", "Invalid")} />
                <FilterCheckbox label="Email Unknown" checked={filters.email_check.includes("Unknown")} onChange={() => toggleArrayFilter("email_check", "Unknown")} />
                <FilterCheckbox label="Email Not Validated" checked={filters.email_check.includes("null")} onChange={() => toggleArrayFilter("email_check", "null")} />
              </FilterGroup>

              <FilterGroup label="Safe to Send">
                <FilterCheckbox label="Safe to Send" checked={filters.safe_to_send.includes("true")} onChange={() => toggleArrayFilter("safe_to_send", "true")} />
                <FilterCheckbox label="Not Safe to Send" checked={filters.safe_to_send.includes("false")} onChange={() => toggleArrayFilter("safe_to_send", "false")} />
              </FilterGroup>

              <FilterGroup label="Other">
                <TextFilterField label="Industry" value={filters.industry} onChange={(v) => setTextFilter("industry", v)} />
                <TextFilterField label="Company" value={filters.company} onChange={(v) => setTextFilter("company", v)} />
                <TextFilterField label="Domain" value={filters.domain} onChange={(v) => setTextFilter("domain", v)} />
              </FilterGroup>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 border-t border-border"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </Popover>

          <Popover
            trigger={
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Columns3 className="size-3.5" />
                <span className="hidden sm:inline">Columns</span>
              </Button>
            }
            align="end"
          >
            <div className="max-h-64 overflow-y-auto">
              {ALL_COLUMNS.filter((c) => c.enableHiding !== false && "accessorKey" in c).map((col) => {
                const key = (col as any).accessorKey as string;
                const visible = columnVisibility[key] !== false;
                return (
                  <label key={key} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted cursor-pointer">
                    <input
                      type="checkbox"
                      className="size-3 rounded"
                      checked={visible}
                      onChange={() => setColumnVisibility((prev) => ({ ...prev, [key]: !visible }))}
                    />
                    {typeof col.header === "string" ? col.header : key}
                  </label>
                );
              })}
            </div>
          </Popover>

          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="size-3.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={validating !== null}
            onClick={() => setIcpDialogOpen(true)}
          >
            <CheckCircle2 className="size-3.5" />
            <span className="hidden sm:inline">{validating === "icp" ? "ICP…" : "ICP Validation"}</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={validating !== null}
            onClick={() => setEmailDialogOpen(true)}
          >
            <MailCheck className="size-3.5" />
            <span className="hidden sm:inline">{validating === "email" ? "Email…" : "Email Validation"}</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden min-h-[420px]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b bg-muted/50">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const isSorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                        style={{ width: header.getSize(), minWidth: header.column.columnDef.minSize ?? header.getSize() }}
                      >
                        {canSort ? (
                          <button
                            className="inline-flex items-center gap-1 hover:text-foreground text-[11px]"
                            onClick={() => header.column.toggleSorting(header.column.getIsSorted() === "asc")}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {isSorted === "asc" ? (
                              <ArrowUp className="size-3" />
                            ) : isSorted === "desc" ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ArrowUpDown className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          <span className="text-[11px]">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b last:border-0">
                    {ALL_COLUMNS.map((col) => (
                      <td key={col.id} className="px-3 py-2.5">
                        <div className="h-3.5 w-3/4 bg-muted animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={ALL_COLUMNS.length} className="py-10 text-center text-muted-foreground text-xs">
                    No leads found.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const fadeActive = fadeIds.has(row.original.id);
                  return (
                    <tr
                      key={row.id}
                      className={`border-b last:border-0 transition-colors duration-[6000ms] ease-out ${
                        fadeActive ? "bg-emerald-50 dark:bg-emerald-950/40" : row.getIsSelected() ? "bg-muted/50" : "hover:bg-muted/30"
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 py-2 text-xs whitespace-nowrap"
                          style={{ maxWidth: cell.column.columnDef.size }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {totalCount === 0 ? "No leads" : `Showing ${start}–${end} of ${totalCount}`}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Rows per page</span>
            <Select
              className="h-7 text-xs w-[70px]"
              value={String(pageSize)}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground min-w-[60px] text-center">
            {Object.keys(rowSelection).length > 0 ? `${Object.keys(rowSelection).length} selected` : "0 selected"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0}
          >
            <ChevronLeft className="size-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </Button>
          <span className="text-xs text-muted-foreground px-1 min-w-[40px] sm:min-w-[60px] text-center tabular-nums">
            {pageIndex + 1} / {Math.max(Math.ceil(totalCount / pageSize), 1)}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPageIndex((p) => p + 1)}
            disabled={pageIndex + 1 >= Math.ceil(totalCount / pageSize)}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <ImportLeadsDialog
        projectId={projectId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => { fetchPage(0, pageSize); onValidationComplete?.(); }}
      />

      <IcpValidationDialog
        projectId={projectId}
        open={icpDialogOpen}
        onOpenChange={setIcpDialogOpen}
        selectedIds={Object.keys(rowSelection)}
        totalCount={totalCount}
        onValidationComplete={(completedIds) => {
          handleValidationComplete(completedIds, () => true);
        }}
        onBatchComplete={handleBatchComplete}
        fetchAllIds={fetchAllIds}
      />

      <EmailValidationDialog
        projectId={projectId}
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        selectedIds={Object.keys(rowSelection)}
        totalCount={totalCount}
        onValidationComplete={(completedIds) => {
          handleValidationComplete(completedIds, () => true);
        }}
        onBatchComplete={handleBatchComplete}
      />
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 px-1">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 rounded-sm px-2 py-1 text-xs hover:bg-muted cursor-pointer">
      <input type="checkbox" className="size-3 rounded" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function TextFilterField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="px-1 mb-1">
      <span className="text-[10px] text-muted-foreground block mb-0.5">{label}</span>
      <input
        type="text"
        placeholder={`Filter ${label.toLowerCase()}...`}
        className="w-full rounded border border-input bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
