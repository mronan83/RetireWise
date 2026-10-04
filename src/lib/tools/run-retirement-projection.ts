import { tool } from "ai";
import { z } from "zod";
import { getApiUserId } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { userPreferences, socialSecurityBenefits, contributions } from "../db/schema";
import { getHoldingsByClerkId } from "../queries/holdings";
import { getAccounts } from "../queries/accounts";
import { runDetailedProjection } from "../utils/projection-scenarios";
import { calculateWithdrawalStrategies } from "../utils/withdrawal-strategies";
import { runProjectionMonteCarlo } from "../projections/monte-carlo";
import { projectionSetupFromRows } from "../projections/household";
import { controlsFromSaved, projectionInputs } from "../projections/settings";
import { RISK_PROFILES } from "../utils/glide-path";
import { describeMissing } from "../planning-inputs";

/**
 * The assistant's retirement projection: the same engine, the same inputs
 * and the same seeded markets as the Projections page, read from the controls
 * last saved there. Its figures are the page's figures. Until October 2026 it
 * ran an older engine of its own, which counted Social Security at the full
 * retirement age from the day of retirement, always planned thirty years and
 * taxed with 2024 brackets.
 */
export const runRetirementProjectionTool = tool({
  description:
    "Run the household's retirement projection exactly as the Projections page shows it: the year-by-year forecast, the odds that savings last (500 simulated markets), and a comparison of withdrawal orders. Uses the controls last saved on the Projections page (claiming ages, spending, horizon, market scenario, withdrawal method). Optional overrides change the market assumptions for a what-if.",
  inputSchema: z.object({
    overrideReturnPct: z
      .number()
      .optional()
      .describe("Override the expected annual return %, for a what-if. Default: the saved market scenario."),
    overrideInflationPct: z
      .number()
      .optional()
      .describe("Override inflation %, for a what-if. Default: the saved market scenario."),
    scenarioName: z
      .string()
      .optional()
      .describe("Label for this scenario (e.g., 'Base case', 'Lower returns')"),
  }),
  execute: async ({ overrideReturnPct, overrideInflationPct, scenarioName = "Base Case" }) => {
    // Rows are keyed by the household id, not the signed-in account's own id.
    const userId = await getApiUserId();
    if (!userId) return { error: "Not authenticated" };

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

    const setup = projectionSetupFromRows({
      pref: prefs[0],
      accounts: accountsList,
      holdings,
      contribs,
      selfSS: selfSS[0],
      spouseSS: spouseSS[0],
    });
    // The page asks for missing inputs rather than assume them, and so does the assistant.
    if (!setup.ok) return { error: describeMissing(setup.missing), missingInputs: setup.missing };

    const controls = controlsFromSaved(setup.household, setup.saved);
    const inputs = projectionInputs(setup.household, controls);
    const params = {
      ...inputs.params,
      returnPct: overrideReturnPct ?? inputs.params.returnPct,
      inflationPct: overrideInflationPct ?? inputs.params.inflationPct,
      // An overridden return replaces the glide path rather than being ignored by it.
      glidePath: overrideReturnPct !== undefined ? undefined : inputs.params.glidePath,
    };

    const projection = runDetailedProjection(params);
    const odds = runProjectionMonteCarlo(params, { volatilityPct: inputs.volatilityPct, simulations: 500 });

    const ytr = inputs.yearsToRetirement;
    const atRetirement = projection.totalValues[ytr - 1] ?? projection.totalValues[0] ?? 0;
    const lastYear = projection.totalValues.length - 1;
    const depletedAt = projection.totalValues.findIndex((v, i) => i >= ytr && v <= 0);
    const firstRetirementYear = ytr < projection.withdrawals.length ? ytr : -1;
    const priceLevel = (y: number) => Math.pow(1 + params.inflationPct / 100, y + 1);

    // The withdrawal-order comparison starts from the engine's balances at
    // retirement, by tax treatment, in today's dollars.
    const byTreatment = { tax_deferred: 0, tax_free: 0, taxable: 0 } as Record<string, number>;
    for (const ap of projection.accountProjections) {
      const v = ap.projectedValues[Math.max(0, ytr - 1)] ?? 0;
      byTreatment[ap.taxTreatment in byTreatment ? ap.taxTreatment : "taxable"] += v;
    }
    const deflate = (v: number) => v / priceLevel(Math.max(0, ytr - 1));
    const strategies = calculateWithdrawalStrategies({
      taxDeferredBalance: deflate(byTreatment.tax_deferred),
      taxFreeBalance: deflate(byTreatment.tax_free),
      taxableBalance: deflate(byTreatment.taxable),
      annualExpenses: controls.monthlySpending * 12,
      annualSSIncome: inputs.combinedSSAnnual,
      yearsInRetirement: controls.retirementYears,
      realReturnRate: (1 + params.returnPct / 100) / (1 + params.inflationPct / 100) - 1,
      startAge: setup.household.retirementAge,
    });

    const gp = params.glidePath;
    return {
      scenario: scenarioName,
      source:
        "The same engine, inputs and simulated markets as the Projections page, using the controls last saved there.",
      assumptions: {
        currentAge: setup.household.currentAge,
        retirementAge: setup.household.retirementAge,
        yearsToRetirement: ytr,
        yearsInRetirement: controls.retirementYears,
        planToAge: setup.household.currentAge + ytr + controls.retirementYears,
        marketScenario: inputs.scenario.name,
        expectedReturnPct: params.returnPct,
        inflationPct: params.inflationPct,
        volatilityPct: inputs.volatilityPct,
        monthlySpendingTodaysDollars: controls.monthlySpending,
        withdrawalMethod: controls.withdrawalMethod,
        socialSecurity: {
          selfClaimingAge: controls.selfSSAge,
          selfMonthlyAtClaimingAge: Math.round(inputs.selfSSMonthly),
          spouseClaimingAge: setup.household.spouseAge ? controls.spouseSSAge : null,
          spouseMonthlyAtClaimingAge: Math.round(inputs.spouseSSMonthly),
          selfStartsInYearsFromNow: inputs.selfSSStartYear,
          spouseStartsInYearsFromNow: setup.household.spouseAge ? inputs.spouseSSStartYear : null,
        },
        annualContributions: Math.round(setup.household.annualContributions),
        glidePath: gp
          ? {
              enabled: true,
              startProfile: `${RISK_PROFILES[gp.startProfile].label} (${RISK_PROFILES[gp.startProfile].returnPct}% return, ${RISK_PROFILES[gp.startProfile].volatility}% vol)`,
              endProfile: `${RISK_PROFILES[gp.endProfile].label} (${RISK_PROFILES[gp.endProfile].returnPct}% return, ${RISK_PROFILES[gp.endProfile].volatility}% vol)`,
              transitionAges: `${gp.transitionStartAge} → ${gp.transitionEndAge}`,
              curve: gp.curve,
            }
          : { enabled: false },
        taxes: "Federal income tax, married filing jointly, on tax-deferred withdrawals and taxable Social Security; paid from savings. State tax and capital gains are not modelled.",
      },
      projection: {
        portfolioAtRetirement: Math.round(atRetirement),
        portfolioAtRetirementTodaysDollars: Math.round(atRetirement / priceLevel(Math.max(0, ytr - 1))),
        portfolioAtEndOfPlan: Math.round(projection.totalValues[lastYear] ?? 0),
        savingsLastWholePlan: depletedAt === -1,
        savingsRunOutAtAge: depletedAt === -1 ? null : projection.ages[depletedAt],
        firstYearOfRetirement:
          firstRetirementYear === -1
            ? null
            : {
                age: projection.ages[firstRetirementYear],
                withdrawal: projection.withdrawals[firstRetirementYear],
                incomeTax: projection.taxes[firstRetirementYear],
                socialSecurity: Math.round(projection.ssIncome[firstRetirementYear] * priceLevel(firstRetirementYear)),
              },
        lifetimeIncomeTax: projection.taxes.reduce((s, t) => s + t, 0),
      },
      monteCarlo: {
        simulations: odds.simulations,
        successRate: odds.successRate,
        medianAtRetirement: odds.medianAtRetirement,
        tenthPercentileAtRetirement: odds.worstCase,
        ninetiethPercentileAtRetirement: odds.bestCase,
        description: `${odds.successRate}% of ${odds.simulations} simulated markets leave money at age ${setup.household.currentAge + ytr + controls.retirementYears}.`,
      },
      withdrawalStrategies: strategies.map((s) => ({
        name: s.name,
        description: s.description,
        totalTaxesPaidTodaysDollars: s.totalTaxesPaid,
        portfolioAtEndTodaysDollars: s.portfolioAtEnd,
        taxSavingsVsConventional: s.name === "Conventional" ? 0 : strategies[0].totalTaxesPaid - s.totalTaxesPaid,
      })),
      withdrawalStrategiesNote:
        "A comparison of draw order only, in today's dollars. The projection above draws from every account in proportion.",
    };
  },
});
