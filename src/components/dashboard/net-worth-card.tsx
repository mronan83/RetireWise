import Link from "next/link";
import { Landmark, TrendingUp, Home, PiggyBank, CreditCard, Car } from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/**
 * Gross assets and every liability — the same basis as the net worth page.
 *
 * This took equity for real estate and vehicles and a debt figure that
 * excluded the loans already netted out of them. The net worth it produced
 * was right; the row of chips under it told the household it owed $12,836.07
 * when the mortgages, the camper and the truck brought the real total to
 * $282,545.22.
 */
type Props = {
  investmentTotal: number;
  realEstateValue: number;
  cashTotal: number;
  vehicleValue?: number;
  /** Every liability, secured or not. */
  debtTotal: number;
};

export function NetWorthCard({
  investmentTotal,
  realEstateValue,
  cashTotal,
  vehicleValue = 0,
  debtTotal,
}: Props) {
  const totalAssets = investmentTotal + realEstateValue + cashTotal + vehicleValue;
  const netWorth = totalAssets - debtTotal;

  return (
    <Link href="/net-worth">
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            Household Net Worth <HelpTip text="Everything you own (investments + real estate + cash + vehicles) minus everything you owe, mortgages and auto loans included. Click for the full breakdown." />
          </CardTitle>
          <Landmark className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-bold font-mono",
              netWorth >= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {formatCurrency(netWorth)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 shrink-0 text-blue-500" />
              <span className="text-muted-foreground whitespace-nowrap">{formatCurrency(investmentTotal)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Home className="h-3 w-3 shrink-0 text-green-500" />
              <span className="text-muted-foreground whitespace-nowrap">{formatCurrency(realEstateValue)}</span>
            </div>
            <div className="flex items-center gap-1">
              <PiggyBank className="h-3 w-3 shrink-0 text-yellow-500" />
              <span className="text-muted-foreground whitespace-nowrap">{formatCurrency(cashTotal)}</span>
            </div>
            {vehicleValue > 0 && (
              <div className="flex items-center gap-1">
                <Car className="h-3 w-3 shrink-0 text-purple-500" />
                <span className="text-muted-foreground whitespace-nowrap">{formatCurrency(vehicleValue)}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <CreditCard className="h-3 w-3 shrink-0 text-red-500" />
              <span className="text-muted-foreground whitespace-nowrap">-{formatCurrency(debtTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
