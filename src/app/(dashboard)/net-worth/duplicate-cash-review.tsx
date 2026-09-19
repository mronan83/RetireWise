"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteCashReserve, deleteDebt } from "@/lib/actions/net-worth";
import { formatCurrency } from "@/lib/utils/format";

export type DuplicatePair = {
  kind: "cash" | "debt";
  linkedId: string;
  linkedName: string;
  linkedValue: number;
  manualId: string;
  manualName: string;
  manualValue: number;
  institution: string;
};

/**
 * Ask about a hand-entered balance that a newly linked account has replaced.
 *
 * Linking a bank that was already tracked by hand leaves two rows for one
 * account, and unlike a duplicate elsewhere in the app this one lands
 * directly in net worth — the total is simply wrong by the amount of the
 * stale copy until somebody notices. Names rarely match exactly ("AMEX
 * Savings" against "High Yield Savings Account"), so this cannot be resolved
 * automatically; it is put in front of the person who knows.
 */
export function DuplicateCashReview({ pairs }: { pairs: DuplicatePair[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = pairs.filter((p) => !dismissed.includes(p.manualId));
  if (visible.length === 0) return null;

  const overstatement = visible.reduce(
    (sum, p) => sum + (p.kind === "cash" ? p.manualValue : 0),
    0
  );

  return (
    <Alert className="border-amber-500/50">
      <AlertTriangle className="h-4 w-4 text-amber-500" />
      <AlertTitle>The same account looks counted twice</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm text-muted-foreground">
          A connected balance and one entered by hand are at the same
          institution. Removing the hand-entered copy keeps the connected one,
          which updates itself.
          {overstatement > 0 && (
            <>
              {" "}
              Your cash is currently overstated by about{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(overstatement)}
              </span>
              .
            </>
          )}
        </p>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="space-y-2">
          {visible.map((pair) => (
            <div
              key={pair.manualId}
              className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-3 text-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {pair.institution}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{pair.linkedName}</span>
                  <Badge variant="secondary" className="text-xs">
                    Connected · {formatCurrency(pair.linkedValue)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{pair.manualName}</span>
                  <Badge variant="outline" className="text-xs">
                    Manual · {formatCurrency(pair.manualValue)}
                  </Badge>
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      try {
                        if (pair.kind === "cash") {
                          await deleteCashReserve(pair.manualId);
                        } else {
                          await deleteDebt(pair.manualId);
                        }
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Could not remove it."
                        );
                      }
                    })
                  }
                >
                  <Check className="mr-1 h-3 w-3" />
                  Remove the manual one
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setDismissed((d) => [...d, pair.manualId])}
                >
                  <X className="mr-1 h-3 w-3" />
                  Different
                </Button>
              </div>
            </div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
