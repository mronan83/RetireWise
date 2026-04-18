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
import { parseFidelityCSV, parseGenericCSV, parseQFX, isQFXFormat } from "@/lib/utils/csv-parser";
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
        const ext = file.name.toLowerCase().split(".").pop() || "";

        // Auto-detect format: QFX/OFX, Fidelity CSV, or generic CSV
        let parsed;
        let formatLabel: string;

        if (ext === "qfx" || ext === "ofx" || isQFXFormat(text)) {
          parsed = parseQFX(text);
          formatLabel = "QFX/OFX";
        } else {
          const firstLine = text.split("\n")[0] || "";
          const isFidelity =
            firstLine.includes("Symbol") ||
            firstLine.includes("Description") ||
            firstLine.includes("Quantity") ||
            firstLine.includes("Last Price");
          parsed = isFidelity ? parseFidelityCSV(text) : parseGenericCSV(text);
          formatLabel = isFidelity ? "Fidelity CSV" : "CSV";
        }

        if (parsed.length === 0) {
          setResult({
            type: "error",
            message: ext === "qfx" || ext === "ofx"
              ? "No holdings found in the QFX file. Make sure it's an investment account export with position data (not just transactions)."
              : "No holdings found in the file. Make sure it's a CSV with position data.",
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
            ? `${parsed.length} holdings synced from ${formatLabel}: ${parts.join(", ")}.`
            : `${parsed.length} holdings from ${formatLabel} — no changes needed.`,
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
          Quick Import
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

        {/* Step 2: Download from brokerage */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            2. Download your positions file
          </p>
          <div className="flex flex-wrap gap-2">
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
              Fidelity Positions
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  "https://mykplan.adp.com",
                  "_blank"
                )
              }
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              ADP myKplan
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Fidelity:</strong> Click the Download icon on the positions page and save as CSV.{" "}
            <strong>ADP myKplan:</strong> Go to Investments → Account Details, then look for Export/Download and save as .qfx.{" "}
            Works with any brokerage that exports CSV or QFX/OFX files.
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
                : "Drag & drop CSV or QFX file, or click to browse"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.qfx,.ofx"
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
          positions no longer in the file are removed. Supports CSV and QFX/OFX
          formats. Safe to re-import anytime.
        </p>
      </CardContent>
    </Card>
  );
}
