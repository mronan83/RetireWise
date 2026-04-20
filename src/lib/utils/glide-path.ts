/**
 * Glide path rebalancing engine.
 *
 * Models the shift from aggressive to conservative asset allocation
 * as you approach (and enter) retirement — like a target-date fund.
 *
 * Each risk profile maps to expected return + volatility based on
 * historical stock/bond blend performance.
 */

export const RISK_PROFILES = {
  very_aggressive: {
    label: "Very Aggressive",
    description: "90% stocks / 10% bonds",
    stockPct: 90,
    returnPct: 10,
    volatility: 17,
  },
  aggressive: {
    label: "Aggressive",
    description: "80% stocks / 20% bonds",
    stockPct: 80,
    returnPct: 9,
    volatility: 15,
  },
  moderately_aggressive: {
    label: "Moderately Aggressive",
    description: "70% stocks / 30% bonds",
    stockPct: 70,
    returnPct: 8,
    volatility: 13,
  },
  moderate: {
    label: "Moderate",
    description: "60% stocks / 40% bonds",
    stockPct: 60,
    returnPct: 7,
    volatility: 11,
  },
  moderately_conservative: {
    label: "Moderately Conservative",
    description: "40% stocks / 60% bonds",
    stockPct: 40,
    returnPct: 5.5,
    volatility: 8,
  },
  conservative: {
    label: "Conservative",
    description: "20% stocks / 80% bonds",
    stockPct: 20,
    returnPct: 4,
    volatility: 5,
  },
} as const;

export type RiskProfileId = keyof typeof RISK_PROFILES;

export const RISK_PROFILE_ORDER: RiskProfileId[] = [
  "very_aggressive",
  "aggressive",
  "moderately_aggressive",
  "moderate",
  "moderately_conservative",
  "conservative",
];

export type GlideCurve = "linear" | "accelerated";

export type GlidePathConfig = {
  enabled: boolean;
  startProfile: RiskProfileId;
  endProfile: RiskProfileId;
  transitionStartAge: number;
  transitionEndAge: number;
  curve: GlideCurve;
};

export type GlidePathParams = {
  returnPct: number;
  volatility: number;
  stockPct: number;
};

/**
 * Get the interpolated return/volatility/allocation for a given age.
 *
 * - Before transitionStartAge → full starting profile
 * - During transition → interpolated (linear or accelerated)
 * - After transitionEndAge → full ending profile
 */
export function getGlidePathParams(
  age: number,
  config: GlidePathConfig
): GlidePathParams {
  const start = RISK_PROFILES[config.startProfile];
  const end = RISK_PROFILES[config.endProfile];

  if (age <= config.transitionStartAge) {
    return {
      returnPct: start.returnPct,
      volatility: start.volatility,
      stockPct: start.stockPct,
    };
  }

  if (age >= config.transitionEndAge) {
    return {
      returnPct: end.returnPct,
      volatility: end.volatility,
      stockPct: end.stockPct,
    };
  }

  // Progress through the transition (0 → 1)
  const duration = config.transitionEndAge - config.transitionStartAge;
  const elapsed = age - config.transitionStartAge;
  let t = elapsed / duration;

  // Accelerated curve: slow start, faster near end (quadratic ease-in)
  // This mimics real target-date funds that shift more aggressively
  // in the last few years before retirement
  if (config.curve === "accelerated") {
    t = t * t;
  }

  return {
    returnPct: lerp(start.returnPct, end.returnPct, t),
    volatility: lerp(start.volatility, end.volatility, t),
    stockPct: lerp(start.stockPct, end.stockPct, t),
  };
}

/**
 * Generate the full glide path schedule for charting.
 * Returns one entry per year from startAge through endAge.
 */
export function generateGlidePathSchedule(
  config: GlidePathConfig,
  startAge: number,
  endAge: number
): (GlidePathParams & { age: number })[] {
  const schedule: (GlidePathParams & { age: number })[] = [];
  for (let age = startAge; age <= endAge; age++) {
    schedule.push({ age, ...getGlidePathParams(age, config) });
  }
  return schedule;
}

/**
 * Build a sensible default glide path config based on current/retirement ages
 * and existing risk tolerance.
 */
export function getDefaultGlidePathConfig(
  currentAge: number,
  retirementAge: number,
  riskTolerance?: "conservative" | "moderate" | "aggressive"
): GlidePathConfig {
  // Map existing 3-level risk tolerance to a starting profile
  const startMap: Record<string, RiskProfileId> = {
    aggressive: "aggressive",
    moderate: "moderately_aggressive",
    conservative: "moderate",
  };

  const startProfile = startMap[riskTolerance ?? "moderate"] ?? "moderately_aggressive";

  // Transition starts 15 years before retirement (or at current age if less)
  const transitionStartAge = Math.max(currentAge, retirementAge - 15);

  return {
    enabled: false,
    startProfile,
    endProfile: "moderately_conservative",
    transitionStartAge,
    transitionEndAge: retirementAge,
    curve: "linear",
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
