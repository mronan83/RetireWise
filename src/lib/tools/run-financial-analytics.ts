import { tool } from "ai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { userPreferences, socialSecurityBenefits, contributions } from "../db/schema";
import { getHoldingsByClerkId } from "../queries/holdings";
import {
  projectRMDs,
  calculateRothConversionLadder,
  calculateSSBreakEven,
  calculateCatchUpImpact,
  calculateIncomeReplacement,
  calculateFeeImpact,
  calculateSequenceRisk,
  projectHealthcareCosts,
  estimateTaxMFJ,
  getMarginalRate,
  getRemainingInBracket,
} from "../utils/financial-analytics";

const returnByRisk: Record<string, number> = { conservative: 5, moderate: 7, aggressive: 9 };

export const runFinancialAnalyticsTool = tool({
  description:
    "Run advanced financial analytics including RMD projections, tax analysis, Roth conversion ladder, Social Security break-even, catch-up contribution impact, income replacement ratio, fee impact analysis, sequence of returns risk, and healthcare cost projections. Uses real household data.",
  inputSchema: z.object({
    analysis: z.enum([
      "rmd",
      "tax",
      "roth_conversion",
      "ss_break_even",
      "catch_up",
      "income_replacement",
      "fee_impact",
      "sequence_risk",
      "healthcare",
      "all_summary",
    ]).describe("Which analysis to run"),
    withdrawalRate: z.number().optional().describe("Withdrawal rate % (default 4)"),
  }),
  execute: async ({ analysis, withdrawalRate = 4 }) => {
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
    const currentAge = pref?.currentAge || 42;
    const retirementAge = pref?.retirementAge || 65;
    const returnPct = returnByRisk[pref?.riskTolerance || "moderate"] || 7;
    const yearsToRetirement = Math.max(0, retirementAge - currentAge);
    const selfSalary = pref?.annualSalary ? Number(pref.annualSalary) : 0;
    const spouseSalary = pref?.spouseAnnualSalary ? Number(pref.spouseAnnualSalary) : 0;
    const selfSSMonthly = selfSS[0]?.benefitAtFRA ? Number(selfSS[0].benefitAtFRA) : 0;
    const spouseSSMonthly = spouseSS[0]?.benefitAtFRA ? Number(spouseSS[0].benefitAtFRA) : 0;
    const monthlyExpenses = pref?.monthlyExpensesRetirement ? Number(pref.monthlyExpensesRetirement) : 7000;

    // Categorize by tax treatment
    let taxDeferredBalance = 0;
    let taxFreeBalance = 0;
    let taxableBalance = 0;
    const totalValue = holdings.reduce((s, h) => s + Number(h.currentValue), 0);

    for (const h of holdings) {
      const val = Number(h.currentValue);
      const t = h.accountType;
      if (t === "401k" || t === "403b" || t === "ira_traditional" || t === "pension") {
        taxDeferredBalance += val;
      } else if (t === "ira_roth" || t === "hsa") {
        taxFreeBalance += val;
      } else {
        taxableBalance += val;
      }
    }

    // Calculate annual contributions from line items
    let totalAnnualContrib = 0;
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
      totalAnnualContrib += annual;
    }

    // Project balances forward accounting for contributions
    const projectedTaxDeferred = taxDeferredBalance * Math.pow(1 + returnPct / 100, yearsToRetirement)
      + totalAnnualContrib * 0.6 * ((Math.pow(1 + returnPct / 100, yearsToRetirement) - 1) / (returnPct / 100)); // ~60% of contribs go to tax-deferred
    const projectedPortfolio = totalValue * Math.pow(1 + returnPct / 100, yearsToRetirement)
      + totalAnnualContrib * ((Math.pow(1 + returnPct / 100, yearsToRetirement) - 1) / (returnPct / 100));

    const startYear = new Date().getFullYear();

    switch (analysis) {
      case "rmd": {
        const rmds = projectRMDs({
          taxDeferredBalance: projectedTaxDeferred,
          currentAge: retirementAge,
          returnPct,
          yearsToProject: 25,
          startYear: startYear + yearsToRetirement,
        });
        const totalRMDs = rmds.reduce((s, r) => s + r.rmdAmount, 0);
        const totalTax = rmds.reduce((s, r) => s + r.taxEstimate, 0);
        return {
          analysis: "RMD Projections",
          projectedTaxDeferredAt73: Math.round(rmds[0]?.beginningBalance || 0),
          firstRMD: Math.round(rmds[0]?.rmdAmount || 0),
          totalRMDsOver25Years: Math.round(totalRMDs),
          totalTaxOnRMDs: Math.round(totalTax),
          yearByYear: rmds.slice(0, 15),
          tip: "Consider Roth conversions before 73 to reduce future RMDs and lifetime tax burden.",
        };
      }

      case "tax": {
        const portfolioWithdrawal = projectedPortfolio * (withdrawalRate / 100);
        const ssAnnual = (selfSSMonthly + spouseSSMonthly) * 12;
        const totalIncome = portfolioWithdrawal + ssAnnual * 0.85;
        const tax = estimateTaxMFJ(totalIncome);
        const marginal = getMarginalRate(totalIncome);
        const bracket = getRemainingInBracket(totalIncome);
        return {
          analysis: "Retirement Income Tax Projection",
          portfolioWithdrawal: Math.round(portfolioWithdrawal),
          ssIncome: Math.round(ssAnnual),
          ssTaxablePortion: Math.round(ssAnnual * 0.85),
          totalTaxableIncome: Math.round(totalIncome),
          federalTax: Math.round(tax),
          effectiveRate: Math.round((tax / totalIncome) * 1000) / 10,
          marginalRate: marginal * 100,
          roomInCurrentBracket: Math.round(bracket.roomInBracket),
          nextBracketRate: bracket.nextRate * 100,
          withdrawalRateUsed: withdrawalRate,
        };
      }

      case "roth_conversion": {
        const ladder = calculateRothConversionLadder({
          currentAge, retirementAge, rmdStartAge: 73,
          taxDeferredBalance, rothBalance: taxFreeBalance,
          otherTaxableIncome: (selfSSMonthly + spouseSSMonthly) * 12 * 0.85,
          returnPct, targetBracketRate: 0.22,
          startYear,
        });
        const totalConverted = ladder[ladder.length - 1]?.cumulativeConverted || 0;
        const totalTax = ladder.reduce((s, r) => s + r.taxOnConversion, 0);
        return {
          analysis: "Roth Conversion Ladder",
          conversionWindow: `Age ${Math.max(currentAge, retirementAge)} to 73`,
          totalConverted: Math.round(totalConverted),
          totalTaxOnConversions: Math.round(totalTax),
          remainingTraditionalAt73: Math.round(ladder[ladder.length - 1]?.remainingTraditional || 0),
          rothBalanceAt73: Math.round(ladder[ladder.length - 1]?.rothBalance || 0),
          yearByYear: ladder,
          strategy: "Fill the 22% bracket each year. Converted money grows tax-free forever and reduces future RMDs.",
        };
      }

      case "ss_break_even": {
        const selfBE = calculateSSBreakEven(selfSSMonthly, selfSS[0]?.fullRetirementAge || 67);
        const spouseBE = spouseSSMonthly > 0
          ? calculateSSBreakEven(spouseSSMonthly, spouseSS[0]?.fullRetirementAge || 67)
          : null;
        return {
          analysis: "Social Security Break-Even",
          self: selfBE.map((r) => ({
            claimAge: r.claimingAge,
            monthly: r.monthlyBenefit,
            annual: r.annualBenefit,
            cumulativeAt80: r.cumulativeByAge[80],
            cumulativeAt85: r.cumulativeByAge[85],
            breakEvenVs62: r.breakEvenVs62,
          })),
          spouse: spouseBE?.map((r) => ({
            claimAge: r.claimingAge,
            monthly: r.monthlyBenefit,
            annual: r.annualBenefit,
            breakEvenVs62: r.breakEvenVs62,
          })) || null,
          tip: "If you expect to live past the break-even age, delaying is usually better. Claiming at 70 gives 77% more monthly than 62.",
        };
      }

      case "catch_up": {
        const impact = calculateCatchUpImpact({ currentAge, retirementAge, returnPct, accountType: "401k" });
        const totalExtra = impact[impact.length - 1]?.cumulativeExtra || 0;
        return {
          analysis: "Catch-Up Contribution Impact",
          totalExtraByRetirement: Math.round(totalExtra),
          catchUpStartsAt: 50,
          enhancedCatchUpAges: "60-63",
          regular401kLimit: 23500,
          catchUpAmount50to59: 7500,
          enhancedAmount60to63: 11250,
          yearByYear: impact.filter((c) => c.catchUpAmount > 0),
        };
      }

      case "income_replacement": {
        const result = calculateIncomeReplacement({
          selfSalary, spouseSalary,
          portfolioAtRetirement: projectedPortfolio,
          withdrawalRate,
          selfSSMonthly, spouseSSMonthly, pensionMonthly: 0,
        });
        return { analysis: "Income Replacement Ratio", ...result };
      }

      case "fee_impact": {
        const result = calculateFeeImpact(
          holdings.map((h) => ({ ticker: h.ticker, currentValue: Number(h.currentValue) })),
          returnPct
        );
        return {
          analysis: "Fee Impact",
          weightedExpenseRatio: result.weightedExpenseRatio,
          totalAnnualFees: result.totalAnnualFees,
          thirtyYearDrag: result.thirtyYearCumulativeDrag,
          topFeeHoldings: result.holdings.slice(0, 10),
          tip: "Look for lower-cost index fund alternatives. Moving from 0.5% to 0.03% saves tens of thousands over 30 years.",
        };
      }

      case "sequence_risk": {
        const annualWithdrawal = monthlyExpenses * 12 - (selfSSMonthly + spouseSSMonthly) * 12;
        const result = calculateSequenceRisk({
          portfolioAtRetirement: projectedPortfolio,
          annualWithdrawal: Math.max(0, annualWithdrawal),
          years: 30,
        });
        return {
          analysis: "Sequence of Returns Risk",
          scenarios: result.map((s) => ({
            name: s.scenario,
            description: s.description,
            endBalance: s.endBalance,
            survived: s.survived,
          })),
          tip: "Keep 2-3 years of expenses in cash/bonds to avoid selling stocks during downturns.",
        };
      }

      case "healthcare": {
        const costs = projectHealthcareCosts({
          currentAge, retirementAge, yearsToProject: 30,
          annualRetirementIncome: projectedPortfolio * (withdrawalRate / 100) + (selfSSMonthly + spouseSSMonthly) * 12,
          inflationPct: 3,
        });
        const totalLifetime = costs.reduce((s, c) => s + c.totalAnnual, 0);
        return {
          analysis: "Healthcare Cost Projections",
          year1Cost: costs[0]?.totalAnnual || 0,
          year10Cost: costs[9]?.totalAnnual || 0,
          thirtyYearTotal: Math.round(totalLifetime),
          preMedicareCost: costs.filter((c) => c.phase === "pre-medicare").reduce((s, c) => s + c.totalAnnual, 0),
          medicareCost: costs.filter((c) => c.phase === "medicare").reduce((s, c) => s + c.totalAnnual, 0),
          tip: "Pre-Medicare healthcare (before 65) is expensive. Budget $1,000-1,500/mo per person. IRMAA surcharges apply above $206k income.",
        };
      }

      case "all_summary": {
        const portfolioWithdrawal = projectedPortfolio * (withdrawalRate / 100);
        const ssAnnual = (selfSSMonthly + spouseSSMonthly) * 12;
        const tax = estimateTaxMFJ(portfolioWithdrawal + ssAnnual * 0.85);
        const fees = calculateFeeImpact(
          holdings.map((h) => ({ ticker: h.ticker, currentValue: Number(h.currentValue) })), returnPct
        );
        const healthCosts = projectHealthcareCosts({
          currentAge, retirementAge, yearsToProject: 30,
          annualRetirementIncome: portfolioWithdrawal + ssAnnual, inflationPct: 3,
        });
        const replacement = calculateIncomeReplacement({
          selfSalary, spouseSalary, portfolioAtRetirement: projectedPortfolio,
          withdrawalRate, selfSSMonthly, spouseSSMonthly, pensionMonthly: 0,
        });

        return {
          analysis: "Full Analytics Summary",
          projectedPortfolioAtRetirement: Math.round(projectedPortfolio),
          projectedTaxDeferredAt73: Math.round(projectedTaxDeferred),
          estimatedAnnualTax: Math.round(tax),
          incomeReplacementRatio: replacement.replacementRatio,
          weightedExpenseRatio: fees.weightedExpenseRatio,
          thirtyYearFeeDrag: fees.thirtyYearCumulativeDrag,
          thirtyYearHealthcareCost: healthCosts.reduce((s, c) => s + c.totalAnnual, 0),
          totalAnnualContributions: Math.round(totalAnnualContrib),
          tip: "Run individual analyses (rmd, roth_conversion, ss_break_even, etc.) for detailed recommendations.",
        };
      }
    }
  },
});
