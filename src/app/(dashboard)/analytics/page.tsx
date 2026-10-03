import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { MissingInputs } from "@/components/planning/missing-inputs";
import { givenMonthlySpending, missingPlanningInputs } from "@/lib/planning-inputs";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences, socialSecurityBenefits, contributions } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getAccounts } from "@/lib/queries/accounts";
import { AnalyticsDashboard } from "./analytics-dashboard";
import { balancesAtRetirement } from "@/lib/projections/at-retirement";
import { loadTaxTable } from "@/lib/tax/load";
import { TaxYearBadge } from "@/components/ui/tax-year-badge";

export default async function AnalyticsPage() {
  return withHousehold(() => AnalyticsPageContent());
}

async function AnalyticsPageContent() {
  const { dataClerkId: userId } = await getAuthContext();

  const db = getDb();
  const [holdings, accountsList, prefs, selfSS, spouseSS, contribs, taxTable] = await Promise.all([
    getHoldingsByClerkId(userId),
    getAccounts(userId),
    db.select().from(userPreferences).where(eq(userPreferences.clerkId, userId)).limit(1),
    db.select().from(socialSecurityBenefits).where(
      and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "self"))
    ).limit(1),
    db.select().from(socialSecurityBenefits).where(
      and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "spouse"))
    ).limit(1),
    db.select().from(contributions).where(eq(contributions.clerkId, userId)),
    // Federal brackets, IRMAA tiers, and Medicare base costs, from
    // tax_reference rather than from constants in the analytics engine.
    loadTaxTable(),
  ]);

  const pref = prefs[0];

  // Every analysis here depends on age and when work stops. Without them the
  // page asks, rather than show a plan for an assumed 42-year-old retiring at
  // 65 (Q4 in docs/REQUIREMENTS.md).
  const missing = missingPlanningInputs(pref, ["currentAge", "retirementAge"]);
  if (missing.length > 0 || !pref?.currentAge || !pref?.retirementAge) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Analytics</h1>
          <p className="text-muted-foreground">
            Advanced retirement planning tools driven by your real accounts, contributions, and settings
          </p>
        </div>
        <MissingInputs
          fields={missing}
          intro="Every analysis on this page depends on your age and when you plan to retire."
        />
      </div>
    );
  }
  const currentAge = pref.currentAge;
  const retirementAge = pref.retirementAge;
  // Spending as the household gave it, or null: only the sequence analysis needs it.
  const monthlyExpenses = givenMonthlySpending(pref);

  // Balances today and when work stops, from the tested engine. The
  // assistant's analytics tool starts from the same function, so the two
  // never quote different balances for the same household.
  const balances = balancesAtRetirement({
    pref: { ...pref, currentAge, retirementAge },
    accounts: accountsList,
    holdings,
    contribs,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financial Analytics</h1>
        <p className="text-muted-foreground">
          Advanced retirement planning tools driven by your real accounts, contributions, and settings
        </p>
      </div>

      {/* Every tax figure below is computed with one year's schedule. Which
          year that is, and how old it is, is not something the reader should
          have to guess — or read the source to find out. */}
      <TaxYearBadge table={taxTable} />

      <AnalyticsDashboard
        currentAge={currentAge}
        retirementAge={retirementAge}
        projectedTaxDeferred={balances.atRetirement.taxDeferred}
        projectedTaxFree={balances.atRetirement.taxFree}
        projectedPortfolio={balances.atRetirement.total}
        spouseAge={pref?.spouseCurrentAge || null}
        spouseRetirementAge={pref?.spouseRetirementAge || null}
        selfSalary={balances.selfSalary}
        spouseSalary={balances.spouseSalary}
        selfSSAtFRA={selfSS[0]?.benefitAtFRA ? Number(selfSS[0].benefitAtFRA) : 0}
        spouseSSAtFRA={spouseSS[0]?.benefitAtFRA ? Number(spouseSS[0].benefitAtFRA) : 0}
        selfFRA={selfSS[0]?.fullRetirementAge || 67}
        spouseFRA={spouseSS[0]?.fullRetirementAge || 67}
        taxDeferredBalance={balances.taxDeferred}
        taxFreeBalance={balances.taxFree}
        taxableBalance={balances.taxable}
        holdings={holdings.map((h) => ({
          ticker: h.ticker,
          currentValue: Number(h.currentValue),
        }))}
        riskTolerance={pref?.riskTolerance || "moderate"}
        monthlyExpenses={monthlyExpenses}
        taxTable={taxTable}
      />
    </div>
  );
}
