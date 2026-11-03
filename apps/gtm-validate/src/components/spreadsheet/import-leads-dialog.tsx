"use client";

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText } from "lucide-react";
import { toast } from "sonner";

const IMPORT_CHUNK_SIZE = 100;

interface ImportLeadsDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportLeadsDialog({
  projectId,
  open,
  onOpenChange,
  onImported,
}: ImportLeadsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setParsing(true);
    try {
      const Papa = (await import("papaparse")).default;
      Papa.parse<string[]>(f, {
        complete: (results) => {
          const rows = results.data.filter((r) => r.some((c) => c.trim() !== ""));
          setPreview(rows.slice(0, 6)); // header + 5 preview rows
          setParsing(false);
        },
        error: () => {
          toast.error("Failed to parse CSV");
          setParsing(false);
        },
      });
    } catch {
      toast.error("Failed to load CSV parser");
      setParsing(false);
    }
  }, []);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const Papa = (await import("papaparse")).default;
      Papa.parse<string[]>(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const leads = results.data.map((row: any) => ({
            full_name: row.full_name || row["Full Name"] || row.name || row.Name || "",
            company_name: row.company_name || row["Company Name"] || row.company || row.Company || "",
            position: row.position || row.Position || row.title || row.Title || row.job_title || "",
            email: row.email || row.Email || "",
            industry: row.industry || row.Industry || "",
            state: row.state || row.State || "",
            domain: row.domain || row.Domain || "",
            employee_size: row.employee_size || row["Employee Size"] || row.employees || row.Employees || null,
            country: row.country || row.Country || "",
            company_description: row.company_description || row["Company Description"] || "",
            company_linkedin: row.company_linkedin || row["Company LinkedIn"] || "",
            linkedin_url: row.linkedin_url || row["LinkedIn URL"] || row.linkedin || row.LinkedIn || "",
            website: row.website || row.Website || "",
          }));

          // Errors thrown in this async callback are not caught by the outer
          // try/catch, so handle them here; otherwise the dialog stayed in the
          // "importing" state forever. Rows are sent in chunks to keep each
          // request body small.
          let imported = 0;
          try {
            for (let i = 0; i < leads.length; i += IMPORT_CHUNK_SIZE) {
              const res = await fetch(`/api/projects/${projectId}/leads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(leads.slice(i, i + IMPORT_CHUNK_SIZE)),
              });
              if (!res.ok) throw new Error(await res.text());
              const json = await res.json();
              imported += json.length;
            }
            toast.success(`Imported ${imported} leads`);
            onOpenChange(false);
          } catch (err: any) {
            toast.error(
              imported > 0
                ? `Import stopped after ${imported} leads: ${err.message}`
                : `Import failed: ${err.message}`
            );
          } finally {
            if (imported > 0) onImported();
            setImporting(false);
          }
        },
        error: () => {
          toast.error("Failed to parse CSV during import");
          setImporting(false);
        },
      });
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
          <DialogDescription>
            Upload a CSV file with lead data. Columns are auto-detected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!file ? (
            <div
              className="border-2 border-dashed rounded-lg p-4 sm:p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <Upload className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">Drop CSV here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">CSV with name, company, email, etc.</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="size-4 text-muted-foreground" />
                  {file.name}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setFile(null); setPreview([]); }}
                >
                  <X className="size-3.5" />
                </Button>
              </div>

              {parsing && <p className="text-xs text-muted-foreground">Parsing…</p>}

              {preview.length > 0 && (
                <div className="rounded-md border overflow-auto max-h-48">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        {preview[0].map((h, i) => (
                          <th key={i} className="px-2 py-1 text-left font-medium text-muted-foreground whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(1).map((row, ri) => (
                        <tr key={ri} className="border-b last:border-0">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-2 py-1 truncate max-w-[150px]">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Button
                className="w-full"
                size="sm"
                onClick={handleImport}
                disabled={importing || parsing}
              >
                {importing ? "Importing…" : "Import Leads"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
