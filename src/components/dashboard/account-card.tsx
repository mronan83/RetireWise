import Link from "next/link";
import { Wallet, TrendingUp, TrendingDown } from "lucide-react";
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
  periodReturns?: Record<string, number | null>;
};

export function AccountCard({
  account,
  totalValue,
  costBasis,
  gainLoss,
  gainLossPct,
  periodReturns,
}: Props) {
  const hasGainLoss = gainLoss !== undefined && costBasis !== undefined && costBasis > 0;
  const isPositive = (gainLoss ?? 0) >= 0;
  const hasPeriodData = periodReturns && Object.values(periodReturns).some((v) => v !== null);

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

          {/* Total gain/loss */}
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
          <p className="mt-1 text-xs text-muted-foreground">
            {account.institution}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
