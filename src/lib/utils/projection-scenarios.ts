/**
 * Market scenario presets and detailed projection tables.
 */

import { getSalaryAtYear, type SalaryGrowthConfig } from "./salary-growth";
import { calculateRMD, estimateTaxMFJ } from "./financial-analytics";
import { DEFAULT_TAX_TABLE, type TaxTable } from "../tax/table";
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

/**
 * The part of a married couple's Social Security that is taxed, by the IRS
 * worksheet (Publication 915). Provisional income is the other income plus
 * half the benefit; up to 50% of the benefit is taxed above $32,000 and up
 * to 85% above $44,000. Those thresholds are fixed in law and have never
 * been indexed, so they apply to nominal dollars in every year.
 */
export function taxableSocialSecurity(benefits: number, otherIncome: number): number {
  if (benefits <= 0) return 0;
  const provisional = otherIncome + benefits / 2;
  if (provisional <= 32_000) return 0;
  if (provisional <= 44_000) return Math.min(benefits / 2, (provisional - 32_000) / 2);
  return Math.min(0.85 * benefits, 0.85 * (provisional - 44_000) + Math.min(benefits / 2, 6_000));
}

/**
 * Federal income tax, married filing jointly, in a projected year.
 *
 * `ordinaryIncome` and `ssBenefits` are that year's nominal dollars, and
 * `priceLevel` is how far prices have risen since today. Brackets and the
 * standard deduction rise with inflation, so the income is deflated to
 * today's dollars, taxed with today's table, and the tax inflated back.
 * Applying today's brackets to a 2045 income unadjusted would tax it as if
 * every bracket had stood still for twenty years.
 */
export function projectedIncomeTax(
  ordinaryIncome: number,
  ssBenefits: number,
  priceLevel: number,
  table: TaxTable = DEFAULT_TAX_TABLE
): number {
  const income = ordinaryIncome + taxableSocialSecurity(ssBenefits, ordinaryIncome);
  if (income <= 0) return 0;
  return estimateTaxMFJ(income / priceLevel, table) * priceLevel;
}

/** Name of the account the engine opens for distributions it cannot spend. */
export const REINVESTED_ACCOUNT_NAME = "Reinvested distributions";

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
  /** Gross amount taken from savings each year: spending, the tax on it, and any RMD beyond both. */
  withdrawals: number[];
  /** Federal income tax paid out of each year's withdrawal (0 during accumulation). */
  taxes: number[];
  /** Required distribution beyond what was spent, after its tax, moved to a taxable account. */
  reinvested: number[];
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
  taxTable?: TaxTable; // federal brackets and standard deduction (default: the built-in year)
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
    taxTable = DEFAULT_TAX_TABLE,
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

  /**
   * Where a required distribution goes when it is more than the household
   * spends. It has to leave the tax-deferred account, but it does not leave
   * the family: after tax it is reinvested in a taxable account. The
   * household's largest taxable account takes it; a household without one
   * gets this account, which appears in the result only if it is used.
   */
  const reinvestAccount: AccountProjection | null = accounts.some((a) => a.taxTreatment === "taxable")
    ? null
    : {
        name: REINVESTED_ACCOUNT_NAME,
        owner: "self",
        accountType: "brokerage",
        taxTreatment: "taxable",
        currentValue: 0,
        projectedValues: [],
        contributionPerYear: [],
      };
  const holdings = (): AccountProjection[] =>
    reinvestAccount ? [...accountProjs, reinvestAccount] : accountProjs;
  const latest = (ap: AccountProjection) => ap.projectedValues[ap.projectedValues.length - 1];

  /** Take `amount` from `from` in proportion to their balances; reports how much was tax-deferred. */
  function draw(from: AccountProjection[], amount: number): { total: number; taxDeferred: number } {
    const available = from.reduce((s, ap) => s + latest(ap), 0);
    if (available <= 0 || amount <= 0) return { total: 0, taxDeferred: 0 };
    const take = Math.min(amount, available);
    let total = 0;
    let taxDeferred = 0;
    for (const ap of from) {
      const value = latest(ap);
      const w = Math.round(take * (value / available));
      ap.projectedValues[ap.projectedValues.length - 1] = value - w;
      total += w;
      if (ap.taxTreatment === "tax_deferred") taxDeferred += w;
    }
    return { total, taxDeferred };
  }

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
  const taxesArr: number[] = [];
  const reinvestedArr: number[] = [];
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
    if (reinvestAccount) {
      const prev = reinvestAccount.projectedValues.length > 0 ? latest(reinvestAccount) : 0;
      reinvestAccount.projectedValues.push(Math.round(prev * (1 + rate)));
      reinvestAccount.contributionPerYear.push(0);
    }

    // Withdrawals in retirement
    let yearWithdrawal = 0;
    let yearTax = 0;
    let yearReinvested = 0;
    let yearRmd = 0;

    // Required distributions are owed by tax-deferred money, whatever the
    // account type: a Roth 401(k) owes none, a traditional annuity does.
    const taxDeferredAccounts = accountProjs.filter((ap) => ap.taxTreatment === "tax_deferred");
    const yearTaxDeferredBal = taxDeferredAccounts.reduce((s, ap) => s + latest(ap), 0);

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

      // What the household needs from savings after Social Security, in
      // spendable (after-tax) dollars.
      const expenseBased = Math.max(0, inflatedExpenses - inflatedSS);
      const totalCurrent = holdings().reduce((s, ap) => s + latest(ap), 0);
      const rateBased = withdrawalRatePct ? totalCurrent * (withdrawalRatePct / 100) : 0;

      // RMD — the mandatory minimum from tax-deferred accounts at 73+.
      yearRmd = calculateRMD(yearTaxDeferredBal, age);

      /**
       * Every withdrawal is taxed on its tax-deferred part, and the tax comes
       * out of savings too. The RMD is taken first, from the accounts that
       * owe it; anything more comes from all accounts in proportion. So a
       * gross withdrawal G is taxed on the RMD plus the tax-deferred share
       * of (G - RMD).
       */
      const remainingDeferred = yearTaxDeferredBal - yearRmd;
      const remainingTotal = totalCurrent - yearRmd;
      const deferredShare = remainingTotal > 0 ? remainingDeferred / remainingTotal : 0;
      const taxOn = (gross: number) => {
        const g = Math.max(gross, yearRmd);
        return projectedIncomeTax(yearRmd + deferredShare * (g - yearRmd), inflatedSS, inflation, taxTable);
      };
      // The gross withdrawal that leaves `net` to spend once its own tax is
      // paid, the RMD's tax included since it is taken regardless. Converges
      // because each extra dollar costs at most the top rate. It can come out
      // below the RMD, which is how a surplus distribution is recognised.
      const grossFor = (net: number) => {
        let gross = net;
        for (let i = 0; i < 100; i++) {
          const next = net + taxOn(gross);
          const done = Math.abs(next - gross) < 0.5;
          gross = next;
          if (done) break;
        }
        return gross;
      };

      // The planned withdrawal by method, and what the household spends of it.
      let gross: number;
      let spend: number;
      const expenseGross = grossFor(expenseBased);
      const rateSpend = Math.max(0, rateBased - taxOn(rateBased));
      switch (withdrawalMethod) {
        case "expense":
          gross = expenseGross;
          spend = expenseBased;
          break;
        case "rate":
          gross = rateBased;
          spend = rateSpend;
          break;
        case "higher":
        default:
          gross = Math.max(expenseGross, rateBased);
          spend = expenseGross >= rateBased ? expenseBased : rateSpend;
          break;
      }

      // RMDs are mandatory: at least the RMD leaves the tax-deferred accounts.
      // A cap on withdrawals cannot reduce it.
      if (maxAnnualWithdrawal && maxAnnualWithdrawal > 0) {
        gross = Math.min(gross, maxAnnualWithdrawal);
      }
      const forcedByRmd = yearRmd > gross;
      gross = Math.max(gross, yearRmd);

      if (totalCurrent > 0 && gross > 0) {
        const rmd = draw(taxDeferredAccounts, yearRmd);
        const rest = draw(holdings(), gross - rmd.total);
        yearWithdrawal = rmd.total + rest.total;
        yearTax = projectedIncomeTax(rmd.taxDeferred + rest.taxDeferred, inflatedSS, inflation, taxTable);

        // An RMD larger than the spending need is not spent: after its tax it
        // goes back into a taxable account rather than disappearing.
        const surplus = yearWithdrawal - yearTax - spend;
        if (forcedByRmd && surplus >= 1) {
          const target =
            reinvestAccount ??
            accountProjs
              .filter((ap) => ap.taxTreatment === "taxable")
              .reduce((a, b) => (latest(b) > latest(a) ? b : a));
          yearReinvested = Math.round(surplus);
          target.projectedValues[target.projectedValues.length - 1] = latest(target) + yearReinvested;
        }
      }
    }

    withdrawalsArr.push(Math.round(yearWithdrawal));
    taxesArr.push(Math.round(yearTax));
    reinvestedArr.push(yearReinvested);
    contributionsArr.push(Math.round(yearTotalContributions));
    rmdArr.push(Math.round(yearRmd));
    taxDeferredArr.push(Math.round(yearTaxDeferredBal));

    const yearTotal = holdings().reduce((s, ap) => s + latest(ap), 0);
    totalValues.push(yearTotal);
  }

  return {
    years,
    ages,
    phases,
    totalValues,
    accountProjections:
      reinvestAccount && reinvestAccount.projectedValues.some((v) => v > 0)
        ? [...accountProjs, reinvestAccount]
        : accountProjs,
    ssIncome: ssIncomeArr,
    withdrawals: withdrawalsArr,
    taxes: taxesArr,
    reinvested: reinvestedArr,
    contributions: contributionsArr,
    rmdAmounts: rmdArr,
    taxDeferredBalance: taxDeferredArr,
  };
}
