import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { Link2 } from "lucide-react";
import { getAccountsWithFreshness } from "@/lib/queries/accounts";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getAccountPerformanceMap } from "@/lib/queries/snapshots";
import { AccountCard } from "@/components/dashboard/account-card";
import { FidelityImport } from "@/components/forms/fidelity-import";
import { AddAccountButton } from "./add-account-button";
import { SyncNowButton } from "@/components/plaid/sync-now-button";
import { DuplicateReview, type ReviewPair } from "./duplicate-review";
import { findDuplicateCandidates } from "@/lib/accounts/duplicates";
import { gainLossFor, missingBasisNote, rollupBasis } from "@/lib/utils/cost-basis";

export default async function AccountsPage() {
  return withHousehold(() => AccountsPageContent());
}

async function AccountsPageContent() {
  const { dataClerkId: userId } = await getAuthContext();

  const [accountsList, allHoldings, periodReturnsMap] = await Promise.all([
    getAccountsWithFreshness(userId),
    getHoldingsByClerkId(userId),
    getAccountPerformanceMap(userId),
  ]);

  /**
   * Per-account value and basis.
   *
   * The basis line was `Number(h.costBasisPerShare) * shares`, and an
   * unreported basis arrives as null — which Number() turns into 0 without
   * complaint. Every employer-plan account therefore reported a cost of
   * zero, or, after the sync started writing a basis equal to market value,
   * a gain of exactly $0.00. rollupBasis keeps unknown as unknown.
   */
  const accountData: Record<string, { value: number; holdings: typeof allHoldings }> = {};
  for (const h of allHoldings) {
    const entry = accountData[h.accountId] || { value: 0, holdings: [] };
    entry.value += Number(h.currentValue);
    entry.holdings.push(h);
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
        <div className="flex flex-col items-end gap-3">
          <AddAccountButton />
          {/* Beside the accounts it refreshes, not buried in settings. */}
          <SyncNowButton />
        </div>
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
            const rollup = rollupBasis(data?.holdings ?? []);
            const gl = gainLossFor(value, rollup.basis);
            const periodReturns = periodReturnsMap.get(account.id);

            return (
              <AccountCard
                key={account.id}
                account={account}
                totalValue={value}
                costBasis={gl?.costBasis}
                gainLoss={gl?.gainLoss}
                gainLossPct={gl?.gainLossPct}
                missingBasisNote={missingBasisNote(rollup)}
                periodReturns={periodReturns}
                connection={account.connection}
                valueAsOf={account.valueAsOf}
                unpricedHoldings={account.unpricedHoldings}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
