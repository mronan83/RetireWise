import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatGainLoss,
  formatGainLossPct,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { LastUpdated } from "@/components/ui/last-updated";

type Props = {
  totalValue: number;
  selfValue: number;
  spouseValue: number;
  /** Null when any position has no reported cost basis. */
  totalGainLoss: number | null;
  totalGainLossPct: number | null;
  /** How many positions the institution gave no cost basis for. */
  positionsWithoutBasis?: number;
  dailyChange: number;
  dailyChangePct: number;
  accountCount: number;
  holdingCount: number;
  /**
   * The OLDEST price behind this total, not the newest.
   *
   * A total inherits the staleness of its worst input: nine positions priced
   * this morning and one priced last month produce a figure that is wrong by
   * whatever that position has done since. Showing the newest timestamp would
   * describe the total as fresher than it is.
   */
  pricesAsOf?: Date | string | null;
};

export function PortfolioSummaryCards({
  totalValue,
  selfValue,
  spouseValue,
  totalGainLoss,
  totalGainLossPct,
  positionsWithoutBasis = 0,
  dailyChange,
  dailyChangePct,
  accountCount,
  holdingCount,
  pricesAsOf,
}: Props) {
  // A portfolio-wide gain needs a portfolio-wide cost. With any position's
  // basis missing, the sum of the rest is below the true cost and the gain
  // comes out too high — so there is no figure here rather than a flattering
  // one.
  const hasGain = totalGainLoss !== null && totalGainLossPct !== null;
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
          {pricesAsOf !== undefined && (
            <LastUpdated
              at={pricesAsOf}
              kind="price"
              label="Priced as of"
              className="mt-1.5"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            Total Gain/Loss <HelpTip text="Unrealized gain or loss across all holdings. Calculated as (current value - cost basis). You only realize this gain/loss when you sell." />
          </CardTitle>
          {hasGain &&
            (totalGainLoss! >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            ))}
        </CardHeader>
        <CardContent>
          {hasGain ? (
            <>
              <div
                className={cn(
                  "text-2xl font-bold font-mono",
                  totalGainLoss! >= 0 ? "text-green-500" : "text-red-500"
                )}
              >
                {formatGainLoss(totalGainLoss!)}
              </div>
              <p
                className={cn(
                  "text-xs mt-1",
                  totalGainLoss! >= 0 ? "text-green-500" : "text-red-500"
                )}
              >
                {formatGainLossPct(totalGainLossPct!)}
              </p>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono text-muted-foreground">
                &mdash;
              </div>
              <p className="text-xs mt-1 text-muted-foreground">
                {positionsWithoutBasis > 0
                  ? `${positionsWithoutBasis} position${positionsWithoutBasis === 1 ? "" : "s"} without a reported cost basis`
                  : "No cost basis recorded"}
              </p>
            </>
          )}
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
