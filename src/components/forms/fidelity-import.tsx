"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { parseFidelityCSV, parseGenericCSV } from "@/lib/utils/csv-parser";
import { importHoldings, refreshHoldings } from "@/lib/actions/import";
import { ACCOUNT_OWNER_LABELS } from "@/lib/constants";
import type { Account } from "@/lib/types";

type Props = {
  accounts: Account[];
};

export function FidelityImport({ accounts }: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!accountId) {
        setResult({
          type: "error",
          message: "Select an account first.",
        });
        return;
      }

      setImporting(true);
      setResult(null);

      try {
        const text = await file.text();

        // Auto-detect format: Fidelity CSVs typically have "Account Name/Number" or "Symbol" headers
        const firstLine = text.split("\n")[0] || "";
        const isFidelity =
          firstLine.includes("Symbol") ||
          firstLine.includes("Description") ||
          firstLine.includes("Quantity") ||
          firstLine.includes("Last Price");

        const parsed = isFidelity
          ? parseFidelityCSV(text)
          : parseGenericCSV(text);

        if (parsed.length === 0) {
          setResult({
            type: "error",
            message:
              "No holdings found in the file. Make sure it's a CSV with position data.",
          });
          setImporting(false);
          return;
        }

        // Use refreshHoldings (smart upsert) if the account already has holdings
        const res = await refreshHoldings(accountId, parsed);

        const parts = [];
        if (res.updated > 0) parts.push(`${res.updated} updated`);
        if (res.added > 0) parts.push(`${res.added} added`);
        if (res.removed > 0) parts.push(`${res.removed} removed (sold)`);

        setResult({
          type: "success",
          message: parts.length > 0
            ? `${parsed.length} holdings synced: ${parts.join(", ")}.`
            : `${parsed.length} holdings — no changes needed.`,
        });
      } catch (e) {
        setResult({
          type: "error",
          message: e instanceof Error ? e.message : "Import failed.",
        });
      } finally {
        setImporting(false);
      }
    },
    [accountId]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  if (accounts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="h-5 w-5 text-primary" />
          Quick Import from CSV
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1: Pick account */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            1. Which account is this for?
          </p>
          <Select
            value={accountId}
            onValueChange={(v) => v && setAccountId(v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({a.institution}){" "}
                  <span className="text-muted-foreground">
                    — {ACCOUNT_OWNER_LABELS[a.owner]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Step 2: Download from Fidelity */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            2. Download your positions CSV
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                "https://digital.fidelity.com/ftgw/digital/portfolio/positions",
                "_blank"
              )
            }
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Fidelity Positions
          </Button>
          <p className="text-xs text-muted-foreground">
            On Fidelity&apos;s page, click the <strong>Download</strong> icon
            (top right of the positions table) and save as CSV. Works for
            any brokerage that exports CSV — not just Fidelity.
          </p>
        </div>

        {/* Step 3: Drop the file */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            3. Drop the CSV here
          </p>
          <div
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? (
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <span className="mt-2 text-sm text-muted-foreground">
              {importing
                ? "Importing..."
                : "Drag & drop CSV file, or click to browse"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {/* Result message */}
        {result && (
          <div
            className={`flex items-start gap-2 rounded-md p-3 text-sm ${
              result.type === "success"
                ? "bg-green-500/10 text-green-500"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {result.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {result.message}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Smart sync: existing holdings are updated, new ones are added, and
          positions no longer in the CSV are removed. Safe to re-import
          anytime.
        </p>
      </CardContent>
    </Card>
  );
}
