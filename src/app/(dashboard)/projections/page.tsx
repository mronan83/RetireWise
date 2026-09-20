import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences, socialSecurityBenefits, contributions } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { fundedFractionOfYear, totalAnnual } from "@/lib/utils/contributions";
import { InteractiveProjections } from "./interactive-controls";
import { getAccounts } from "@/lib/queries/accounts";
import { buildProjectionAccounts } from "@/lib/projections/build-accounts";
import type { SalaryGrowthConfig } from "@/lib/utils/salary-growth";

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

  const totalValue = holdings.reduce((s, h) => s + Number(h.currentValue), 0);

  // Per-owner retirement years (0-indexed from now)
  const selfYearsToRetirement = Math.max(0, pref.retirementAge - pref.currentAge);
  const spouseYearsToRetirement = (pref.spouseRetirementAge && pref.spouseCurrentAge)
    ? Math.max(0, pref.spouseRetirementAge - pref.spouseCurrentAge)
    : selfYearsToRetirement;
  // Withdrawals begin when the first person retires
  const yearsToRetirement = Math.min(selfYearsToRetirement, spouseYearsToRetirement);

  // Calculate contributions
  const selfSalary = pref.annualSalary ? Number(pref.annualSalary) : 0;
  const spouseSalary = pref.spouseAnnualSalary ? Number(pref.spouseAnnualSalary) : 0;
  const salaryFor = (c: { owner: string }) =>
    c.owner === "self" ? selfSalary : spouseSalary;
  const totalAnnualContributions = totalAnnual(contribs, salaryFor).total;

  const selfSSMonthly = selfSS[0]?.benefitAtFRA ? Number(selfSS[0].benefitAtFRA) : 0;
  const spouseSSMonthly = spouseSS[0]?.benefitAtFRA ? Number(spouseSS[0].benefitAtFRA) : 0;
  const combinedSSMonthly = selfSSMonthly + spouseSSMonthly;

  const monthlyExpenses = pref.monthlyExpensesRetirement
    ? Number(pref.monthlyExpensesRetirement) : 7000;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Retirement Projections</h1>
        <p className="text-muted-foreground">
          Based on your current portfolio, contributions, and goals
        </p>
      </div>

      <InteractiveProjections
        accounts={buildProjectionAccounts({
          accounts: accountsList,
          holdings,
          contribs,
          selfSalary,
          spouseSalary,
          selfSalaryGrowth: pref.salaryGrowth as SalaryGrowthConfig | null,
          spouseSalaryGrowth: pref.spouseSalaryGrowth as SalaryGrowthConfig | null,
          selfCurrentAge: pref.currentAge,
          spouseCurrentAge: pref.spouseCurrentAge,
          selfYearsToRetirement,
          spouseYearsToRetirement,
        })}
        currentAge={pref.currentAge}
        retirementAge={pref.retirementAge}
        spouseAge={pref.spouseCurrentAge}
        spouseRetirementAge={pref.spouseRetirementAge}
        selfSSAtFRA={selfSSMonthly}
        spouseSSAtFRA={spouseSSMonthly}
        selfFRA={selfSS[0]?.fullRetirementAge || 67}
        spouseFRA={spouseSS[0]?.fullRetirementAge || 67}
        monthlyExpenses={monthlyExpenses}
        annualContributions={totalAnnualContributions}
        riskTolerance={pref.riskTolerance ?? undefined}
        savedControls={{
          ssClaimAgeSelf: pref.projectionSSClaimAgeSelf || null,
          ssClaimAgeSpouse: pref.projectionSSClaimAgeSpouse || null,
          monthlySpending: pref.projectionMonthlySpending ? Number(pref.projectionMonthlySpending) : null,
          withdrawalRate: pref.projectionWithdrawalRate ? Number(pref.projectionWithdrawalRate) : null,
          maxWithdrawalAmount: pref.projectionMaxWithdrawalAmount ? Number(pref.projectionMaxWithdrawalAmount) : null,
          retirementYears: pref.projectionRetirementYears || null,
          marketScenario: pref.projectionMarketScenario || null,
          withdrawalMethod: pref.projectionWithdrawalMethod || null,
          glidePathEnabled: pref.glidePathEnabled ?? null,
          glidePathStartProfile: pref.glidePathStartProfile || null,
          glidePathEndProfile: pref.glidePathEndProfile || null,
          glidePathTransitionStartAge: pref.glidePathTransitionStartAge || null,
          glidePathTransitionEndAge: pref.glidePathTransitionEndAge || null,
          glidePathCurve: pref.glidePathCurve || null,
          catchUpEnabled: pref.catchUpEnabled ?? null,
        }}
      />

    </div>
  );
}
