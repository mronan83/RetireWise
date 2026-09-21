import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { getAccounts } from "@/lib/queries/accounts";
import { hasTaxableAccount } from "@/lib/utils/taxability";
import { AnalysisCards } from "./analysis-cards";

/**
 * The card grid is client-side — it dispatches chat events and opens report
 * windows. What the household actually holds is not, so the page reads that
 * here and hands it down.
 *
 * The one thing it needs to know is whether any account is taxable, because
 * tax-loss harvesting is undefined without one and the card should say so
 * rather than let the question be asked and answered with a shrug.
 */
export default async function AnalysisPage() {
  return withHousehold(() => AnalysisPageContent());
}

async function AnalysisPageContent() {
  const { dataClerkId: userId } = await getAuthContext();
  const accountsList = await getAccounts(userId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Analysis</h1>
        <p className="text-muted-foreground">
          Click any card to chat, or use the report button for a full infographic
        </p>
      </div>

      <AnalysisCards hasTaxableAccount={hasTaxableAccount(accountsList)} />
    </div>
  );
}
