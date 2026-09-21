"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils/format";
import { setCostBasis, clearCostBasis } from "@/lib/actions/holdings";
import { cn } from "@/lib/utils";

export type BasisSource = "plaid" | "manual" | "derived" | null;

const SOURCE_LABEL: Record<Exclude<BasisSource, null>, string> = {
  plaid: "reported by the institution",
  manual: "entered by you",
  derived: "derived from transaction history",
};

/**
 * Enter a cost basis the institution did not report.
 *
 * Only the basis. A synced position's ticker, shares and price belong to
 * the institution and the next sync would overwrite an edit to them, so
 * offering that edit would be an invitation to lose work.
 *
 * Per-share or total, because a statement gives one or the other and
 * making someone divide by 604.057 shares in their head is a way to
 * introduce an error the app then reports as fact.
 */
export function CostBasisDialog({
  holdingId,
  ticker,
  shares,
  currentValue,
  costBasisPerShare,
  source,
}: {
  holdingId: string;
  ticker: string;
  shares: number;
  currentValue: number;
  costBasisPerShare: number | null;
  source: BasisSource;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"per_share" | "total">("total");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const has = costBasisPerShare !== null;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter a number of zero or more.");
      return;
    }
    if (mode === "total" && !(shares > 0)) {
      setError("This position has no shares, so a total cannot be divided. Enter a per-share figure.");
      return;
    }
    const fd = new FormData();
    fd.set("holdingId", holdingId);
    fd.set("mode", mode);
    fd.set("amount", String(value));
    startTransition(async () => {
      try {
        await setCostBasis(fd);
        setOpen(false);
        setAmount("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  function clear() {
    startTransition(async () => {
      try {
        await clearCostBasis(holdingId);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not clear.");
      }
    });
  }

  // What the entry implies, shown before it is saved, so a slipped decimal
  // is visible as an absurd gain rather than discovered on the dashboard.
  const preview = (() => {
    const value = Number(amount);
    if (!amount || !Number.isFinite(value) || value < 0) return null;
    const total = mode === "total" ? value : value * shares;
    if (!(total > 0)) return null;
    const gain = currentValue - total;
    return { total, gain, pct: (gain / total) * 100 };
  })();

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-1.5 py-0.5 text-xs font-normal"
        onClick={() => setOpen(true)}
      >
        {has ? (
          <>
            <Pencil className="mr-1 h-3 w-3" aria-hidden />
            Edit basis
          </>
        ) : (
          <>
            <Plus className="mr-1 h-3 w-3" aria-hidden />
            Add basis
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cost basis — {ticker}</DialogTitle>
          </DialogHeader>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              {shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares,
              worth {formatCurrency(currentValue)} today.
            </p>
            {has && source && (
              <p>
                Currently {formatCurrency(costBasisPerShare!)}/share —{" "}
                {SOURCE_LABEL[source]}.
              </p>
            )}
            {!has && (
              <p>
                Not reported by this institution. Enter it from your statement
                and it will be kept — a later sync will not overwrite it.
              </p>
            )}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="flex gap-2">
              {(["total", "per_share"] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={mode === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode(m)}
                >
                  {m === "total" ? "Total cost" : "Per share"}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost-basis-amount">
                {mode === "total" ? "Total amount paid" : "Amount paid per share"}
              </Label>
              <Input
                id="cost-basis-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder={mode === "total" ? "18392.61" : "30.4485"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {preview && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <p>
                  Total cost {formatCurrency(preview.total)} · gain{" "}
                  <span
                    className={cn(
                      "font-medium",
                      preview.gain >= 0 ? "text-green-600 dark:text-green-500" : "text-destructive"
                    )}
                  >
                    {preview.gain >= 0 ? "+" : ""}
                    {formatCurrency(preview.gain)} ({preview.pct >= 0 ? "+" : ""}
                    {preview.pct.toFixed(1)}%)
                  </span>
                </p>
                {Math.abs(preview.pct) > 500 && (
                  <p className="mt-1 text-amber-600 dark:text-amber-500">
                    That is a large gain for a cost basis — check the decimal point.
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-between gap-2">
              {has && source === "manual" ? (
                <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={pending}>
                  Clear
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || amount === ""}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
