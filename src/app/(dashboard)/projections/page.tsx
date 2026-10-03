import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences, socialSecurityBenefits, contributions } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { InteractiveProjections } from "./interactive-controls";
import { getAccounts } from "@/lib/queries/accounts";
import { projectionSetupFromRows } from "@/lib/projections/household";

export default async function ProjectionsPage() {
  return withHousehold(() => ProjectionsPageContent());
}

async function ProjectionsPageContent() {
  const { dataClerkId: userId } = await getAuthContext();

  const db = getDb();
  const [holdings, prefs, selfSS, spouseSS, contribs, accountsList] = await Promise.all([
    getHoldingsByClerkId(userId),
    db.select().from(userPreferences).where(eq(userPreferences.clerkId, userId)).limit(1),
    db.select().from(socialSecurityBenefits).where(
      and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "self"))
    ).limit(1),
    db.select().from(socialSecurityBenefits).where(
      and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "spouse"))
    ).limit(1),
    db.select().from(contributions).where(eq(contributions.clerkId, userId)),
    getAccounts(userId),
  ]);

  const pref = prefs[0];

  if (!pref?.currentAge || !pref?.retirementAge) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Retirement Projections</h1>
          <p className="text-muted-foreground">Model your retirement timeline</p>
        </div>
        <div className="rounded-lg border border-dashed p-12 text-center">
          <h3 className="text-lg font-semibold">Set up your preferences first</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Go to Settings and fill in your age, retirement age, and monthly expenses
            to run retirement projections.
          </p>
          <a href="/settings" className="mt-4 inline-block text-primary underline text-sm">
            Go to Settings
          </a>
        </div>
      </div>
    );
  }

  // The same setup the AI assistant's projection tool builds, from the same rows.
  const setup = projectionSetupFromRows({
    pref,
    accounts: accountsList,
    holdings,
    contribs,
    selfSS: selfSS[0],
    spouseSS: spouseSS[0],
  })!;
  const { household } = setup;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Retirement Projections</h1>
        <p className="text-muted-foreground">
          Based on your current portfolio, contributions, and goals
        </p>
      </div>

      <InteractiveProjections
        accounts={household.accounts}
        currentAge={household.currentAge}
        retirementAge={household.retirementAge}
        spouseAge={household.spouseAge}
        spouseRetirementAge={pref.spouseRetirementAge}
        selfSSAtFRA={household.selfSSAtFRA}
        spouseSSAtFRA={household.spouseSSAtFRA}
        selfFRA={household.selfFRA}
        spouseFRA={household.spouseFRA}
        monthlyExpenses={household.monthlyExpenses}
        annualContributions={household.annualContributions}
        riskTolerance={household.riskTolerance}
        savedControls={setup.saved}
      />

    </div>
  );
}
