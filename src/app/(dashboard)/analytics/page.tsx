import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { MissingInputs } from "@/components/planning/missing-inputs";
import { givenMonthlySpending, missingPlanningInputs } from "@/lib/planning-inputs";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences, socialSecurityBenefits, contributions } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getAccounts } from "@/lib/queries/accounts";
import { totalAnnual } from "@/lib/utils/contributions";
import { AnalyticsDashboard } from "./analytics-dashboard";
import type { SalaryGrowthConfig } from "@/lib/utils/salary-growth";
import { RETURN_BY_RISK } from "@/lib/utils/risk";
import { runDetailedProjection } from "@/lib/utils/projection-scenarios";
import { buildProjectionAccounts } from "@/lib/projections/build-accounts";
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
  const selfSalary = pref?.annualSalary ? Number(pref.annualSalary) : 0;
  const spouseSalary = pref?.spouseAnnualSalary ? Number(pref.spouseAnnualSalary) : 0;

  // Calculate annual contributions from line items
  const salaryFor = (c: { owner: string }) =>
    c.owner === "self" ? selfSalary : spouseSalary;
  const totalAnnualContributions = totalAnnual(contribs, salaryFor).total;
  const taxDeferredContributions = totalAnnual(
    contribs.filter((c) =>
      ["401k", "403b", "ira_traditional"].includes(c.accountType)
    ),
    salaryFor
  ).total;

  const totalValue = holdings.reduce((s, h) => s + Number(h.currentValue), 0);

  // Categorize by tax treatment
  let taxDeferredBalance = 0;
  let taxFreeBalance = 0;
  let taxableBalance = 0;
  for (const h of holdings) {
    const t = h.accountType;
    if (t === "401k" || t === "403b" || t === "ira_traditional" || t === "pension") {
      taxDeferredBalance += Number(h.currentValue);
    } else if (t === "ira_roth" || t === "hsa") {
      taxFreeBalance += Number(h.currentValue);
    } else {
      taxableBalance += Number(h.currentValue);
    }
  }

  /**
   * The balances at retirement, from the SAME engine the projections page
   * uses.
   *
   * This page used to compute them itself: a flat annuity over
   * totalAnnualContributions, with no salary growth, no contribution pauses,
   * no employer non-elective money and no IRS deferral cap. So the two
   * screens gave different answers for the same household and nothing said
   * so — and every fix to one of them had to be remembered for the other.
   *
   * Returns come from the household's risk tolerance here, matching what the
   * tabs below assume; the projections page lets the reader pick a market
   * scenario, so the two still differ when that is changed. That is a
   * difference the reader chose rather than one the code invented.
   */
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
  const selfYearsToRetirement = Math.max(0, retirementAge - currentAge);
  const spouseYearsToRetirement =
    pref?.spouseCurrentAge && pref?.spouseRetirementAge
      ? Math.max(0, pref.spouseRetirementAge - pref.spouseCurrentAge)
      : selfYearsToRetirement;
  const returnPct = RETURN_BY_RISK[pref?.riskTolerance || "moderate"] ?? 7;

  const projectionAccounts = buildProjectionAccounts({
    accounts: accountsList,
    holdings,
    contribs,
    selfSalary,
    spouseSalary,
    selfSalaryGrowth: (pref?.salaryGrowth as SalaryGrowthConfig | null) ?? null,
    spouseSalaryGrowth: (pref?.spouseSalaryGrowth as SalaryGrowthConfig | null) ?? null,
    selfCurrentAge: currentAge,
    spouseCurrentAge: pref?.spouseCurrentAge,
    selfYearsToRetirement,
    spouseYearsToRetirement,
  });

  const TAX_DEFERRED_TYPES = new Set(["401k", "403b", "ira_traditional", "pension"]);
  const TAX_FREE_TYPES = new Set(["ira_roth", "hsa"]);

  // One year of retirement is enough: everything below only needs the
  // balances at the moment work stops.
  const atRetirement = runDetailedProjection({
    accounts: projectionAccounts,
    totalAnnualContributions,
    yearsToRetirement: selfYearsToRetirement,
    yearsInRetirement: 1,
    startAge: currentAge,
    returnPct,
    inflationPct: 3,
    // Only the balances before retirement are read below, which spending
    // does not touch; zero rather than a guess when it is not given.
    annualExpenses: (monthlyExpenses ?? 0) * 12,
    annualSSIncome: 0,
    ssStartYear: 999,
  });

  const lastAccumulationYear = Math.max(0, selfYearsToRetirement - 1);
  const balanceAt = (types: Set<string>) =>
    atRetirement.accountProjections
      .filter((ap) => types.has(ap.accountType))
      .reduce((sum, ap) => sum + (ap.projectedValues[lastAccumulationYear] ?? ap.currentValue), 0);

  const projectedTaxDeferred = selfYearsToRetirement > 0 ? balanceAt(TAX_DEFERRED_TYPES) : taxDeferredBalance;
  const projectedTaxFree = selfYearsToRetirement > 0 ? balanceAt(TAX_FREE_TYPES) : taxFreeBalance;
  const projectedPortfolio =
    selfYearsToRetirement > 0
      ? atRetirement.totalValues[lastAccumulationYear] ?? totalValue
      : totalValue;

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
        projectedTaxDeferred={projectedTaxDeferred}
        projectedTaxFree={projectedTaxFree}
        projectedPortfolio={projectedPortfolio}
        spouseAge={pref?.spouseCurrentAge || null}
        spouseRetirementAge={pref?.spouseRetirementAge || null}
        selfSalary={selfSalary}
        spouseSalary={spouseSalary}
        selfSSAtFRA={selfSS[0]?.benefitAtFRA ? Number(selfSS[0].benefitAtFRA) : 0}
        spouseSSAtFRA={spouseSS[0]?.benefitAtFRA ? Number(spouseSS[0].benefitAtFRA) : 0}
        selfFRA={selfSS[0]?.fullRetirementAge || 67}
        spouseFRA={spouseSS[0]?.fullRetirementAge || 67}
        taxDeferredBalance={taxDeferredBalance}
        taxFreeBalance={taxFreeBalance}
        taxableBalance={taxableBalance}
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
