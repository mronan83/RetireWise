import Link from "next/link";
import { Landmark, TrendingUp, Home, PiggyBank, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

type Props = {
  investmentTotal: number;
  realEstateEquity: number;
  cashTotal: number;
  debtTotal: number;
};

export function NetWorthCard({
  investmentTotal,
  realEstateEquity,
  cashTotal,
  debtTotal,
}: Props) {
  const totalAssets = investmentTotal + realEstateEquity + cashTotal;
  const netWorth = totalAssets - debtTotal;

  return (
    <Link href="/net-worth">
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Household Net Worth
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
              <span className="text-muted-foreground whitespace-nowrap">{formatCurrency(realEstateEquity)}</span>
            </div>
            <div className="flex items-center gap-1">
              <PiggyBank className="h-3 w-3 shrink-0 text-yellow-500" />
              <span className="text-muted-foreground whitespace-nowrap">{formatCurrency(cashTotal)}</span>
            </div>
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
