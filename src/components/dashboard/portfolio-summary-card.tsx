import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatGainLoss,
  formatGainLossPct,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";

type Props = {
  totalValue: number;
  selfValue: number;
  spouseValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  dailyChange: number;
  dailyChangePct: number;
  accountCount: number;
  holdingCount: number;
};

export function PortfolioSummaryCards({
  totalValue,
  selfValue,
  spouseValue,
  totalGainLoss,
  totalGainLossPct,
  dailyChange,
  dailyChangePct,
  accountCount,
  holdingCount,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Portfolio
          </CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono">
            {formatCurrency(totalValue)}
          </div>
          {spouseValue > 0 ? (
            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
              <span>Mine: {formatCurrency(selfValue)}</span>
              <span>Spouse: {formatCurrency(spouseValue)}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              {accountCount} accounts &middot; {holdingCount} holdings
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            Total Gain/Loss <HelpTip text="Unrealized gain or loss across all holdings. Calculated as (current value - cost basis). You only realize this gain/loss when you sell." />
          </CardTitle>
          {totalGainLoss >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-bold font-mono",
              totalGainLoss >= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {formatGainLoss(totalGainLoss)}
          </div>
          <p
            className={cn(
              "text-xs mt-1",
              totalGainLoss >= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {formatGainLossPct(totalGainLossPct)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Daily Change
          </CardTitle>
          {dailyChange >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-bold font-mono",
              dailyChange >= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {formatGainLoss(dailyChange)}
          </div>
          <p
            className={cn(
              "text-xs mt-1",
              dailyChange >= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {formatGainLossPct(dailyChangePct)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Accounts
          </CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{accountCount}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {holdingCount} total positions
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
