import { getAuthContext } from "@/lib/auth-helpers";
import { Link2 } from "lucide-react";
import { getAccounts } from "@/lib/queries/accounts";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getAccountPerformanceMap } from "@/lib/queries/snapshots";
import { AccountCard } from "@/components/dashboard/account-card";
import { FidelityImport } from "@/components/forms/fidelity-import";
import { AddAccountButton } from "./add-account-button";
import { DuplicateReview, type ReviewPair } from "./duplicate-review";
import { findDuplicateCandidates } from "@/lib/accounts/duplicates";

export default async function AccountsPage() {
  const { dataClerkId: userId } = await getAuthContext();

  const [accountsList, allHoldings, periodReturnsMap] = await Promise.all([
    getAccounts(userId),
    getHoldingsByClerkId(userId),
    getAccountPerformanceMap(userId),
  ]);

  // Compute per-account value, cost basis, and gain/loss from holdings
  const accountData: Record<string, { value: number; costBasis: number }> = {};
  for (const h of allHoldings) {
    const entry = accountData[h.accountId] || { value: 0, costBasis: 0 };
    entry.value += Number(h.currentValue);
    entry.costBasis += Number(h.costBasisPerShare) * Number(h.shares);
    accountData[h.accountId] = entry;
  }

  // Surfaced every load, not just after linking: a duplicate that slipped
  // through earlier is still inflating the totals today.
  const duplicatePairs: ReviewPair[] = findDuplicateCandidates(accountsList).map(
    (c) => ({
      ...c,
      linkedValue: accountData[c.linked.id]?.value ?? 0,
      manualValue: accountData[c.manual.id]?.value ?? 0,
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground">
            Your household investment accounts
          </p>
        </div>
        <AddAccountButton />
      </div>

      {duplicatePairs.length > 0 && <DuplicateReview pairs={duplicatePairs} />}

      {accountsList.length > 0 && (
        <FidelityImport accounts={accountsList} />
      )}

      {accountsList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Link2 className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">
            Connect your investment accounts
          </h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Link your brokerage accounts to automatically import holdings and
            track performance, or add them manually.
          </p>
          <div className="mt-6">
            <AddAccountButton />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accountsList.map((account) => {
            const data = accountData[account.id];
            const value = data?.value ?? 0;
            const costBasis = data?.costBasis ?? 0;
            const gainLoss = costBasis > 0 ? value - costBasis : undefined;
            const gainLossPct = costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : undefined;
            const periodReturns = periodReturnsMap.get(account.id);

            return (
              <AccountCard
                key={account.id}
                account={account}
                totalValue={value}
                costBasis={costBasis > 0 ? costBasis : undefined}
                gainLoss={gainLoss}
                gainLossPct={gainLossPct}
                periodReturns={periodReturns}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
