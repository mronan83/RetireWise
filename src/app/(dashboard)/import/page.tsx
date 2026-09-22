import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { debts, cashReserves } from "@/lib/db/schema";
import { getAccounts } from "@/lib/queries/accounts";
import { CsvImportForm } from "./csv-import-form";

export default async function ImportPage() {
  return withHousehold(() => ImportPageContent());
}

async function ImportPageContent() {
  const { dataClerkId: userId } = await getAuthContext();

  const db = getDb();
  // Offered as targets for a statement balance, so an upload can update the
  // account it belongs to instead of adding a second copy of it.
  const [accountsList, debtsList, cashList] = await Promise.all([
    getAccounts(userId),
    db.select().from(debts).where(eq(debts.clerkId, userId)),
    db.select().from(cashReserves).where(eq(cashReserves.clerkId, userId)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground">
          Upload a CSV, QFX or OFX file. Holdings go to an investment account;
          a credit card, loan or bank statement updates your net worth.
        </p>
      </div>
      <CsvImportForm
        accounts={accountsList}
        debts={debtsList.map((d) => ({
          id: d.id,
          name: d.name,
          balance: Number(d.currentBalance),
          linked: d.plaidAccountId !== null,
        }))}
        cash={cashList.map((c) => ({
          id: c.id,
          name: c.name,
          balance: Number(c.balance),
          linked: c.plaidAccountId !== null,
        }))}
      />
    </div>
  );
}
