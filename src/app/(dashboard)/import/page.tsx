import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { getAccounts } from "@/lib/queries/accounts";
import { CsvImportForm } from "./csv-import-form";

export default async function ImportPage() {
  return withHousehold(() => ImportPageContent());
}

async function ImportPageContent() {
  const { dataClerkId: userId } = await getAuthContext();

  const accountsList = await getAccounts(userId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground">
          Import holdings from CSV or QFX files exported from your brokerage
        </p>
      </div>
      <CsvImportForm accounts={accountsList} />
    </div>
  );
}
