import { getAuthContext } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences, socialSecurityBenefits, contributions } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import type { ProjectionInput } from "@/lib/utils/projections";
import { ScenarioRunner } from "./scenario-runner";
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
  const yearsToRetirement = Math.max(0, pref.retirementAge - pref.currentAge);

  // Calculate contributions
  const selfSalary = pref.annualSalary ? Number(pref.annualSalary) : 0;
  const spouseSalary = pref.spouseAnnualSalary ? Number(pref.spouseAnnualSalary) : 0;
  let totalAnnualContributions = 0;
  for (const c of contribs) {
    const salary = c.owner === "self" ? selfSalary : spouseSalary;
    let annual = 0;
    if (c.contributionMethod === "percent_of_salary" && salary > 0) {
      annual = (Number(c.contributionPercent || 0) / 100) * salary;
    } else if (c.contributionMethod === "fixed_amount") {
      const freq: Record<string, number> = {
        per_paycheck_biweekly: 26, per_paycheck_semimonthly: 24,
        monthly: 12, quarterly: 4, annually: 1,
      };
      annual = Number(c.contributionAmount || 0) * (freq[c.frequency] || 1);
    }
    if (c.hasEmployerMatch && salary > 0) {
      const yourPct = c.contributionMethod === "percent_of_salary"
        ? Number(c.contributionPercent || 0)
        : salary > 0 ? (annual / salary) * 100 : 0;
      const matchablePct = Math.min(yourPct, Number(c.employerMatchMaxPercent || 0));
      annual += (matchablePct / 100) * salary * Number(c.employerMatchRate || 0);
    }
    totalAnnualContributions += annual;
  }

  const selfSSMonthly = selfSS[0]?.benefitAtFRA ? Number(selfSS[0].benefitAtFRA) : 0;
  const spouseSSMonthly = spouseSS[0]?.benefitAtFRA ? Number(spouseSS[0].benefitAtFRA) : 0;
  const combinedSSMonthly = selfSSMonthly + spouseSSMonthly;

  const returnByRisk: Record<string, number> = {
    conservative: 5, moderate: 7, aggressive: 9,
  };
  const expectedReturn = returnByRisk[pref.riskTolerance || "moderate"] ?? 7;
  const monthlyExpenses = pref.monthlyExpensesRetirement
    ? Number(pref.monthlyExpensesRetirement) : 7000;

  // Input passed to ScenarioRunner (uses base assumptions)
  const input: ProjectionInput = {
    currentPortfolioValue: totalValue,
    annualContributions: totalAnnualContributions,
    yearsToRetirement,
    expectedReturnPct: expectedReturn,
    inflationPct: 3,
    monthlyExpensesRetirement: monthlyExpenses,
    socialSecurityMonthlyIncome: combinedSSMonthly,
    yearsInRetirement: 30,
  };

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
          const matchingContribs = contribs.filter(
            (c) => c.accountId ? c.accountId === a.id : (c.owner === a.owner && c.accountType === a.accountType)
          );
          let acctAnnualContribution = 0;
          if (a.isActivelyContributing) {
            for (const c of matchingContribs) {
              const salary = c.owner === "self" ? selfSalary : spouseSalary;
              let annual = 0;
              if (c.contributionMethod === "percent_of_salary" && salary > 0) {
                annual = (Number(c.contributionPercent || 0) / 100) * salary;
              } else if (c.contributionMethod === "fixed_amount") {
                const freq: Record<string, number> = {
                  per_paycheck_biweekly: 26, per_paycheck_semimonthly: 24,
                  monthly: 12, quarterly: 4, annually: 1,
                };
                annual = Number(c.contributionAmount || 0) * (freq[c.frequency] || 1);
              }
              if (c.hasEmployerMatch && salary > 0) {
                const yourPct = c.contributionMethod === "percent_of_salary"
                  ? Number(c.contributionPercent || 0)
                  : salary > 0 ? (annual / salary) * 100 : 0;
                const matchablePct = Math.min(yourPct, Number(c.employerMatchMaxPercent || 0));
                annual += (matchablePct / 100) * salary * Number(c.employerMatchRate || 0);
              }
              acctAnnualContribution += annual;
            }
          }

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
            salary,
          };
        }).filter((a) => a.value > 0 || a.annualContribution > 0)}
        currentAge={pref.currentAge}
        retirementAge={pref.retirementAge}
        spouseAge={pref.spouseCurrentAge}
        selfSSAtFRA={selfSSMonthly}
        spouseSSAtFRA={spouseSSMonthly}
        selfFRA={selfSS[0]?.fullRetirementAge || 67}
        spouseFRA={spouseSS[0]?.fullRetirementAge || 67}
        monthlyExpenses={monthlyExpenses}
        annualContributions={totalAnnualContributions}
        savedControls={{
          ssClaimAgeSelf: pref.projectionSSClaimAgeSelf || null,
          ssClaimAgeSpouse: pref.projectionSSClaimAgeSpouse || null,
          monthlySpending: pref.projectionMonthlySpending ? Number(pref.projectionMonthlySpending) : null,
          withdrawalRate: pref.projectionWithdrawalRate ? Number(pref.projectionWithdrawalRate) : null,
          maxWithdrawalAmount: pref.projectionMaxWithdrawalAmount ? Number(pref.projectionMaxWithdrawalAmount) : null,
          retirementYears: pref.projectionRetirementYears || null,
          marketScenario: pref.projectionMarketScenario || null,
        }}
      />

      <ScenarioRunner
        baseInput={input}
        currentAge={pref.currentAge}
        retirementAge={pref.retirementAge}
      />
    </div>
  );
}
