"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { linkDebtToAsset } from "@/lib/actions/debt-security";
import type { SuspectedDuplicate } from "@/lib/net-worth/compose";

/**
 * Loans that look like they have been recorded twice.
 *
 * A car loan typed onto the vehicle and then synced in as its own debt row is
 * subtracted from net worth in both places. This names the pairs and offers
 * the one thing that fixes it — saying the debt is secured against the asset,
 * after which the typed figure is superseded rather than added.
 *
 * It resolves nothing on its own. Two loans against one car can be one loan
 * written twice or a real second lien, and the numbers cannot tell them apart.
 */
export function SecuredDebtReview({ duplicates }: { duplicates: SuspectedDuplicate[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const open = duplicates.filter((d) => !done.has(`${d.assetId}|${d.debtId}`));
  if (open.length === 0) return null;

  const overcount = open.reduce((s, d) => s + d.overcount, 0);

  function link(d: SuspectedDuplicate) {
    setError(null);
    startTransition(async () => {
      try {
        await linkDebtToAsset({
          debtId: d.debtId,
          assetType: d.assetKind,
          assetId: d.assetId,
        });
        setDone((prev) => new Set(prev).add(`${d.assetId}|${d.debtId}`));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not link them.");
      }
    });
  }

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          {open.length} {open.length === 1 ? "loan looks" : "loans look"} recorded twice
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Each of these is a loan typed onto an asset and a synced debt that
          appears to be the same borrowing. While both stand, the balance is
          subtracted from your net worth twice — understating it by{" "}
          <span className="font-mono font-medium text-foreground">
            {formatCurrency(overcount)}
          </span>
          .
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {open.map((d) => (
          <div
            key={`${d.assetId}-${d.debtId}`}
            className="flex flex-col gap-2.5 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium">
                {d.assetName}
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  loan on record: {formatCurrency(d.embeddedLoan)}
                </span>
              </p>
              <p className="text-muted-foreground">
                <span className="font-mono">{d.debtName}</span>
                <span className="ml-2 font-mono text-xs">
                  {formatCurrency(d.debtBalance)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">Flagged because {d.reason}.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={pending}
              onClick={() => link(d)}
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Same loan
            </Button>
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          &ldquo;Same loan&rdquo; records the debt as secured against that asset. Its
          synced balance then becomes the amount owed and the figure typed on
          the asset is ignored — not added to it. Leave a pair alone if it is
          genuinely two separate loans; both will keep counting.
        </p>
      </CardContent>
    </Card>
  );
}
