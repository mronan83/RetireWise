"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SyncResult = {
  items: number;
  message?: string;
  results?: {
    institution: string;
    status: "synced" | "cooling_down" | "failed";
    transactions?: { fetched: number; inserted: number; earliest: string | null; latest: string | null };
    error?: string;
  }[];
  costBasis?: {
    attempted: number;
    derived: number;
    stillMissing: number;
    reasons: { ticker: string; reason: string }[];
  };
};

/**
 * Pull from every linked institution now, and say what came back.
 *
 * The result is the point, not the refresh. Coverage for investment
 * transactions varies by institution and an employer plan may return
 * nothing at all — so the button reports per institution what was fetched
 * and over what dates, rather than a spinner followed by a tick that means
 * "something happened".
 */
export function SyncNowButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/plaid/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Sync failed (${res.status})`);
      } else {
        setResult(body);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <Button onClick={sync} disabled={busy} variant="outline" size="sm">
        <RefreshCw className={cn("mr-2 h-4 w-4", busy && "animate-spin")} />
        {busy ? "Syncing…" : "Sync now"}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
          {result.items === 0 && (
            <p className="text-muted-foreground">{result.message}</p>
          )}

          {result.results?.map((r) => (
            <div key={r.institution} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{r.institution}</span>
              {r.status === "cooling_down" && (
                <span className="text-muted-foreground">
                  synced moments ago — skipped
                </span>
              )}
              {r.status === "failed" && (
                <span className="text-destructive">{r.error}</span>
              )}
              {r.status === "synced" && r.transactions && (
                <span className="text-muted-foreground">
                  {r.transactions.fetched === 0
                    ? "no investment transactions reported"
                    : `${r.transactions.fetched} transactions, ${r.transactions.earliest} to ${r.transactions.latest} (${r.transactions.inserted} new)`}
                </span>
              )}
              {r.status === "synced" && !r.transactions && (
                <span className="text-muted-foreground">
                  holdings updated; transactions unavailable
                </span>
              )}
            </div>
          ))}

          {/* Why a cost basis is still missing, named position by position.
              "Could not derive" without a reason is how a gap becomes
              permanent and unexplained. */}
          {result.costBasis && result.costBasis.attempted > 0 && (
            <div className="border-t pt-2">
              <p className="font-medium">
                Cost basis: {result.costBasis.derived} of{" "}
                {result.costBasis.attempted} derived
              </p>
              {result.costBasis.reasons.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {result.costBasis.reasons.slice(0, 15).map((r, i) => (
                    <li key={`${r.ticker}-${i}`}>
                      <span className="font-mono">{r.ticker}</span> — {r.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
