import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getAccounts } from "@/lib/queries/accounts";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { AccountCard } from "@/components/dashboard/account-card";
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
            Manage your investment accounts
          </p>
        </div>
        <AddAccountButton />
      </div>

      {accountsList.length === 0 ? (
        <div className="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed text-center">
          <Plus className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No accounts yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first investment account to get started.
          </p>
          <div className="mt-4">
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
