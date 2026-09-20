import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getAccounts } from "@/lib/queries/accounts";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { calculateGainLoss } from "@/lib/utils/calculations";
import { AddHoldingPageButton } from "./add-holding-button";

export default async function HoldingsPage() {
  return withHousehold(() => HoldingsPageContent());
}

async function HoldingsPageContent() {
  const { dataClerkId: userId } = await getAuthContext();

  const [holdingsWithAccounts, accountsList] = await Promise.all([
    getHoldingsByClerkId(userId),
    getAccounts(userId),
  ]);

  const holdingsTableData = holdingsWithAccounts.map((h) => {
    const { gainLoss, gainLossPct } = calculateGainLoss(h);
    return {
      id: h.id,
      ticker: h.ticker,
      name: h.name,
      assetClass: h.assetClass,
      shares: h.shares,
      costBasisPerShare: h.costBasisPerShare,
      currentPrice: h.currentPrice,
      currentValue: h.currentValue,
      accountName: h.accountName,
      gainLoss,
      gainLossPct,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Holdings</h1>
          <p className="text-muted-foreground">
            All positions across your accounts
          </p>
        </div>
        <AddHoldingPageButton accounts={accountsList} />
      </div>
      <HoldingsTable holdings={holdingsTableData} />
    </div>
  );
}
