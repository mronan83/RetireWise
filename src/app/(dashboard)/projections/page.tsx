import { getAuthContext } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences, socialSecurityBenefits, contributions } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { totalAnnual } from "@/lib/utils/contributions";
import { InteractiveProjections } from "./interactive-controls";
import { getAccounts } from "@/lib/queries/accounts";

export default async function ProjectionsPage() {
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
        accounts={accountsList.map((a) => {
          const acctHoldings = holdings.filter((h) => h.accountId === a.id);
          const value = acctHoldings.reduce((s, h) => s + Number(h.currentValue), 0);

          // Match contributions: prefer direct accountId link, fall back to owner+type
          // Retired entries are excluded by totalAnnual, so a contribution
          // left over from a previous job stops inflating this account.
          const matchingContribs = contribs.filter(
            (c) => c.accountId ? c.accountId === a.id : (c.owner === a.owner && c.accountType === a.accountType)
          );
          const acctAnnualContribution = a.isActivelyContributing
            ? totalAnnual(matchingContribs, salaryFor).total
            : 0;

          // Get escalation from matching contributions
          const escalationContrib = matchingContribs.find((c) => c.hasAnnualEscalation);
          const annualEscalation = escalationContrib
            ? Number(escalationContrib.annualEscalationAmount || 0)
            : 0;
          const maxAnnual = escalationContrib?.maxAnnualContribution
            ? Number(escalationContrib.maxAnnualContribution)
            : 0;
          const contribMethod = matchingContribs[0]?.contributionMethod || "fixed_amount";
          const salary = a.owner === "self" ? selfSalary : spouseSalary;

          // Get contribution details for salary-growth-aware projections
          const mainContrib = matchingContribs.filter((c) => c.isActive)[0];
          const contribPct = mainContrib?.contributionMethod === "percent_of_salary"
            ? Number(mainContrib.contributionPercent || 0) : 0;
          const matchRate = mainContrib?.hasEmployerMatch
            ? Number(mainContrib.employerMatchRate || 0) : 0;
          const matchMaxPct = mainContrib?.hasEmployerMatch
            ? Number(mainContrib.employerMatchMaxPercent || 0) : 0;
          // Employer money that is paid regardless of what you defer. Carried
          // separately so it survives a year where the deferral is zero.
          const nonElectivePct = mainContrib?.hasEmployerNonElective
            ? Number(mainContrib.employerNonElectivePercent || 0) : 0;
          const nonElectiveAmount = mainContrib?.hasEmployerNonElective
            ? Number(mainContrib.employerNonElectiveAmount || 0) : 0;
          const salaryGrowthConfig = a.owner === "self"
            ? (pref.salaryGrowth as import("@/lib/utils/salary-growth").SalaryGrowthConfig | null)
            : (pref.spouseSalaryGrowth as import("@/lib/utils/salary-growth").SalaryGrowthConfig | null);

          return {
            name: a.name,
            owner: a.owner,
            type: a.accountType,
            taxTreatment: a.taxTreatment,
            value,
            isActivelyContributing: a.isActivelyContributing,
            annualContribution: Math.round(acctAnnualContribution),
            annualEscalation,
            maxAnnualContribution: maxAnnual,
            contributionMethod: contribMethod,
            contributionPct: contribPct,
            employerMatchRate: matchRate,
            employerMatchMaxPct: matchMaxPct,
            employerNonElectivePct: nonElectivePct,
            employerNonElectiveAmount: nonElectiveAmount,
            salary,
            salaryGrowth: salaryGrowthConfig,
            ownerRetirementYear: a.owner === "spouse" ? spouseYearsToRetirement : selfYearsToRetirement,
            ownerCurrentAge: (a.owner === "spouse" ? (pref.spouseCurrentAge ?? pref.currentAge) : pref.currentAge) ?? undefined,
          };
        }).filter((a) => a.value > 0 || a.annualContribution > 0)}
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
