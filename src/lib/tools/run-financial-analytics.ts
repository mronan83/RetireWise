import { tool } from "ai";
import { describeMissing, givenMonthlySpending, missingPlanningInputs, type PlanningField } from "@/lib/planning-inputs";
import { z } from "zod";
import { getApiUserId } from "@/lib/auth-helpers";
import { totalAnnual } from "../utils/contributions";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { userPreferences, socialSecurityBenefits, contributions } from "../db/schema";
import { getHoldingsByClerkId } from "../queries/holdings";
import {
  projectRMDs,
  RMD_START_AGE,
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
import { RETURN_BY_RISK } from "@/lib/utils/risk";
import { loadTaxTable } from "@/lib/tax/load";


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
    // Holdings are keyed by the household id, not the signed-in account's own
    // id; the raw id reads back an empty portfolio instead of an error.
    const userId = await getApiUserId();
    if (!userId) return { error: "Not authenticated" };

    const db = getDb();
    const [holdings, prefs, selfSS, spouseSS, contribs, taxTable] = await Promise.all([
      getHoldingsByClerkId(userId),
      db.select().from(userPreferences).where(eq(userPreferences.clerkId, userId)).limit(1),
      db.select().from(socialSecurityBenefits).where(
        and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "self"))
      ).limit(1),
      db.select().from(socialSecurityBenefits).where(
        and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "spouse"))
      ).limit(1),
      db.select().from(contributions).where(eq(contributions.clerkId, userId)),
      // The same brackets and Medicare figures the analytics page uses. The
      // advisor quoting a different year than the screen would be worse
      // than either being stale.
      loadTaxTable(),
    ]);

    const pref = prefs[0];

    // Ask for what an analysis needs rather than assume it, as the Analytics
    // page does. These used to default to age 42, retiring at 65 and $7,000
    // a month, and the assistant would quote the results as the household's.
    const needed: PlanningField[] =
      analysis === "fee_impact" || analysis === "ss_break_even"
        ? []
        : analysis === "sequence_risk"
          ? ["currentAge", "retirementAge", "monthlyExpensesRetirement"]
          : ["currentAge", "retirementAge"];
    const missing = missingPlanningInputs(pref, needed);
    if (missing.length > 0) return { error: describeMissing(missing), missingInputs: missing };

    // Read only by analyses that have just checked they are given.
    const currentAge = pref?.currentAge ?? 0;
    const retirementAge = pref?.retirementAge ?? currentAge;
    const returnPct = RETURN_BY_RISK[pref?.riskTolerance || "moderate"] || 7;
    const yearsToRetirement = Math.max(0, retirementAge - currentAge);
    const selfSalary = pref?.annualSalary ? Number(pref.annualSalary) : 0;
    const spouseSalary = pref?.spouseAnnualSalary ? Number(pref.spouseAnnualSalary) : 0;
    const selfSSMonthly = selfSS[0]?.benefitAtFRA ? Number(selfSS[0].benefitAtFRA) : 0;
    const spouseSSMonthly = spouseSS[0]?.benefitAtFRA ? Number(spouseSS[0].benefitAtFRA) : 0;
    const monthlyExpenses = givenMonthlySpending(pref) ?? 0;

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
    const totalAnnualContrib = totalAnnual(contribs, (c) =>
      c.owner === "self" ? selfSalary : spouseSalary
    ).total;

    // Project balances forward accounting for contributions.
    //
    // The tax-deferred share used to be a flat 0.6 — "~60% of contribs go to
    // tax-deferred" — which is a guess about a household whose actual split
    // is recorded right here. Someone contributing only to a Roth had 60% of
    // it counted as tax-deferred anyway, and every RMD figure downstream
    // inherited that.
    const TAX_DEFERRED_TYPES = new Set(["401k", "403b", "ira_traditional", "pension"]);
    const taxDeferredContrib = totalAnnual(
      contribs.filter((c) => TAX_DEFERRED_TYPES.has(c.accountType)),
      (c) => (c.owner === "self" ? selfSalary : spouseSalary)
    ).total;

    const growthFactor = Math.pow(1 + returnPct / 100, yearsToRetirement);
    const annuityFactor =
      returnPct > 0 ? (growthFactor - 1) / (returnPct / 100) : yearsToRetirement;
    const projectedTaxDeferred = taxDeferredBalance * growthFactor + taxDeferredContrib * annuityFactor;
    const projectedPortfolio = totalValue * growthFactor + totalAnnualContrib * annuityFactor;

    const startYear = new Date().getFullYear();

    switch (analysis) {
      case "rmd": {
        const rmds = projectRMDs({
          taxDeferredBalance: projectedTaxDeferred,
          currentAge: retirementAge,
          returnPct,
          yearsToProject: 25,
          startYear: startYear + yearsToRetirement,
          otherTaxableIncome: (selfSSMonthly + spouseSSMonthly) * 12 * 0.85,
          taxTable,
        });
        const totalRMDs = rmds.reduce((s, r) => s + r.rmdAmount, 0);
        const totalTax = rmds.reduce((s, r) => s + r.taxEstimate, 0);
        // rmds[0] is the RETIREMENT-age row, where no distribution is
        // required and the balance has not yet grown. The advisor was
        // quoting both under an "at 73" label.
        const firstRequired = rmds.find((r) => r.age >= RMD_START_AGE);
        return {
          analysis: "RMD Projections",
          taxYear: taxTable.taxYear,
          projectedTaxDeferredAt73: Math.round(firstRequired?.beginningBalance ?? 0),
          firstRMD: Math.round(firstRequired?.rmdAmount ?? 0),
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
        const tax = estimateTaxMFJ(totalIncome, taxTable);
        const marginal = getMarginalRate(totalIncome, taxTable);
        const bracket = getRemainingInBracket(totalIncome, taxTable);
        return {
          analysis: "Retirement Income Tax Projection",
          taxYear: taxTable.taxYear,
          taxTableSource: taxTable.source,
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
        // Projected balances, and Social Security counted only once it is
        // claimed — the gap between retiring and claiming is when conversions
        // are cheapest, and assuming income there hid the opportunity.
        const ssAnnual = (selfSSMonthly + spouseSSMonthly) * 12 * 0.85;
        const ssClaimAge = Math.max(selfSS[0]?.fullRetirementAge ?? 67, retirementAge);
        const ladder = calculateRothConversionLadder({
          currentAge, retirementAge, rmdStartAge: RMD_START_AGE,
          taxDeferredBalance: projectedTaxDeferred,
          rothBalance: taxFreeBalance * growthFactor,
          otherTaxableIncomeForAge: (age: number) => (age >= ssClaimAge ? ssAnnual : 0),
          returnPct, targetBracketRate: 0.22,
          startYear,
          taxTable,
        });
        const totalConverted = ladder[ladder.length - 1]?.cumulativeConverted || 0;
        const totalTax = ladder.reduce((s, r) => s + r.taxOnConversion, 0);
        return {
          analysis: "Roth Conversion Ladder",
          taxYear: taxTable.taxYear,
          conversionWindow: `Age ${Math.max(currentAge, retirementAge)} to ${RMD_START_AGE}`,
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
          topFeeHoldings: result.holdings.filter((h) => h.expenseRatio !== null).slice(0, 10),
          holdingsWithUnknownFees: result.unknownFeeCount,
          valueWithUnknownFees: result.unknownFeeValue,
          note: result.unknownFeeCount > 0
            ? "Holdings whose fund fee is not known are left out of every figure here; say so rather than estimate them."
            : undefined,
          tip: "Look for lower-cost index fund alternatives. Moving from 0.5% to 0.03% saves tens of thousands over 30 years.",
        };
      }

      case "sequence_risk": {
        const annualWithdrawal = monthlyExpenses * 12 - (selfSSMonthly + spouseSSMonthly) * 12;
        const result = calculateSequenceRisk({
          portfolioAtRetirement: projectedPortfolio,
          annualWithdrawal: Math.max(0, annualWithdrawal),
          years: 30,
          inflationPct: 3,
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
          taxTable,
        });
        const totalLifetime = costs.reduce((s, c) => s + c.totalAnnual, 0);
        return {
          analysis: "Healthcare Cost Projections",
          year1Cost: costs[0]?.totalAnnual || 0,
          year10Cost: costs[9]?.totalAnnual || 0,
          thirtyYearTotal: Math.round(totalLifetime),
          preMedicareCost: costs.filter((c) => c.phase === "pre-medicare").reduce((s, c) => s + c.totalAnnual, 0),
          medicareCost: costs.filter((c) => c.phase === "medicare").reduce((s, c) => s + c.totalAnnual, 0),
          taxYear: taxTable.taxYear,
          // Was a hard-coded "$206k", which was not the 2025 threshold and
          // would not have been any year's for long. The first tier's top
          // IS the threshold, so read it rather than restate it.
          tip: `Pre-Medicare healthcare (before 65) is expensive. Budget $1,000-1,500/mo per person. IRMAA surcharges apply above $${Math.round(
            (taxTable.irmaaTiers[0]?.upTo ?? 0) / 1000
          )}k of MAGI (${taxTable.taxYear} MFJ).`,
        };
      }

      case "all_summary": {
        const portfolioWithdrawal = projectedPortfolio * (withdrawalRate / 100);
        const ssAnnual = (selfSSMonthly + spouseSSMonthly) * 12;
        const tax = estimateTaxMFJ(portfolioWithdrawal + ssAnnual * 0.85, taxTable);
        const fees = calculateFeeImpact(
          holdings.map((h) => ({ ticker: h.ticker, currentValue: Number(h.currentValue) })), returnPct
        );
        const healthCosts = projectHealthcareCosts({
          currentAge, retirementAge, yearsToProject: 30,
          annualRetirementIncome: portfolioWithdrawal + ssAnnual, inflationPct: 3,
          taxTable,
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
