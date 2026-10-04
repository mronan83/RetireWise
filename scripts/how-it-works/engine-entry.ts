/**
 * The code the "How RetireWise works" page runs.
 *
 * Everything here is re-exported from src/ unchanged, then bundled twice from
 * the released commit: once for Node, to compute every figure the page
 * quotes, and once for the browser, so a reader can change the inputs and
 * watch the production engine recompute. The two can never disagree, and the
 * page can never describe an engine other than the one that is live.
 *
 * Only `simulate` and the example are written here, and they only arrange
 * inputs the way the Projections page does. They are type-checked against
 * the engine, so a change to its inputs fails CI until the page follows.
 */
import { controlsFromSaved, projectionInputs, type ProjectionHousehold, type SavedProjectionControls } from "../../src/lib/projections/settings";
import { runDetailedProjection, type DetailedProjectionParams } from "../../src/lib/utils/projection-scenarios";
import { runProjectionMonteCarlo } from "../../src/lib/projections/monte-carlo";
import { getGlidePathParams } from "../../src/lib/utils/glide-path";

export {
  MARKET_SCENARIOS,
  REINVESTED_ACCOUNT_NAME,
  adjustSSBenefit,
  projectedIncomeTax,
  runDetailedProjection,
  taxableSocialSecurity,
} from "../../src/lib/utils/projection-scenarios";
export { DEFAULT_SEED, runProjectionMonteCarlo, seededRandom } from "../../src/lib/projections/monte-carlo";
export { controlsFromSaved, projectionInputs } from "../../src/lib/projections/settings";
export { PROJECTION_YEARS } from "../../src/lib/projections/build-accounts";
export {
  RMD_START_AGE,
  calculateRMD,
  estimateTaxMFJ,
  getMarginalRate,
  ssBenefitAtClaimingAge,
} from "../../src/lib/utils/financial-analytics";
export { RISK_PROFILES, RISK_PROFILE_ORDER, getDefaultGlidePathConfig, getGlidePathParams } from "../../src/lib/utils/glide-path";
export { getSalaryAtYear } from "../../src/lib/utils/salary-growth";
export { BUILT_IN_TAX_YEAR, DEFAULT_TAX_TABLE } from "../../src/lib/tax/table";
export { IRS_LIMITS, getIrsLimitForAge } from "../../src/lib/constants";
export { RETURN_BY_RISK } from "../../src/lib/utils/risk";
export { composeNetWorth, looksLikeSameLoan } from "../../src/lib/net-worth/compose";
export {
  calculateCatchUpImpact,
  calculateFeeImpact,
  calculateIncomeReplacement,
  calculateRothConversionLadder,
  calculateSequenceRisk,
  calculateSSBreakEven,
  projectHealthcareCosts,
  projectRMDs,
} from "../../src/lib/utils/financial-analytics";
export { calculateWithdrawalStrategies } from "../../src/lib/utils/withdrawal-strategies";
export { addDays, flowBetween, timeWeightedReturn, twrSince } from "../../src/lib/performance/twr";
export { gainLossFor, positionBasis, rollupBasis } from "../../src/lib/utils/cost-basis";
export { calculateAllocation, calculateAllocationDrift } from "../../src/lib/utils/calculations";
export { GRACE_DAYS, WINDOW_DAYS, summarizeDividends } from "../../src/lib/utils/dividends";
export { computeGoalProgress } from "../../src/lib/goals/progress";
export { freshnessOf, relativeAge } from "../../src/lib/utils/freshness";
export { DEAD_LETTER_AFTER, backoffMs } from "../../src/lib/plaid/backoff";
export { FREQUENCY_PER_YEAR, contributionBreakdown, vestingStatus } from "../../src/lib/utils/contributions";

/** What a reader can change on the page: one earner's household, simplified. */
export type PlaygroundInputs = {
  age: number;
  retirementAge: number;
  /** Null for a single person. */
  partnerAge: number | null;
  salary: number;
  salaryGrowthPct: number;
  /** Traditional 401(k): balance, the percent of salary deferred, and the match. */
  pretaxBalance: number;
  deferralPct: number;
  /** Employer match as a fraction of what is deferred (0.5 = 50 cents per dollar). */
  matchRate: number;
  /** Match paid on deferrals up to this percent of salary. */
  matchUpToPct: number;
  rothBalance: number;
  rothAnnual: number;
  taxableBalance: number;
  /** Retirement spending, per month, in today's dollars. */
  monthlySpending: number;
  /** Monthly Social Security at full retirement age, from each person's SSA statement. */
  selfSSAtFRA: number;
  partnerSSAtFRA: number;
  fra: number;
  claimAgeSelf: number;
  claimAgePartner: number;
  scenarioId: string;
  retirementYears: number;
  glidePath: boolean;
  catchUp: boolean;
  withdrawalMethod: "expense" | "rate" | "higher";
  withdrawalRatePct: number;
};

/** The household the page opens with. An example, not anyone's real figures. */
export const EXAMPLE_INPUTS: PlaygroundInputs = {
  age: 52,
  retirementAge: 65,
  partnerAge: 50,
  salary: 140_000,
  salaryGrowthPct: 3,
  pretaxBalance: 420_000,
  deferralPct: 10,
  matchRate: 0.5,
  matchUpToPct: 6,
  rothBalance: 85_000,
  rothAnnual: 7_000,
  taxableBalance: 60_000,
  monthlySpending: 7_500,
  selfSSAtFRA: 3_100,
  partnerSSAtFRA: 1_900,
  fra: 67,
  claimAgeSelf: 67,
  claimAgePartner: 67,
  scenarioId: "moderate",
  retirementYears: 30,
  glidePath: false,
  catchUp: true,
  withdrawalMethod: "expense",
  withdrawalRatePct: 4,
};

type EngineAccount = DetailedProjectionParams["accounts"][number];

/** The household as the Projections page receives it from the database. */
export function playgroundHousehold(i: PlaygroundInputs): ProjectionHousehold {
  const yearsToRetirement = Math.max(0, i.retirementAge - i.age);
  const base = {
    owner: "self",
    salary: i.salary,
    salaryGrowth: i.salaryGrowthPct > 0 ? { method: "pct_per_year" as const, value: i.salaryGrowthPct, years: 0 } : null,
    ownerRetirementYear: yearsToRetirement,
    ownerCurrentAge: i.age,
    annualEscalation: 0,
    maxAnnualContribution: 0,
    employerMatchRate: 0,
    employerMatchMaxPct: 0,
    contributionPct: 0,
  };
  const accounts: EngineAccount[] = [
    {
      ...base,
      name: "401(k)",
      type: "401k",
      taxTreatment: "tax_deferred",
      value: i.pretaxBalance,
      isActivelyContributing: i.deferralPct > 0,
      annualContribution: Math.round((i.salary * i.deferralPct) / 100),
      contributionMethod: "percent_of_salary",
      contributionPct: i.deferralPct,
      employerMatchRate: i.matchRate,
      employerMatchMaxPct: i.matchUpToPct,
    },
    {
      ...base,
      name: "Roth IRA",
      type: "ira_roth",
      taxTreatment: "tax_free",
      value: i.rothBalance,
      isActivelyContributing: i.rothAnnual > 0,
      annualContribution: i.rothAnnual,
      contributionMethod: "fixed_amount",
    },
    {
      ...base,
      name: "Brokerage",
      type: "brokerage",
      taxTreatment: "taxable",
      value: i.taxableBalance,
      isActivelyContributing: false,
      annualContribution: 0,
      contributionMethod: "fixed_amount",
    },
  ].filter((a) => a.value > 0 || a.annualContribution > 0);
  return {
    accounts,
    currentAge: i.age,
    retirementAge: i.retirementAge,
    spouseAge: i.partnerAge,
    selfSSAtFRA: i.selfSSAtFRA,
    spouseSSAtFRA: i.partnerAge === null ? 0 : i.partnerSSAtFRA,
    selfFRA: i.fra,
    spouseFRA: i.fra,
    monthlyExpenses: i.monthlySpending,
    annualContributions: accounts.reduce((s, a) => s + a.annualContribution, 0),
  };
}

/** The controls, saved the way the Projections page saves them. */
export function playgroundSaved(i: PlaygroundInputs): Partial<SavedProjectionControls> {
  return {
    ssClaimAgeSelf: i.claimAgeSelf,
    ssClaimAgeSpouse: i.claimAgePartner,
    monthlySpending: i.monthlySpending,
    withdrawalRate: i.withdrawalRatePct,
    retirementYears: i.retirementYears,
    marketScenario: i.scenarioId,
    withdrawalMethod: i.withdrawalMethod,
    glidePathEnabled: i.glidePath,
    catchUpEnabled: i.catchUp,
  };
}

/** One run, exactly as the Projections page makes it: inputs, projection, odds. */
export function simulate(i: PlaygroundInputs) {
  const household = playgroundHousehold(i);
  const controls = controlsFromSaved(household, playgroundSaved(i));
  const inputs = projectionInputs(household, controls);
  const projection = runDetailedProjection(inputs.params);
  const odds = runProjectionMonteCarlo(inputs.params, { volatilityPct: inputs.volatilityPct });
  const depletedAt = projection.totalValues.findIndex((v, y) => projection.phases[y] === "retirement" && v <= 0);
  const priceLevel = (y: number) => Math.pow(1 + inputs.params.inflationPct / 100, y + 1);
  return {
    household,
    controls,
    inputs,
    projection,
    odds,
    /** Age the money runs out, or null when it lasts. */
    depletionAge: depletedAt === -1 ? null : projection.ages[depletedAt],
    balanceAtRetirement: inputs.yearsToRetirement > 0 ? projection.totalValues[inputs.yearsToRetirement - 1] : household.accounts.reduce((s, a) => s + a.value, 0),
    /**
     * Social Security in the year's own dollars, as the engine uses it to fund
     * spending. The engine reports it in today's dollars (`ssIncome`), beside
     * withdrawals and taxes in each year's dollars, so it is restated here.
     */
    ssNominal: projection.ssIncome.map((s, y) => (projection.phases[y] === "retirement" ? Math.round(s * priceLevel(y)) : 0)),
    /** Retirement spending in each year's dollars: today's spending, inflated. */
    spendingNominal: projection.phases.map((ph, y) => (ph === "retirement" ? Math.round(inputs.params.annualExpenses * priceLevel(y)) : 0)),
    priceLevel: projection.years.map((y) => priceLevel(y)),
  };
}

export type Run = ReturnType<typeof simulate>;

/**
 * One projected year taken apart, from the engine's own output.
 *
 * Nothing here recalculates the engine: every figure is a column of its
 * result, or the difference that makes the year balance. The growth line is
 * that difference, and it equals the start balance times the year's return.
 */
export function explainYear(run: Run, y: number) {
  const p = run.projection;
  const params = run.inputs.params;
  const start = y === 0 ? run.household.accounts.reduce((s, a) => s + a.value, 0) : p.totalValues[y - 1];
  const end = p.totalValues[y];
  const contributions = p.contributions[y];
  const withdrawal = p.withdrawals[y];
  const reinvested = p.reinvested[y];
  const growth = end - start - contributions + withdrawal - reinvested;
  const age = p.ages[y];
  const ratePct = params.glidePath?.enabled ? getGlidePathParamsForEngine(age, params) : params.returnPct;
  const retired = p.phases[y] === "retirement";
  const spending = run.spendingNominal[y];
  const ss = run.ssNominal[y];
  return {
    age,
    retired,
    start,
    ratePct,
    growth,
    contributions,
    priceLevel: run.priceLevel[y],
    spending,
    ss,
    need: retired ? Math.max(0, spending - ss) : 0,
    rmd: p.rmdAmounts[y],
    taxDeferredBalance: p.taxDeferredBalance[y],
    withdrawal,
    tax: p.taxes[y],
    reinvested,
    end,
  };
}

function getGlidePathParamsForEngine(age: number, params: DetailedProjectionParams): number {
  return params.glidePath ? getGlidePathParams(age, params.glidePath).returnPct : params.returnPct;
}

/**
 * The withdrawal-order comparison's inputs for a run: the engine's balances in
 * the last working year by tax treatment, restated in today's dollars because
 * the comparison works in today's dollars with a return after inflation.
 */
export function withdrawalInputs(run: Run) {
  const y = Math.max(0, run.inputs.yearsToRetirement - 1);
  const level = run.inputs.yearsToRetirement > 0 ? run.priceLevel[y] : 1;
  const at = (treatment: string) =>
    Math.round(
      run.projection.accountProjections
        .filter((a) => a.taxTreatment === treatment)
        .reduce((s, a) => s + (run.inputs.yearsToRetirement > 0 ? a.projectedValues[y] : a.currentValue), 0) / level,
    );
  const params = run.inputs.params;
  return {
    taxDeferredBalance: at("tax_deferred"),
    taxFreeBalance: at("tax_free"),
    taxableBalance: at("taxable"),
    annualExpenses: Math.round(params.annualExpenses),
    annualSSIncome: Math.round(run.inputs.combinedSSAnnual),
    yearsInRetirement: run.controls.retirementYears,
    realReturnRate: (params.returnPct - params.inflationPct) / 100,
    startAge: run.household.retirementAge,
  };
}
