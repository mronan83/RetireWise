import { getAuthContext } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences, socialSecurityBenefits } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getAccounts } from "@/lib/queries/accounts";
import { AnalyticsDashboard } from "./analytics-dashboard";

export default async function AnalyticsPage() {
  const { dataClerkId: userId } = await getAuthContext();

  const db = getDb();
  const [holdings, accountsList, prefs, selfSS, spouseSS] = await Promise.all([
    getHoldingsByClerkId(userId),
    getAccounts(userId),
    db.select().from(userPreferences).where(eq(userPreferences.clerkId, userId)).limit(1),
    db.select().from(socialSecurityBenefits).where(
      and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "self"))
    ).limit(1),
    db.select().from(socialSecurityBenefits).where(
      and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "spouse"))
    ).limit(1),
  ]);

  const pref = prefs[0];
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
          Advanced retirement planning tools and analysis
        </p>
      </div>

      <AnalyticsDashboard
        currentAge={pref?.currentAge || 42}
        retirementAge={pref?.retirementAge || 65}
        spouseAge={pref?.spouseCurrentAge || null}
        spouseRetirementAge={pref?.spouseRetirementAge || null}
        selfSalary={pref?.annualSalary ? Number(pref.annualSalary) : 0}
        spouseSalary={pref?.spouseAnnualSalary ? Number(pref.spouseAnnualSalary) : 0}
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
      />
    </div>
  );
}
