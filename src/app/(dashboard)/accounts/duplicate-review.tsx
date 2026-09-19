"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, Check, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mergeLinkedAccount } from "@/lib/actions/plaid";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/format";
import type { Account } from "@/lib/types";

export type ReviewPair = {
  linked: Account;
  manual: Account;
  sameType: boolean;
  linkedValue: number;
  manualValue: number;
};

type Props = { pairs: ReviewPair[] };

/**
 * Ask about accounts that look like the same money counted twice.
 *
 * Nothing here merges on its own. A wrong merge misstates the portfolio just
 * as badly as a duplicate does, and only the user knows whether the Fidelity
 * account Plaid just linked is the one they have been typing in by hand.
 */
export function DuplicateReview({ pairs }: Props) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = pairs.filter(
    (p) => !dismissed.includes(`${p.linked.id}:${p.manual.id}`)
  );
  if (visible.length === 0) return null;

  return (
    <Alert className="border-amber-500/50">
      <AlertTriangle className="h-4 w-4 text-amber-500" />
      <AlertTitle>Possible duplicate accounts</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm text-muted-foreground">
          A connected account and one you entered by hand are at the same
          institution. If they are the same account, your totals are counting
          it twice. Merging keeps the account you named and its history, and
          replaces its holdings with the connected data.
        </p>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="space-y-2">
          {visible.map((pair) => {
            const key = `${pair.linked.id}:${pair.manual.id}`;
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-3 text-sm"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-medium">
                    {pair.linked.name}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    Connected · {formatCurrency(pair.linkedValue)}
                  </Badge>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">
                    {pair.manual.name}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    Manual · {formatCurrency(pair.manualValue)}
                  </Badge>
                  {pair.sameType && (
                    <Badge variant="outline" className="text-xs">
                      {ACCOUNT_TYPE_LABELS[pair.manual.accountType] ||
                        pair.manual.accountType}
                    </Badge>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        setError(null);
                        try {
                          await mergeLinkedAccount(
                            pair.linked.id,
                            pair.manual.id
                          );
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Merge failed."
                          );
                        }
                      })
                    }
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Same account — merge
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setDismissed((d) => [...d, key])}
                  >
                    <X className="mr-1 h-3 w-3" />
                    Different
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </AlertDescription>
    </Alert>
  );
}
