import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { getAccountById } from "@/lib/queries/accounts";
import { getHoldingsByAccountId } from "@/lib/queries/holdings";
import { ACCOUNT_TYPE_LABELS, TAX_TREATMENT_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { calculateGainLoss } from "@/lib/utils/calculations";
import { formatCurrency } from "@/lib/utils/format";
import { AccountActions } from "./account-actions";
import { AddHoldingButton } from "./add-holding-button";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getAccountById(accountId, userId);
  if (!account) notFound();

  const holdingsList = await getHoldingsByAccountId(accountId);

  const totalValue = holdingsList.reduce(
    (sum, h) => sum + Number(h.currentValue),
    0
  );

  const holdingsTableData = holdingsList.map((h) => {
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
      accountName: account.name,
      gainLoss,
      gainLossPct,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{account.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">
              {ACCOUNT_TYPE_LABELS[account.accountType]}
            </Badge>
            <Badge variant="outline">
              {TAX_TREATMENT_LABELS[account.taxTreatment]}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {account.institution}
            </span>
          </div>
        </div>
        <AccountActions account={account} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Account Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-mono">
            {formatCurrency(totalValue)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {holdingsList.length} holdings
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Holdings</h2>
        <AddHoldingButton accountId={accountId} />
      </div>

      <HoldingsTable holdings={holdingsTableData} />
    </div>
  );
}
