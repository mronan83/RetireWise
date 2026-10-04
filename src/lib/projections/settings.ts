import {
  MARKET_SCENARIOS,
  adjustSSBenefit,
  type DetailedProjectionParams,
  type MarketScenario,
} from "@/lib/utils/projection-scenarios";
import {
  getDefaultGlidePathConfig,
  type GlideCurve,
  type GlidePathConfig,
  type RiskProfileId,
} from "@/lib/utils/glide-path";

/**
 * From a household and its projection settings to the engine's inputs.
 *
 * The Projections page and the AI assistant both answer "will the money
 * last?", so both build their inputs here. The page passes the controls on
 * screen; the assistant passes the ones last saved from it. When this lived
 * only inside the page, the assistant rebuilt its own version, and they
 * disagreed about the claiming age, the horizon and the tax year.
 */

export type WithdrawalMethod = "expense" | "rate" | "higher";

/** What the household has, as the Projections page receives it. */
export type ProjectionHousehold = {
  accounts: DetailedProjectionParams["accounts"];
  currentAge: number;
  retirementAge: number;
  spouseAge: number | null;
  selfSSAtFRA: number;
  spouseSSAtFRA: number;
  selfFRA: number;
  spouseFRA: number;
  monthlyExpenses: number;
  annualContributions: number;
  riskTolerance?: "conservative" | "moderate" | "aggressive";
};

/** The controls on the Projections page, as saved to user_preferences. */
export type SavedProjectionControls = {
  ssClaimAgeSelf: number | null;
  ssClaimAgeSpouse: number | null;
  monthlySpending: number | null;
  withdrawalRate: number | null;
  maxWithdrawalAmount: number | null;
  retirementYears: number | null;
  marketScenario: string | null;
  withdrawalMethod: string | null;
  glidePathEnabled: boolean | null;
  glidePathStartProfile: string | null;
  glidePathEndProfile: string | null;
  glidePathTransitionStartAge: number | null;
  glidePathTransitionEndAge: number | null;
  glidePathCurve: string | null;
  catchUpEnabled: boolean | null;
};

/** The controls in effect. */
export type ProjectionControls = {
  selfSSAge: number;
  spouseSSAge: number;
  monthlySpending: number;
  withdrawalRatePct: number;
  withdrawalMethod: WithdrawalMethod;
  maxWithdrawalAmount: number | null;
  retirementYears: number;
  scenarioId: string;
  glidePathEnabled: boolean;
  glidePathStartProfile: RiskProfileId;
  glidePathEndProfile: RiskProfileId;
  glidePathTransitionStartAge: number;
  glidePathTransitionEndAge: number;
  glidePathCurve: GlideCurve;
  catchUpEnabled: boolean;
};

/** The saved controls, with the page's defaults for anything never saved. */
export function controlsFromSaved(
  h: ProjectionHousehold,
  saved?: Partial<SavedProjectionControls> | null
): ProjectionControls {
  const glide = getDefaultGlidePathConfig(h.currentAge, h.retirementAge, h.riskTolerance);
  return {
    selfSSAge: saved?.ssClaimAgeSelf || h.selfFRA || 67,
    spouseSSAge: saved?.ssClaimAgeSpouse || h.spouseFRA || 67,
    monthlySpending: saved?.monthlySpending || h.monthlyExpenses,
    withdrawalRatePct: saved?.withdrawalRate || 4.0,
    withdrawalMethod: (saved?.withdrawalMethod as WithdrawalMethod) || "expense",
    maxWithdrawalAmount: saved?.maxWithdrawalAmount ?? null,
    retirementYears: saved?.retirementYears || 35,
    scenarioId: saved?.marketScenario || "moderate",
    glidePathEnabled: saved?.glidePathEnabled ?? false,
    glidePathStartProfile: (saved?.glidePathStartProfile as RiskProfileId) || glide.startProfile,
    glidePathEndProfile: (saved?.glidePathEndProfile as RiskProfileId) || glide.endProfile,
    glidePathTransitionStartAge: saved?.glidePathTransitionStartAge ?? glide.transitionStartAge,
    glidePathTransitionEndAge: saved?.glidePathTransitionEndAge ?? glide.transitionEndAge,
    glidePathCurve: (saved?.glidePathCurve as GlideCurve) || "linear",
    catchUpEnabled: saved?.catchUpEnabled ?? true,
  };
}

export type ProjectionInputs = {
  params: DetailedProjectionParams;
  /** Volatility of the chosen market scenario, for the Monte Carlo. */
  volatilityPct: number;
  scenario: MarketScenario;
  glidePath: GlidePathConfig | undefined;
  selfSSMonthly: number;
  spouseSSMonthly: number;
  /** Both benefits a year, once both partners have claimed. */
  combinedSSAnnual: number;
  /** The first year (0-indexed from now) either partner is paid. */
  ssStartYear: number;
  selfSSStartYear: number;
  spouseSSStartYear: number;
  yearsToRetirement: number;
};

export function projectionInputs(h: ProjectionHousehold, c: ProjectionControls): ProjectionInputs {
  const scenario = MARKET_SCENARIOS.find((s) => s.id === c.scenarioId) || MARKET_SCENARIOS[1];
  const glidePath: GlidePathConfig | undefined = c.glidePathEnabled
    ? {
        enabled: true,
        startProfile: c.glidePathStartProfile,
        endProfile: c.glidePathEndProfile,
        transitionStartAge: c.glidePathTransitionStartAge,
        transitionEndAge: c.glidePathTransitionEndAge,
        curve: c.glidePathCurve,
      }
    : undefined;

  // Each benefit by the SSA's rule for the age it is claimed at.
  const selfSSMonthly = adjustSSBenefit(h.selfSSAtFRA, h.selfFRA || 67, c.selfSSAge);
  const spouseSSMonthly = adjustSSBenefit(h.spouseSSAtFRA, h.spouseFRA || 67, c.spouseSSAge);
  const combinedSSAnnual = (selfSSMonthly + spouseSSMonthly) * 12;

  // Each benefit starts in the year its owner claims it.
  const selfSSStartYear = Math.max(0, c.selfSSAge - h.currentAge);
  const spouseSSStartYear = h.spouseAge ? Math.max(0, c.spouseSSAge - h.spouseAge) : selfSSStartYear;
  const socialSecurity = [
    { annual: selfSSMonthly * 12, startYear: selfSSStartYear },
    { annual: spouseSSMonthly * 12, startYear: spouseSSStartYear },
  ].filter((b) => b.annual > 0);
  const ssStartYear = socialSecurity.length ? Math.min(...socialSecurity.map((b) => b.startYear)) : selfSSStartYear;

  const yearsToRetirement = Math.max(0, h.retirementAge - h.currentAge);

  return {
    params: {
      accounts: h.accounts,
      totalAnnualContributions: h.annualContributions,
      yearsToRetirement,
      yearsInRetirement: c.retirementYears,
      startAge: h.currentAge,
      returnPct: scenario.returnPct,
      inflationPct: scenario.inflationPct,
      annualExpenses: c.monthlySpending * 12,
      withdrawalRatePct: c.withdrawalRatePct,
      withdrawalMethod: c.withdrawalMethod,
      maxAnnualWithdrawal: c.maxWithdrawalAmount || undefined,
      socialSecurity,
      glidePath,
      catchUpEnabled: c.catchUpEnabled,
    },
    volatilityPct: scenario.volatility,
    scenario,
    glidePath,
    selfSSMonthly,
    spouseSSMonthly,
    combinedSSAnnual,
    ssStartYear,
    selfSSStartYear,
    spouseSSStartYear,
    yearsToRetirement,
  };
}
