"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { parseFidelityCSV, parseGenericCSV, parseQFX, isQFXFormat } from "@/lib/utils/csv-parser";
import type { ParsedHolding } from "@/lib/utils/csv-parser";
import { refreshHoldings } from "@/lib/actions/import";
import { ACCOUNT_OWNER_LABELS, ASSET_CLASS_LABELS } from "@/lib/constants";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
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

  // Preview state for QFX files (editable before import)
  const [preview, setPreview] = useState<(ParsedHolding & { _cusip?: string })[] | null>(null);
  const [isQfx, setIsQfx] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      if (!accountId) {
        setResult({ type: "error", message: "Select an account first." });
        return;
      }

      setResult(null);
      setPreview(null);

      try {
        const text = await file.text();
        const ext = file.name.toLowerCase().split(".").pop() || "";
        const qfxFile = ext === "qfx" || ext === "ofx" || isQFXFormat(text);

        let parsed: ParsedHolding[];
        let formatLabel: string;

        if (qfxFile) {
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
            message: qfxFile
              ? "No holdings found in the QFX file. Make sure it's an investment account export with position data (not just transactions)."
              : "No holdings found in the file. Make sure it's a CSV with position data.",
          });
          return;
        }

        // For QFX files: show editable preview so user can fix tickers/names
        if (qfxFile) {
          setPreview(parsed as (ParsedHolding & { _cusip?: string })[]);
          setIsQfx(true);
          return;
        }

        // For CSV files: import directly (existing behavior)
        setImporting(true);
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
        setResult({ type: "error", message: e instanceof Error ? e.message : "Import failed." });
      } finally {
        setImporting(false);
      }
    },
    [accountId]
  );

  const handleConfirmImport = async () => {
    if (!preview || !accountId) return;
    setImporting(true);
    setResult(null);
    try {
      // Strip internal _cusip field before sending to server
      const cleaned: ParsedHolding[] = preview.map(({ _cusip, ...rest }) => rest);
      const res = await refreshHoldings(accountId, cleaned);
      const parts = [];
      if (res.updated > 0) parts.push(`${res.updated} updated`);
      if (res.added > 0) parts.push(`${res.added} added`);
      if (res.removed > 0) parts.push(`${res.removed} removed (sold)`);
      setResult({
        type: "success",
        message: parts.length > 0
          ? `${preview.length} holdings synced from QFX: ${parts.join(", ")}.`
          : `${preview.length} holdings from QFX — no changes needed.`,
      });
      setPreview(null);
    } catch (e) {
      setResult({ type: "error", message: e instanceof Error ? e.message : "Import failed." });
    } finally {
      setImporting(false);
    }
  };

  const updatePreviewRow = (index: number, field: keyof ParsedHolding, value: string) => {
    if (!preview) return;
    setPreview(prev => {
      if (!prev) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
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

  // Check if any preview rows look like CUSIPs (all digits, 9 chars)
  const hasCusipTickers = preview?.some(h => /^\d{5,}$/.test(h.ticker)) ?? false;

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
          <p className="text-sm font-medium">1. Which account is this for?</p>
          <Select value={accountId} onValueChange={(v) => v && setAccountId(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({a.institution}){" "}
                  <span className="text-muted-foreground">— {ACCOUNT_OWNER_LABELS[a.owner]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Step 2: Download from brokerage */}
        <div className="space-y-2">
          <p className="text-sm font-medium">2. Download your positions file</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open("https://digital.fidelity.com/ftgw/digital/portfolio/positions", "_blank")}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Fidelity Positions
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open("https://mykplan.adp.com", "_blank")}>
              <ExternalLink className="mr-2 h-4 w-4" />
              ADP myKplan
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Fidelity:</strong> Click the Download icon on the positions page and save as CSV.{" "}
            <strong>ADP myKplan:</strong> Go to Investments, then look for Export/Download and save as .qfx.{" "}
            Works with any brokerage that exports CSV or QFX/OFX files.
          </p>
        </div>

        {/* Step 3: Drop the file */}
        {!preview && (
          <div className="space-y-2">
            <p className="text-sm font-medium">3. Drop the file here</p>
            <div
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
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
                {importing ? "Importing..." : "Drag & drop CSV or QFX file, or click to browse"}
              </span>
              <input ref={fileInputRef} type="file" accept=".csv,.qfx,.ofx" onChange={handleFileChange} className="hidden" />
            </div>
          </div>
        )}

        {/* QFX Preview: editable table before import */}
        {preview && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                3. Review & fix holdings ({preview.length} found)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setPreview(null); setIsQfx(false); }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleConfirmImport} disabled={importing}>
                  {importing ? "Importing..." : `Import ${preview.length} Holdings`}
                </Button>
              </div>
            </div>

            {hasCusipTickers && (
              <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-500 flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Some tickers are CUSIP numbers</p>
                  <p className="text-xs mt-1">
                    ADP myKplan uses CUSIP IDs instead of ticker symbols. Edit the Ticker column
                    to enter the real fund ticker (e.g., VFIAX, FXAIX). You can look up CUSIPs at{" "}
                    <button className="underline" onClick={() => window.open("https://www.quantumonline.com/search.cfm", "_blank")}>
                      quantumonline.com
                    </button>{" "}
                    or check your 401k fund list on myKplan.
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Shares</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Price</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="hidden md:table-cell">Class</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((h, i) => {
                    const isCusip = /^\d{5,}$/.test(h.ticker);
                    return (
                      <TableRow key={i} className={isCusip ? "bg-amber-500/5" : ""}>
                        <TableCell className="p-1">
                          <Input
                            value={h.ticker}
                            onChange={(e) => updatePreviewRow(i, "ticker", e.target.value.toUpperCase())}
                            className={`h-7 text-xs font-mono ${isCusip ? "border-amber-500/50" : ""}`}
                          />
                          {h._cusip && h._cusip !== h.ticker && (
                            <p className="text-[9px] text-muted-foreground mt-0.5 px-1">CUSIP: {h._cusip}</p>
                          )}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            value={h.name}
                            onChange={(e) => updatePreviewRow(i, "name", e.target.value)}
                            className="h-7 text-xs"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs hidden sm:table-cell">
                          {formatNumber(h.shares, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs hidden sm:table-cell">
                          {formatCurrency(h.currentPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">
                          {formatCurrency(h.shares * h.currentPrice)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="secondary" className="text-[10px]">
                            {ASSET_CLASS_LABELS[h.assetClass] || h.assetClass}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Edit the ticker and name fields to match the real fund symbols. Prices will auto-update on the next price refresh if the ticker is valid.
            </p>
          </div>
        )}

        {/* Result message */}
        {result && (
          <div className={`flex items-start gap-2 rounded-md p-3 text-sm ${
            result.type === "success" ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"
          }`}>
            {result.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {result.message}
          </div>
        )}

        {!preview && (
          <p className="text-xs text-muted-foreground">
            Smart sync: existing holdings are updated, new ones are added, and positions no longer in
            the file are removed. Supports CSV and QFX/OFX formats. Safe to re-import anytime.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
