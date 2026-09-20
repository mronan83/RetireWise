import { tool } from "ai";
import { z } from "zod";
import { getApiUserId } from "@/lib/auth-helpers";
import { RETURN_BY_RISK } from "@/lib/utils/risk";
import { totalAnnual } from "../utils/contributions";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { userPreferences, socialSecurityBenefits, contributions } from "../db/schema";
import { getHoldingsByClerkId } from "../queries/holdings";
import {
  calculateProjection,
  runMonteCarlo,
  calculateWithdrawalStrategies,
  type ProjectionInput,
  type CatchUpSchedule,
} from "../utils/projections";
import {
  type GlidePathConfig,
  type RiskProfileId,
  RISK_PROFILES,
} from "../utils/glide-path";
import { IRS_LIMITS } from "../constants";

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
    // Holdings are keyed by the household id, not the signed-in account's own
    // id; the raw id reads back an empty portfolio instead of an error.
    const userId = await getApiUserId();
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
    const totalAnnualContributions = totalAnnual(contribs, (c) =>
      c.owner === "self" ? selfSalary : spouseSalary
    ).total;

    // Social Security combined monthly
    const selfSSMonthly = selfSS[0]?.benefitAtFRA ? Number(selfSS[0].benefitAtFRA) : 0;
    const spouseSSMonthly = spouseSS[0]?.benefitAtFRA ? Number(spouseSS[0].benefitAtFRA) : 0;
    const combinedSSMonthly = selfSSMonthly + spouseSSMonthly;

    // Expected return based on risk tolerance
    const expectedReturn = overrideReturnPct ?? RETURN_BY_RISK[pref.riskTolerance || "moderate"] ?? 7;
    const inflation = overrideInflationPct ?? 3;

    const monthlyExpenses = pref.monthlyExpensesRetirement
      ? Number(pref.monthlyExpensesRetirement)
      : 7000;

    // Build glide path config if enabled
    let glidePath: GlidePathConfig | undefined;
    if (pref.glidePathEnabled && pref.glidePathStartProfile && pref.glidePathEndProfile) {
      glidePath = {
        enabled: true,
        startProfile: pref.glidePathStartProfile as RiskProfileId,
        endProfile: pref.glidePathEndProfile as RiskProfileId,
        transitionStartAge: pref.glidePathTransitionStartAge ?? Math.max(pref.currentAge, pref.retirementAge - 15),
        transitionEndAge: pref.glidePathTransitionEndAge ?? pref.retirementAge,
        curve: (pref.glidePathCurve as "linear" | "accelerated") ?? "linear",
      };
    }

    // Compute catch-up schedule from contribution account types (respects user toggle)
    const catchUpEnabled = pref.catchUpEnabled !== false;
    let selfCatchUp50 = 0, selfCatchUp60 = 0;
    let spouseCatchUp50 = 0, spouseCatchUp60 = 0;
    if (!catchUpEnabled) {
      // Skip — all catch-up amounts stay at 0
    } else for (const c of contribs) {
      if (!c.isActive) continue;
      const acctType = c.accountType;
      const limits = IRS_LIMITS[acctType];
      if (!limits) continue;
      const cu50 = limits.over50 - limits.under50;
      const cu60 = limits.age60to63 - limits.under50;
      if (c.owner === "self") { selfCatchUp50 += cu50; selfCatchUp60 += cu60; }
      else { spouseCatchUp50 += cu50; spouseCatchUp60 += cu60; }
    }

    const catchUp: CatchUpSchedule = {
      selfAge: pref.currentAge,
      spouseAge: pref.spouseCurrentAge ?? undefined,
      selfCatchUp50,
      selfCatchUp60,
      spouseCatchUp50,
      spouseCatchUp60,
    };

    const input: ProjectionInput = {
      currentPortfolioValue: totalValue,
      annualContributions: totalAnnualContributions,
      yearsToRetirement,
      expectedReturnPct: expectedReturn,
      inflationPct: inflation,
      monthlyExpensesRetirement: monthlyExpenses,
      socialSecurityMonthlyIncome: combinedSSMonthly,
      yearsInRetirement: 30,
      glidePath,
      catchUp,
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
        glidePath: glidePath ? {
          enabled: true,
          startProfile: `${RISK_PROFILES[glidePath.startProfile].label} (${RISK_PROFILES[glidePath.startProfile].returnPct}% return, ${RISK_PROFILES[glidePath.startProfile].volatility}% vol)`,
          endProfile: `${RISK_PROFILES[glidePath.endProfile].label} (${RISK_PROFILES[glidePath.endProfile].returnPct}% return, ${RISK_PROFILES[glidePath.endProfile].volatility}% vol)`,
          transitionAges: `${glidePath.transitionStartAge} → ${glidePath.transitionEndAge}`,
          curve: glidePath.curve,
        } : { enabled: false },
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
