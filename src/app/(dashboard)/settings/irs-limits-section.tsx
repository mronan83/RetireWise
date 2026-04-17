"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";

type Limit = {
  id: string;
  taxYear: number;
  accountType: string;
  limitUnder50: string;
  limitOver50: string;
  limitAge60to63: string | null;
  notes: string | null;
  updatedAt: string;
};

export function IrsLimitsSection() {
  const [limits, setLimits] = useState<Limit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchLimits = async () => {
    const res = await fetch("/api/irs-limits/refresh");
    const data = await res.json();
    setLimits(data.limits || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchLimits();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/irs-limits/refresh", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setMessage(
          `Updated ${data.upserted} limits for ${data.years.join(", ")}`
        );
        await fetchLimits();
      }
    } catch {
      setMessage("Failed to update limits");
    } finally {
      setRefreshing(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  // Group by year
  const years = [...new Set(limits.map((l) => l.taxYear))].sort(
    (a, b) => b - a
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          IRS contribution limits used for auto-escalation caps. Click refresh
          to pull the latest numbers.
        </p>
        <div className="flex items-center gap-2">
          {message && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <CheckCircle2 className="h-3 w-3" />
              {message}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Updating..." : "Refresh Limits"}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Loading limits...
        </p>
      ) : limits.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No IRS limits loaded yet. Click <strong>Refresh Limits</strong> to
            pull 2025 and 2026 limits.
          </p>
        </div>
      ) : (
        years.map((year) => {
          const yearLimits = limits.filter((l) => l.taxYear === year);
          return (
            <div key={year} className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                {year}
                <Badge variant="secondary" className="text-xs">
                  Tax Year
                </Badge>
              </h4>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Type</TableHead>
                      <TableHead className="text-right">Under 50</TableHead>
                      <TableHead className="text-right">50+ (catch-up)</TableHead>
                      <TableHead className="text-right">60-63 (enhanced)</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Notes
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yearLimits.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium text-sm">
                          {ACCOUNT_TYPE_LABELS[l.accountType] || l.accountType}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(Number(l.limitUnder50))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(Number(l.limitOver50))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {l.limitAge60to63
                            ? formatCurrency(Number(l.limitAge60to63))
                            : "—"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {l.notes || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })
      )}

      <p className="text-xs text-muted-foreground">
        Source:{" "}
        <a
          href="https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-401k-and-profit-sharing-plan-contribution-limits"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1"
        >
          IRS.gov <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  );
}
