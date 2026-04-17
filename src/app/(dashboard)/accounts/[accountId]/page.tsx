import { getAuthContext } from "@/lib/auth-helpers";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contributions } from "@/lib/db/schema";
import { getAccountById } from "@/lib/queries/accounts";
import { getHoldingsByAccountId } from "@/lib/queries/holdings";
import {
  ACCOUNT_TYPE_LABELS,
  TAX_TREATMENT_LABELS,
  ACCOUNT_OWNER_LABELS,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { calculateGainLoss } from "@/lib/utils/calculations";
import { formatCurrency } from "@/lib/utils/format";
import { AccountActions } from "./account-actions";
import { AddHoldingButton } from "./add-holding-button";
import { LinkedContributions } from "./linked-contributions";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const { dataClerkId: userId } = await getAuthContext();

  const [account, holdingsList, allContributions] = await Promise.all([
    getAccountById(accountId, userId),
    getHoldingsByAccountId(accountId),
    getDb()
      .select()
      .from(contributions)
      .where(eq(contributions.clerkId, userId)),
  ]);

  if (!account) notFound();

  const totalValue = holdingsList.reduce(
    (sum, h) => sum + Number(h.currentValue),
    0
  );

  // Find contributions linked to this account (prefer direct accountId, fall back to owner+type)
  const linkedContribs = allContributions.filter(
    (c) => c.accountId ? c.accountId === account.id : (c.owner === account.owner && c.accountType === account.accountType)
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
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge
              variant={account.owner === "spouse" ? "default" : "secondary"}
            >
              {ACCOUNT_OWNER_LABELS[account.owner]}
            </Badge>
            <Badge variant="secondary">
              {ACCOUNT_TYPE_LABELS[account.accountType]}
            </Badge>
            <Badge variant="outline">
              {TAX_TREATMENT_LABELS[account.taxTreatment]}
            </Badge>
            {!account.isActivelyContributing && (
              <Badge variant="outline" className="text-muted-foreground">
                No active contributions
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {account.institution}
            </span>
          </div>
        </div>
        <AccountActions account={account} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Account Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(totalValue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {holdingsList.length} holdings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Linked Contributions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LinkedContributions
              contributions={linkedContribs}
              account={account}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Holdings</h2>
        <AddHoldingButton accountId={accountId} />
      </div>

      <HoldingsTable holdings={holdingsTableData} />
    </div>
  );
}
