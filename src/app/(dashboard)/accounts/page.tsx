import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Link2, PenLine } from "lucide-react";
import { getAccounts } from "@/lib/queries/accounts";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { AccountCard } from "@/components/dashboard/account-card";
import { FidelityImport } from "@/components/forms/fidelity-import";
import { AddAccountButton } from "./add-account-button";

export default async function AccountsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [accountsList, allHoldings] = await Promise.all([
    getAccounts(userId),
    getHoldingsByClerkId(userId),
  ]);

  const accountValues: Record<string, number> = {};
  for (const h of allHoldings) {
    accountValues[h.accountId] =
      (accountValues[h.accountId] || 0) + Number(h.currentValue);
  }

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
          {accountsList.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              totalValue={accountValues[account.id] || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
