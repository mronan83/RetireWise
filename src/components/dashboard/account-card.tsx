import Link from "next/link";
import { Wallet, TrendingUp, TrendingDown, Link2, PencilLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ACCOUNT_TYPE_LABELS,
  TAX_TREATMENT_LABELS,
  ACCOUNT_OWNER_LABELS,
} from "@/lib/constants";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/types";
import {
  ConnectionStatus,
  LastUpdated,
  type ConnectionState,
} from "@/components/ui/last-updated";

const PERIOD_LABELS: Record<string, string> = {
  daily: "Day",
  ytd: "YTD",
  "1yr": "1Y",
  "3yr": "3Y",
  "5yr": "5Y",
  "10yr": "10Y",
};

type Props = {
  account: Account;
  totalValue: number;
  costBasis?: number;
  gainLoss?: number;
  gainLossPct?: number;
  /**
   * Why there is no gain figure, when there isn't one.
   *
   * Absent this, an account whose institution reports no cost basis is
   * indistinguishable from one that has genuinely not moved.
   */
  missingBasisNote?: string | null;
  periodReturns?: Record<string, number | null>;
  /** Link health. Absent on callers that have not loaded it yet. */
  connection?: ConnectionState;
  /** How old the figure shown is — the oldest price behind it, not the newest. */
  valueAsOf?: Date | string | null;
  /** Positions carrying no price at all, which no age can describe. */
  unpricedHoldings?: number;
};

export function AccountCard({
  account,
  totalValue,
  costBasis,
  gainLoss,
  gainLossPct,
  missingBasisNote,
  periodReturns,
  connection,
  valueAsOf,
  unpricedHoldings = 0,
}: Props) {
  /**
   * A gain needs a cost that somebody actually reported.
   *
   * This was `costBasis > 0`, which a fabricated basis passed: the Plaid
   * sync filled an unreported basis with `shares * currentPrice`, so the
   * card printed "+$0.00 (+0.00%)" — a confident statement of no gain about
   * a 401(k) that was up thousands. Unknown now renders as unknown.
   */
  const hasGainLoss =
    gainLoss !== undefined && gainLossPct !== undefined && costBasis !== undefined && costBasis > 0;
  const isPositive = (gainLoss ?? 0) >= 0;
  const hasPeriodData = periodReturns && Object.values(periodReturns).some((v) => v !== null);
  const isLinked = account.plaidAccountId !== null;

  return (
    <Link href={`/accounts/${account.id}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {account.name}
          </CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-xl font-bold font-mono">
            {formatCurrency(totalValue)}
          </div>

          {/* Total gain/loss, or why there isn't one */}
          {!hasGainLoss && missingBasisNote && (
            <p className="mt-1 text-xs text-muted-foreground">{missingBasisNote}</p>
          )}
          {hasGainLoss && (
            <div className={cn(
              "flex items-center gap-1.5 mt-1",
              isPositive ? "text-green-500" : "text-red-500"
            )}>
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span className="text-xs font-mono font-medium">
                {isPositive ? "+" : ""}{formatCurrency(gainLoss!)}
              </span>
              <span className="text-xs font-mono">
                ({isPositive ? "+" : ""}{formatPercent(gainLossPct!)})
              </span>
            </div>
          )}

          {/* Time-period returns */}
          {hasPeriodData && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-2">
              {Object.entries(PERIOD_LABELS).map(([key, label]) => {
                const val = periodReturns![key];
                if (val === null || val === undefined) return null;
                const pos = val >= 0;
                return (
                  <div key={key} className="flex items-baseline gap-0.5">
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                    <span className={cn(
                      "text-[10px] font-mono font-medium",
                      pos ? "text-green-500" : "text-red-500"
                    )}>
                      {pos ? "+" : ""}{val.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              variant={account.owner === "spouse" ? "default" : "secondary"}
              className="text-xs"
            >
              {ACCOUNT_OWNER_LABELS[account.owner] || account.owner}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {ACCOUNT_TYPE_LABELS[account.accountType] || account.accountType}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {TAX_TREATMENT_LABELS[account.taxTreatment] ||
                account.taxTreatment}
            </Badge>
            {!account.isActivelyContributing && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                No contributions
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{account.institution}</span>
            <span aria-hidden>·</span>
            {/* Whether a figure updates itself changes how much you should
                trust it, so the source belongs next to the institution rather
                than buried on the detail page. */}
            {isLinked ? (
              <span className="flex items-center gap-1 text-primary">
                <Link2 className="h-3 w-3" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <PencilLine className="h-3 w-3" />
                Manual
              </span>
            )}
          </div>

          {/* Two ages, not one. The connection can be healthy while the
              prices behind the figure are a week old, and a broken
              connection can sit behind a balance that still looks current. */}
          {(connection || valueAsOf !== undefined) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2">
              {connection && <ConnectionStatus connection={connection} />}
              {valueAsOf !== undefined && (
                <LastUpdated
                  at={valueAsOf}
                  kind={isLinked ? "linked_balance" : "manual_balance"}
                  label="Valued"
                />
              )}
              {unpricedHoldings > 0 && (
                <span
                  className="text-xs text-amber-600 dark:text-amber-500"
                  title="These positions have never had a price fetched, so they contribute nothing to the total."
                >
                  {unpricedHoldings} unpriced
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
