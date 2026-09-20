/**
 * Market scenario presets and detailed projection tables.
 */

import { getSalaryAtYear, type SalaryGrowthConfig } from "./salary-growth";
import { calculateRMD } from "./financial-analytics";
import { type GlidePathConfig, getGlidePathParams } from "./glide-path";
import { getIrsLimitForAge } from "../constants";

export type MarketScenario = {
  id: string;
  name: string;
  description: string;
  returnPct: number;
  volatility: number;
  inflationPct: number;
};

export const MARKET_SCENARIOS: MarketScenario[] = [
  {
    id: "historical_avg",
    name: "Historical Average",
    description: "Long-run US market average (~10% nominal, ~7% real)",
    returnPct: 10,
    volatility: 15,
    inflationPct: 3,
  },
  {
    id: "moderate",
    name: "Moderate Growth",
    description: "Balanced portfolio with moderate returns (~7%)",
    returnPct: 7,
    volatility: 12,
    inflationPct: 3,
  },
  {
    id: "bull_market",
    name: "Bull Market",
    description: "Strong economic growth, low inflation (~12%)",
    returnPct: 12,
    volatility: 14,
    inflationPct: 2.5,
  },
  {
    id: "lost_decade",
    name: "Lost Decade",
    description: "Flat/negative real returns like 2000-2010 (~2%)",
    returnPct: 2,
    volatility: 20,
    inflationPct: 3,
  },
  {
    id: "stagflation",
    name: "Stagflation",
    description: "Low growth + high inflation like the 1970s (~4% return, 6% inflation)",
    returnPct: 4,
    volatility: 18,
    inflationPct: 6,
  },
  {
    id: "conservative",
    name: "Conservative",
    description: "Bond-heavy portfolio, capital preservation (~5%)",
    returnPct: 5,
    volatility: 8,
    inflationPct: 3,
  },
];

// Social Security benefit adjustment by claiming age
export function adjustSSBenefit(
  benefitAtFRA: number,
  fra: number,
  claimingAge: number
): number {
  if (claimingAge === fra) return benefitAtFRA;

  if (claimingAge < fra) {
    // Reduced: ~6.67% per year before FRA
    const yearsEarly = fra - claimingAge;
    return benefitAtFRA * (1 - 0.0667 * yearsEarly);
  }

  // Delayed: ~8% per year after FRA up to 70
  const yearsDelayed = Math.min(claimingAge - fra, 70 - fra);
  return benefitAtFRA * (1 + 0.08 * yearsDelayed);
}

// Per-account projection detail
export type AccountProjection = {
  name: string;
  owner: string;
  accountType: string;
  taxTreatment: string;
  currentValue: number;
  projectedValues: number[]; // value at each year
  contributionPerYear: number[]; // contribution added each year (for debugging)
};

export type DetailedProjection = {
  years: number[];
  ages: number[];
  phases: string[]; // "accumulation" | "retirement"
  totalValues: number[];
  accountProjections: AccountProjection[];
  ssIncome: number[]; // combined annual SS
  withdrawals: number[];
  contributions: number[];
  rmdAmounts: number[]; // mandatory minimum distribution per year (0 during accumulation)
  taxDeferredBalance: number[]; // total tax-deferred balance per year (for RMD context)
};

export function runDetailedProjection(params: {
  accounts: {
    name: string; owner: string; type: string; taxTreatment: string;
    value: number; isActivelyContributing: boolean; annualContribution: number;
    annualEscalation: number; // amount to add per year (% points for pct method, $ for fixed)
    maxAnnualContribution: number; // cap (0 = no cap)
    contributionMethod: string; // "percent_of_salary" | "fixed_amount"
    contributionPct: number; // the base % if percent_of_salary
    employerMatchRate: number; // e.g., 1.0 for dollar-for-dollar
    employerMatchMaxPct: number; // e.g., 5 for up to 5%
    employerNonElectivePct?: number; // paid regardless of deferral, % of salary
    employerNonElectiveAmount?: number; // paid regardless of deferral, flat $/yr
    /**
     * How much of each projected year this account is actually funded, 0 to 1,
     * one entry per year. A paused contribution is not a smaller contribution
     * and not a cancelled one — it is this many months of nothing — so it is
     * applied as a factor on the year rather than a change to the rate.
     */
    contributionFactors?: number[];
    salary: number; // current salary for this account's owner
    salaryGrowth: import("./salary-growth").SalaryGrowthConfig | null;
    ownerRetirementYear?: number; // year (0-indexed) this owner's contributions stop
    ownerCurrentAge?: number; // owner's current age (for age-based IRS limits)
  }[];
  totalAnnualContributions: number; // kept for backward compat / summary
  yearsToRetirement: number; // when withdrawals begin (earliest retirement)
  yearsInRetirement: number;
  startAge: number;
  returnPct: number;
  inflationPct: number;
  annualExpenses: number;
  withdrawalRatePct?: number;
  withdrawalMethod?: "expense" | "rate" | "higher"; // how to determine withdrawal amount
  maxAnnualWithdrawal?: number; // cap on annual withdrawal (null/0 = unlimited)
  annualSSIncome: number;
  ssStartYear: number; // year when SS starts (0-indexed from now)
  glidePath?: GlidePathConfig; // optional glide path rebalancing
  catchUpEnabled?: boolean; // whether to apply 50+ and 60-63 catch-up IRS limits (default true)
}): DetailedProjection {
  const {
    accounts,
    totalAnnualContributions,
    yearsToRetirement,
    yearsInRetirement,
    startAge,
    returnPct,
    inflationPct,
    annualExpenses,
    withdrawalRatePct,
    withdrawalMethod = "expense",
    maxAnnualWithdrawal,
    annualSSIncome,
    ssStartYear,
    glidePath,
    catchUpEnabled = true,
  } = params;

  const totalYears = yearsToRetirement + yearsInRetirement;
  const baseRate = returnPct / 100;

  // Helper: get return rate for a given age (uses glide path if enabled)
  function getRateForAge(age: number): number {
    if (glidePath?.enabled) {
      return getGlidePathParams(age, glidePath).returnPct / 100;
    }
    return baseRate;
  }

  // Initialize account projections
  const accountProjs: AccountProjection[] = accounts.map((a) => ({
    name: a.name,
    owner: a.owner,
    accountType: a.type,
    taxTreatment: a.taxTreatment,
    currentValue: a.value,
    projectedValues: [],
    contributionPerYear: [],
  }));

  const totalPortfolio = accounts.reduce((s, a) => s + a.value, 0);
  const contributingValue = accounts
    .filter((a) => a.isActivelyContributing)
    .reduce((s, a) => s + a.value, 0);
  const years: number[] = [];
  const ages: number[] = [];
  const phases: string[] = [];
  const totalValues: number[] = [];
  const ssIncomeArr: number[] = [];
  const withdrawalsArr: number[] = [];
  const contributionsArr: number[] = [];
  const rmdArr: number[] = [];
  const taxDeferredArr: number[] = [];

  for (let y = 0; y < totalYears; y++) {
    const isRetirement = y >= yearsToRetirement;
    const hasSS = y >= ssStartYear;
    const yearSS = hasSS ? annualSSIncome : 0;

    years.push(y);
    ages.push(startAge + y + 1);
    phases.push(isRetirement ? "retirement" : "accumulation");
    ssIncomeArr.push(yearSS);

    // Grow each account — rate varies by age when glide path is active
    const age = startAge + y + 1;
    const rate = getRateForAge(age);
    let yearTotalContributions = 0;
    for (const ap of accountProjs) {
      const prev =
        ap.projectedValues.length > 0
          ? ap.projectedValues[ap.projectedValues.length - 1]
          : ap.currentValue;
      const growth = prev * rate;
      let newVal = prev + growth;

      // Contributions: each account stops when its owner retires
      const idx = accountProjs.indexOf(ap);
      const acct = accounts[idx];
      const ownerStillWorking = y < (acct.ownerRetirementYear ?? yearsToRetirement);

      const nonElectivePct = acct.employerNonElectivePct ?? 0;
      const nonElectiveAmount = acct.employerNonElectiveAmount ?? 0;
      const hasNonElective = nonElectivePct > 0 || nonElectiveAmount > 0;

      if (ownerStillWorking && acct.isActivelyContributing) {
        if (acct.annualContribution > 0 || acct.annualEscalation > 0 || hasNonElective || (acct.contributionPct > 0 && acct.salary > 0)) {
          // Get this year's salary (accounts for salary growth config)
          const yearSalary = getSalaryAtYear(acct.salary, acct.salaryGrowth, y);

          // Employee and employer money are tracked apart all the way through,
          // because the IRS limit below applies to the employee's deferral
          // alone. Blending them first and capping the total silently deletes
          // employer contributions, and does it worst at high salaries.
          let employee: number;
          let employer = 0;
          if (acct.contributionMethod === "percent_of_salary" && yearSalary > 0) {
            // Base contribution % + escalation per year
            const pct = acct.contributionPct + (acct.annualEscalation > 0 ? acct.annualEscalation * y : 0);
            employee = (pct / 100) * yearSalary;

            // Match, earned against the growing salary too
            if (acct.employerMatchRate > 0 && acct.employerMatchMaxPct > 0) {
              const matchablePct = Math.min(pct, acct.employerMatchMaxPct);
              employer += (matchablePct / 100) * yearSalary * acct.employerMatchRate;
            }
          } else {
            // Fixed amount + $ increase per year
            employee = acct.annualContribution + (acct.annualEscalation > 0 ? acct.annualEscalation * y : 0);
          }

          // A pause stops the employee's money, and with it the match that is
          // earned on it. It does not stop non-elective employer money, which
          // is paid at any deferral rate including none — so the factor is
          // applied before that is added, not after.
          const funded = acct.contributionFactors?.[y] ?? 1;
          employee *= funded;
          employer *= funded;

          // Non-elective employer money is paid whatever the employee defers,
          // so it is added outside the deferral branch and never scaled by it.
          if (hasNonElective) {
            employer +=
              nonElectivePct > 0 && yearSalary > 0
                ? (nonElectivePct / 100) * yearSalary
                : nonElectiveAmount;
          }

          // Apply the IRS elective-deferral limit — age-aware for 50+ catch-up
          // and the 60-63 enhanced catch-up — to the employee's share only.
          const ownerAge = acct.ownerCurrentAge ? acct.ownerCurrentAge + y + 1 : age;
          const ageBasedLimit = catchUpEnabled
            ? getIrsLimitForAge(acct.type, ownerAge)
            : getIrsLimitForAge(acct.type, 30); // under-50 limit when catch-up disabled
          const effectiveCap = ageBasedLimit > 0 ? ageBasedLimit : acct.maxAnnualContribution;
          if (effectiveCap > 0) {
            employee = Math.min(employee, effectiveCap);
          }
          const actualContrib = Math.max(0, employee + employer);
          newVal += actualContrib;
          yearTotalContributions += actualContrib;
          ap.contributionPerYear.push(Math.round(actualContrib));
        } else {
          ap.contributionPerYear.push(0);
        }
      } else {
        ap.contributionPerYear.push(0);
      }

      ap.projectedValues.push(Math.max(0, Math.round(newVal)));
    }

    // Withdrawals in retirement
    let yearWithdrawal = 0;
    let yearRmd = 0;
    let yearTaxDeferredBal = 0;

    // Always track tax-deferred balance (useful context even during accumulation)
    yearTaxDeferredBal = accountProjs
      .filter((_, idx) => {
        const t = accounts[idx].type;
        return t === "401k" || t === "403b" || t === "ira_traditional" || t === "pension";
      })
      .reduce((s, ap) => s + ap.projectedValues[ap.projectedValues.length - 1], 0);

    if (isRetirement) {
      const age = startAge + y + 1;

      /**
       * Inflated from TODAY, not from the first day of retirement.
       *
       * This used an exponent of (y - yearsToRetirement), which is zero in
       * the first year of retirement — so spending grew once retirement
       * began and not for any of the years before it. The model is nominal
       * (MARKET_SCENARIOS describes 10% as "nominal, ~7% real" and carries
       * inflationPct separately), so today's grocery bill was being met out
       * of a portfolio grown for twenty years of nominal returns.
       *
       * At 3% over eighteen years that understated retirement spending by
       * about 1.7x, and every "your money lasts" verdict inherited it.
       *
       * Year index y is (y + 1) years from now — see the ages array — so
       * that is the exponent.
       */
      const yearsFromNow = y + 1;
      const inflation = Math.pow(1 + inflationPct / 100, yearsFromNow);
      const inflatedExpenses = annualExpenses * inflation;
      // Social Security is quoted by the SSA in today's dollars and indexed
      // by COLA, so it inflates from today on the same basis.
      const inflatedSS = yearSS * inflation;

      // Calculate each withdrawal method
      const expenseBased = Math.max(0, inflatedExpenses - inflatedSS);
      const totalCurrent = accountProjs.reduce(
        (s, ap) => s + ap.projectedValues[ap.projectedValues.length - 1], 0
      );
      const rateBased = withdrawalRatePct ? totalCurrent * (withdrawalRatePct / 100) : 0;

      // Calculate RMD — mandatory minimum from tax-deferred accounts at age 73+
      yearRmd = calculateRMD(yearTaxDeferredBal, age);

      // Determine base withdrawal by method
      let needed: number;
      switch (withdrawalMethod) {
        case "expense":
          needed = expenseBased;
          break;
        case "rate":
          needed = rateBased;
          break;
        case "higher":
        default:
          needed = Math.max(expenseBased, rateBased);
          break;
      }

      // RMDs are mandatory — if RMD exceeds chosen withdrawal, must take at least the RMD
      if (yearRmd > needed) {
        needed = yearRmd;
      }

      // Apply max annual cap (but RMDs can't be capped — they're mandatory)
      if (maxAnnualWithdrawal && maxAnnualWithdrawal > 0) {
        needed = Math.max(yearRmd, Math.min(needed, maxAnnualWithdrawal));
      }

      if (totalCurrent > 0 && needed > 0) {
        // Withdraw proportionally from each account based on its share of total portfolio
        for (const ap of accountProjs) {
          const currentVal = ap.projectedValues[ap.projectedValues.length - 1];
          const share = currentVal / totalCurrent;
          const targetWithdrawal = needed * share;
          const withdrawal = Math.min(currentVal, targetWithdrawal);
          ap.projectedValues[ap.projectedValues.length - 1] -= Math.round(withdrawal);
          yearWithdrawal += withdrawal;
        }
      }
    }

    withdrawalsArr.push(Math.round(yearWithdrawal));
    contributionsArr.push(Math.round(yearTotalContributions));
    rmdArr.push(Math.round(yearRmd));
    taxDeferredArr.push(Math.round(yearTaxDeferredBal));

    const yearTotal = accountProjs.reduce(
      (s, ap) => s + ap.projectedValues[ap.projectedValues.length - 1],
      0
    );
    totalValues.push(yearTotal);
  }

  return {
    years,
    ages,
    phases,
    totalValues,
    accountProjections: accountProjs,
    ssIncome: ssIncomeArr,
    withdrawals: withdrawalsArr,
    contributions: contributionsArr,
    rmdAmounts: rmdArr,
    taxDeferredBalance: taxDeferredArr,
  };
}
