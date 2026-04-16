import { tool } from "ai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { userPreferences, socialSecurityBenefits, contributions } from "../db/schema";
import { getHoldingsByClerkId } from "../queries/holdings";
import {
  calculateProjection,
  runMonteCarlo,
  calculateWithdrawalStrategies,
  type ProjectionInput,
} from "../utils/projections";

export const runRetirementProjectionTool = tool({
  description:
    "Run a full retirement projection including deterministic forecast, Monte Carlo simulation (1000 scenarios), and withdrawal strategy comparison. Uses the household's actual portfolio value, contributions, Social Security, and preferences.",
  inputSchema: z.object({
    overrideReturnPct: z
      .number()
      .optional()
      .describe("Override expected annual return %. Default based on risk tolerance."),
    overrideInflationPct: z
      .number()
      .optional()
      .describe("Override inflation %. Default 3%."),
    scenarioName: z
      .string()
      .optional()
      .describe("Label for this scenario (e.g., 'Base case', 'Early retirement')"),
  }),
  execute: async ({
    overrideReturnPct,
    overrideInflationPct,
    scenarioName = "Base Case",
  }) => {
    const { userId } = await auth();
    if (!userId) return { error: "Not authenticated" };

    const db = getDb();
    const [holdings, prefs, selfSS, spouseSS, contribs] = await Promise.all([
      getHoldingsByClerkId(userId),
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
    if (!pref?.currentAge || !pref?.retirementAge) {
      return { error: "Please set your age and retirement age in Settings first." };
    }

    const totalValue = holdings.reduce((s, h) => s + Number(h.currentValue), 0);
    const yearsToRetirement = Math.max(0, pref.retirementAge - pref.currentAge);

    // Calculate annual contributions from line items
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
      // Add employer match
      if (c.hasEmployerMatch && salary > 0) {
        const yourPct = c.contributionMethod === "percent_of_salary"
          ? Number(c.contributionPercent || 0)
          : salary > 0 ? (annual / salary) * 100 : 0;
        const matchablePct = Math.min(yourPct, Number(c.employerMatchMaxPercent || 0));
        annual += (matchablePct / 100) * salary * Number(c.employerMatchRate || 0);
      }
      totalAnnualContributions += annual;
    }

    // Social Security combined monthly
    const selfSSMonthly = selfSS[0]?.benefitAtFRA ? Number(selfSS[0].benefitAtFRA) : 0;
    const spouseSSMonthly = spouseSS[0]?.benefitAtFRA ? Number(spouseSS[0].benefitAtFRA) : 0;
    const combinedSSMonthly = selfSSMonthly + spouseSSMonthly;

    // Expected return based on risk tolerance
    const returnByRisk: Record<string, number> = {
      conservative: 5,
      moderate: 7,
      aggressive: 9,
    };
    const expectedReturn = overrideReturnPct ?? returnByRisk[pref.riskTolerance || "moderate"] ?? 7;
    const inflation = overrideInflationPct ?? 3;

    const monthlyExpenses = pref.monthlyExpensesRetirement
      ? Number(pref.monthlyExpensesRetirement)
      : 7000;

    const input: ProjectionInput = {
      currentPortfolioValue: totalValue,
      annualContributions: totalAnnualContributions,
      yearsToRetirement,
      expectedReturnPct: expectedReturn,
      inflationPct: inflation,
      monthlyExpensesRetirement: monthlyExpenses,
      socialSecurityMonthlyIncome: combinedSSMonthly,
      yearsInRetirement: 30,
    };

    // Run deterministic projection
    const projection = calculateProjection(input, pref.currentAge);

    // Run Monte Carlo
    const monteCarlo = runMonteCarlo(input, pref.currentAge, 1000);

    // Withdrawal strategy comparison
    let taxDeferredBalance = 0;
    let taxFreeBalance = 0;
    let taxableBalance = 0;
    for (const h of holdings) {
      const val = Number(h.currentValue);
      // Need account tax treatment - use accountType as proxy
      const acctType = h.accountType;
      if (acctType === "401k" || acctType === "403b" || acctType === "ira_traditional" || acctType === "pension") {
        taxDeferredBalance += val;
      } else if (acctType === "ira_roth" || acctType === "hsa") {
        taxFreeBalance += val;
      } else {
        taxableBalance += val;
      }
    }

    // Project balances forward to retirement (rough)
    const growthFactor = Math.pow(1 + expectedReturn / 100, yearsToRetirement);
    const withdrawalStrategies = calculateWithdrawalStrategies({
      taxDeferredBalance: taxDeferredBalance * growthFactor,
      taxFreeBalance: taxFreeBalance * growthFactor,
      taxableBalance: taxableBalance * growthFactor,
      annualExpenses: monthlyExpenses * 12,
      annualSSIncome: combinedSSMonthly * 12,
      yearsInRetirement: 30,
      returnRate: expectedReturn / 100,
      startAge: pref.retirementAge,
    });

    return {
      scenario: scenarioName,
      assumptions: {
        currentAge: pref.currentAge,
        retirementAge: pref.retirementAge,
        yearsToRetirement,
        currentPortfolio: Math.round(totalValue),
        annualContributions: Math.round(totalAnnualContributions),
        expectedReturnPct: expectedReturn,
        inflationPct: inflation,
        monthlyExpensesRetirement: monthlyExpenses,
        combinedSSMonthlyAtFRA: combinedSSMonthly,
      },
      projection: {
        portfolioAtRetirement: projection.portfolioAtRetirement,
        portfolioAtRetirementReal: projection.portfolioAtRetirementReal,
        totalContributed: projection.totalContributed,
        totalGrowth: projection.totalGrowth,
        monthlyIncomeFromPortfolio: projection.monthlyIncomeFromPortfolio,
        totalMonthlyRetirementIncome: projection.totalMonthlyRetirementIncome,
        canSustainRetirement: projection.canSustainRetirement,
        yearsPortfolioLasts: projection.yearsPortfolioLasts,
      },
      monteCarlo: {
        successRate: monteCarlo.successRate,
        medianAtRetirement: monteCarlo.medianAtRetirement,
        worstCase5thPercentile: monteCarlo.worstCase,
        bestCase95thPercentile: monteCarlo.bestCase,
        description: `${monteCarlo.successRate}% of 1,000 simulated scenarios result in your money lasting through retirement.`,
      },
      withdrawalStrategies: withdrawalStrategies.map((s) => ({
        name: s.name,
        description: s.description,
        totalTaxesPaid: s.totalTaxesPaid,
        portfolioAtEnd: s.portfolioAtEnd,
        taxSavingsVsConventional: s.name === "Conventional" ? 0 :
          withdrawalStrategies[0].totalTaxesPaid - s.totalTaxesPaid,
      })),
    };
  },
});
