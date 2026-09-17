"use client";

import { useState, useCallback } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { importHoldings } from "@/lib/actions/import";
import { ASSET_CLASS_LABELS } from "@/lib/constants";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import type { Account } from "@/lib/types";

type Props = {
  accounts: Account[];
};

export function CsvImportForm({ accounts }: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [format, setFormat] = useState<"fidelity" | "generic" | "qfx">("fidelity");
  const [parsed, setParsed] = useState<ParsedHolding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = useCallback(
    (file: File) => {
      setError(null);
      setSuccess(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        try {
          let result: ParsedHolding[];
          if (format === "qfx" || isQFXFormat(text)) {
            result = parseQFX(text);
          } else {
            result = format === "fidelity"
              ? parseFidelityCSV(text)
              : parseGenericCSV(text);
          }
          if (result.length === 0) {
            setError("No holdings found in the file. Check the format.");
            setParsed(null);
          } else {
            setParsed(result);
          }
        } catch {
          setError("Failed to parse file. Check the format.");
          setParsed(null);
        }
      };
      reader.readAsText(file);
    },
    [format]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleImport = async () => {
    if (!parsed || !accountId) return;
    setImporting(true);
    setError(null);
    try {
      const result = await importHoldings(accountId, parsed);
      setSuccess(`Successfully imported ${result.imported} holdings.`);
      setParsed(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[200px] items-center justify-center">
          <p className="text-muted-foreground">
            Create an account first before importing data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Holdings File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Target Account</Label>
              <Select value={accountId} onValueChange={(v) => v && setAccountId(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.institution})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>File Format</Label>
              <Select
                value={format}
                onValueChange={(v) => v && setFormat(v as "fidelity" | "generic" | "qfx")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fidelity">
                    Fidelity Positions Export (CSV)
                  </SelectItem>
                  <SelectItem value="generic">
                    Generic CSV (ticker, shares, price, cost basis)
                  </SelectItem>
                  <SelectItem value="qfx">
                    QFX/OFX (ADP myKplan, Schwab, etc.)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            className={`flex items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${isDragging ? "border-primary bg-primary/5" : ""}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <label className="flex cursor-pointer flex-col items-center gap-2">
              <Upload className={`h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
              <span className="text-sm text-muted-foreground">
                {isDragging ? "Drop file here" : "Click to upload or drag and drop a CSV or QFX file"}
              </span>
              <input
                type="file"
                accept=".csv,.qfx,.ofx"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </div>
          )}
        </CardContent>
      </Card>

      {parsed && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Preview ({parsed.length} holdings)
            </CardTitle>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? "Importing..." : `Import ${parsed.length} Holdings`}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono font-medium">
                        {h.ticker}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {h.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {ASSET_CLASS_LABELS[h.assetClass] || h.assetClass}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(h.shares, 4)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(h.currentPrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(h.shares * h.currentPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
