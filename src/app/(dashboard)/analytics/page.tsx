import { getAuthContext } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences, socialSecurityBenefits, contributions } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getAccounts } from "@/lib/queries/accounts";
import { AnalyticsDashboard } from "./analytics-dashboard";

export default async function AnalyticsPage() {
  const { dataClerkId: userId } = await getAuthContext();

  const db = getDb();
  const [holdings, accountsList, prefs, selfSS, spouseSS, contribs] = await Promise.all([
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
  ]);

  const pref = prefs[0];
  const selfSalary = pref?.annualSalary ? Number(pref.annualSalary) : 0;
  const spouseSalary = pref?.spouseAnnualSalary ? Number(pref.spouseAnnualSalary) : 0;

  // Calculate annual contributions from line items
  let totalAnnualContributions = 0;
  let taxDeferredContributions = 0;
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
        ? Number(c.contributionPercent || 0) : salary > 0 ? (annual / salary) * 100 : 0;
      const matchablePct = Math.min(yourPct, Number(c.employerMatchMaxPercent || 0));
      annual += (matchablePct / 100) * salary * Number(c.employerMatchRate || 0);
    }
    totalAnnualContributions += annual;
    // Track what goes to tax-deferred
    if (["401k", "403b", "ira_traditional"].includes(c.accountType)) {
      taxDeferredContributions += annual;
    }
  }

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financial Analytics</h1>
        <p className="text-muted-foreground">
          Advanced retirement planning tools driven by your real accounts, contributions, and settings
        </p>
      </div>

      <AnalyticsDashboard
        currentAge={pref?.currentAge || 42}
        retirementAge={pref?.retirementAge || 65}
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
        totalPortfolio={totalValue}
        holdings={holdings.map((h) => ({
          ticker: h.ticker,
          currentValue: Number(h.currentValue),
        }))}
        riskTolerance={pref?.riskTolerance || "moderate"}
        monthlyExpenses={pref?.monthlyExpensesRetirement ? Number(pref.monthlyExpensesRetirement) : 7000}
        totalAnnualContributions={Math.round(totalAnnualContributions)}
        taxDeferredContributions={Math.round(taxDeferredContributions)}
      />
    </div>
  );
}
