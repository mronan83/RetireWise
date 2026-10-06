import type { DetailedProjectionParams } from "@/lib/utils/projection-scenarios";

/**
 * The what-if scenarios on the Projections page.
 *
 * Each one changes a single thing about the household's own engine inputs
 * and runs the same engine against the same seeded markets, so it differs
 * from the base case only by what it says it changes. They lived inside the
 * page, where three of them missed what they changed: "Boost Savings" scaled
 * a figure the engine ignores for a contribution set as a share of pay,
 * "Retire Earlier" kept paying contributions after the new retirement date,
 * and "Lower Returns" was overridden by the glide path whenever it was on.
 * Here they can be checked.
 */
export const WHAT_IFS = [
  {
    id: "market_crash",
    name: "Market Crash",
    description: "What if the market drops suddenly?",
    paramLabel: "Drop",
    defaultValue: 30,
    unit: "%",
  },
  {
    id: "early_retire",
    name: "Retire Earlier",
    description: "What if you retire sooner?",
    paramLabel: "Years earlier",
    defaultValue: 5,
    unit: "yrs",
  },
  {
    id: "boost_savings",
    name: "Boost Savings",
    description: "What if you increase contributions?",
    paramLabel: "Increase",
    defaultValue: 50,
    unit: "%",
  },
  {
    id: "lower_returns",
    name: "Lower Returns",
    description: "What if the market underperforms?",
    paramLabel: "Return",
    defaultValue: 4,
    unit: "%",
  },
  {
    id: "high_inflation",
    name: "High Inflation",
    description: "What if inflation stays elevated?",
    paramLabel: "Inflation",
    defaultValue: 5,
    unit: "%",
  },
  {
    id: "reduced_ss",
    name: "Reduced Social Security",
    description: "What if SS benefits are cut?",
    paramLabel: "Cut by",
    defaultValue: 25,
    unit: "%",
  },
] as const;

export type WhatIfId = (typeof WHAT_IFS)[number]["id"];

/** The household's engine inputs with one what-if applied. */
export function whatIfParams(base: DetailedProjectionParams, id: WhatIfId, value: number): DetailedProjectionParams {
  switch (id) {
    case "market_crash":
      // Every account loses the same share today; contributions, spending
      // and Social Security are untouched.
      return { ...base, accounts: base.accounts.map((a) => ({ ...a, value: a.value * (1 - value / 100) })) };

    case "early_retire": {
      // You stop work, and contributions to your accounts, this many years
      // sooner, and withdrawals start then. The plan still ends at the same
      // age. A partner keeps working as before, and Social Security stays at
      // the claiming ages chosen on the page.
      const years = Math.min(Math.max(0, Math.round(value)), base.yearsToRetirement);
      return {
        ...base,
        yearsToRetirement: base.yearsToRetirement - years,
        yearsInRetirement: base.yearsInRetirement + years,
        accounts: base.accounts.map((a) => {
          const retires = a.ownerRetirementYear ?? base.yearsToRetirement;
          return { ...a, ownerRetirementYear: a.owner === "spouse" ? retires : Math.max(0, retires - years) };
        }),
      };
    }

    case "boost_savings": {
      // Your own deferral rises by this share, whether it is set as a share
      // of pay or as an amount. The engine then works out the match on the
      // larger deferral and applies the IRS limit to it, so a boost can be
      // partly capped. Employer money paid regardless of deferral is not.
      const m = 1 + value / 100;
      return {
        ...base,
        accounts: base.accounts.map((a) => ({
          ...a,
          contributionPct: a.contributionPct * m,
          annualContribution: Math.round(a.annualContribution * m),
        })),
        totalAnnualContributions: base.totalAnnualContributions * m,
      };
    }

    case "lower_returns":
      // Markets return this much every year. A glide path would replace it
      // with each age's own return, so it is set aside for this scenario.
      return { ...base, returnPct: value, glidePath: undefined };

    case "high_inflation":
      // Spending, Social Security and the tax brackets all rise at this rate.
      return { ...base, inflationPct: value };

    case "reduced_ss":
      // Every benefit is cut by this share from the day it starts.
      return { ...base, socialSecurity: base.socialSecurity.map((b) => ({ ...b, annual: b.annual * (1 - value / 100) })) };
  }
}
