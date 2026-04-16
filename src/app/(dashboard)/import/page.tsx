import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAccounts } from "@/lib/queries/accounts";
import { CsvImportForm } from "./csv-import-form";

export default async function ImportPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const accountsList = await getAccounts(userId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground">
          Import holdings from CSV files exported from your brokerage
        </p>
      </div>
      <CsvImportForm accounts={accountsList} />
    </div>
  );
}
