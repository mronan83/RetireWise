/**
 * Financial analytics calculation engine.
 * Powers RMDs, tax projections, Roth conversions, SS break-even,
 * catch-up contributions, income replacement, fee analysis, and more.
 */

import {
  BUILT_IN_TAX_YEAR,
  DEFAULT_TAX_TABLE,
  type TaxTable,
} from "@/lib/tax/table";

// ============================================================
// 1. RMD (Required Minimum Distribution) Projections
// ============================================================

/**
 * The age required minimum distributions begin, under SECURE 2.0.
 *
 * Exported and used everywhere rather than written as a literal: the label on
 * the analytics page said "Age 73" while the figure beside it came from a
 * different year entirely, and a shared constant is what keeps a caption and
 * the number under it describing the same thing.
 */
export const RMD_START_AGE = 73;

// IRS Uniform Lifetime Table (simplified — distribution periods by age)
const RMD_TABLE: Record<number, number> = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
  79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8,
  85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2,
  91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
};

export function calculateRMD(balance: number, age: number): number {
  if (age < RMD_START_AGE) return 0;
  const divisor = RMD_TABLE[age] || Math.max(5, 95 - age + 8.9);
  return balance / divisor;
}

export type RMDProjection = {
  age: number;
  year: number;
  beginningBalance: number;
  rmdAmount: number;
  taxEstimate: number;
  endingBalance: number;
};

export function projectRMDs(params: {
  taxDeferredBalance: number;
  currentAge: number;
  returnPct: number;
  yearsToProject: number;
  startYear: number;
  /**
   * Everything else taxable in the same year — Social Security's taxable
   * portion, pensions, other withdrawals.
   *
   * The tax figure used to be estimateTaxMFJ(rmd) with the RMD as the only
   * income, so the whole standard deduction and the entire 10% and 12%
   * bands were applied to it. A distribution stacked on top of Social
   * Security is taxed at the household's MARGINAL rate, not from zero, and
   * the difference on a six-figure RMD is tens of thousands of dollars in
   * the direction that makes the plan look easier.
   */
  otherTaxableIncome?: number;
  /** Federal figures to compute with. Defaults to the built-in fallback. */
  taxTable?: TaxTable;
}): RMDProjection[] {
  const {
    taxDeferredBalance, currentAge, returnPct, yearsToProject, startYear,
    otherTaxableIncome = 0, taxTable = DEFAULT_TAX_TABLE,
  } = params;
  const results: RMDProjection[] = [];
  let balance = taxDeferredBalance;

  for (let y = 0; y < yearsToProject; y++) {
    const age = currentAge + y;
    const year = startYear + y;
    const rmd = calculateRMD(balance, age);
    // The marginal cost of the distribution: what the household owes with it
    // minus what it owes without. Taxing the RMD in isolation handed it a
    // second standard deduction and a second run up through the low bands.
    const tax =
      estimateTaxMFJ(otherTaxableIncome + rmd, taxTable) -
      estimateTaxMFJ(otherTaxableIncome, taxTable);
    const growth = (balance - rmd) * (returnPct / 100);
    const endBalance = balance - rmd + growth;

    if (age >= RMD_START_AGE || balance > 0) {
      results.push({
        age,
        year,
        beginningBalance: Math.round(balance),
        rmdAmount: Math.round(rmd),
        taxEstimate: Math.round(tax),
        endingBalance: Math.round(Math.max(0, endBalance)),
      });
    }
    balance = Math.max(0, endBalance);
  }
  return results;
}

// ============================================================
// 2. Tax Projection Engine (Married Filing Jointly)
// ============================================================

/**
 * Federal brackets and standard deduction, married filing jointly.
 *
 * These are no longer constants in this file. They were, and they were
 * wrong: commented "2025" while carrying 2024 figures — the 2024 MFJ 10%
 * bracket tops out at $23,200 and its standard deduction is $29,200, both
 * of which is what sat here. Nothing in the app said which year it was
 * computing, so a caption and a number disagreeing had nowhere to surface.
 *
 * They now come from the `tax_reference` table via loadTaxTable(), with
 * DEFAULT_TAX_TABLE as the fallback and `table.taxYear` / `table.source`
 * carried all the way to the UI. The parameter is optional so that every
 * existing call site keeps working and keeps its old behaviour — but a
 * caller that wants the live figures passes them.
 *
 * TAX_YEAR remains exported as the built-in year, for callers that only
 * want to know what the fallback would say.
 */
export const TAX_YEAR = BUILT_IN_TAX_YEAR;

export function estimateTaxMFJ(
  taxableIncome: number,
  table: TaxTable = DEFAULT_TAX_TABLE
): number {
  const taxable = Math.max(0, taxableIncome - table.standardDeduction);
  let tax = 0;
  let prev = 0;
  for (const bracket of table.brackets) {
    if (taxable <= prev) break;
    const inBracket = Math.min(taxable, bracket.limit) - prev;
    tax += inBracket * bracket.rate;
    prev = bracket.limit;
  }
  return tax;
}

export function getMarginalRate(
  taxableIncome: number,
  table: TaxTable = DEFAULT_TAX_TABLE
): number {
  const taxable = Math.max(0, taxableIncome - table.standardDeduction);
  for (const bracket of table.brackets) {
    if (taxable <= bracket.limit) return bracket.rate;
  }
  return topRate(table);
}

export function getRemainingInBracket(
  taxableIncome: number,
  table: TaxTable = DEFAULT_TAX_TABLE
): {
  currentRate: number;
  roomInBracket: number;
  nextRate: number;
} {
  const taxable = Math.max(0, taxableIncome - table.standardDeduction);
  const brackets = table.brackets;
  for (let i = 0; i < brackets.length; i++) {
    if (taxable <= brackets[i].limit) {
      return {
        currentRate: brackets[i].rate,
        roomInBracket: brackets[i].limit - taxable,
        nextRate: i < brackets.length - 1 ? brackets[i + 1].rate : topRate(table),
      };
    }
  }
  return { currentRate: topRate(table), roomInBracket: 0, nextRate: topRate(table) };
}

/**
 * The top marginal rate, read off the table rather than hard-coded at 0.37.
 *
 * The three functions above each carried their own literal 0.37, so a year
 * whose top rate changed would have been right in the bracket walk and
 * wrong in every fallback branch — and only for the highest earners, where
 * nobody would have checked.
 */
function topRate(table: TaxTable): number {
  return table.brackets[table.brackets.length - 1]?.rate ?? 0.37;
}

export type YearlyTaxProjection = {
  age: number;
  year: number;
  taxDeferredWithdrawal: number;
  rothWithdrawal: number;
  taxableWithdrawal: number;
  ssIncome: number;
  ssTaxable: number; // 85% of SS for higher earners
  totalTaxableIncome: number;
  federalTax: number;
  effectiveRate: number;
  marginalRate: number;
  afterTaxIncome: number;
};

// ============================================================
// 3. Roth Conversion Ladder
// ============================================================

export type RothConversionYear = {
  age: number;
  year: number;
  taxableIncomeBeforeConversion: number;
  optimalConversionAmount: number;
  taxOnConversion: number;
  marginalRateOnConversion: number;
  cumulativeConverted: number;
  remainingTraditional: number;
  rothBalance: number;
};

export function calculateRothConversionLadder(params: {
  currentAge: number;
  retirementAge: number;
  rmdStartAge: number;
  taxDeferredBalance: number;
  rothBalance: number;
  /**
   * Other taxable income in the year the caller is asking about.
   *
   * A function of age rather than one number, because the conversion window
   * spans years in which Social Security may not yet be claimed — and those
   * are the cheapest years to convert. A flat figure filled the bracket in
   * exactly the years the strategy depends on.
   */
  otherTaxableIncomeForAge: (age: number) => number;
  returnPct: number;
  targetBracketRate: number; // e.g., 0.22 — fill up to the 22% bracket
  startYear: number;
  /** Federal figures to compute with. Defaults to the built-in fallback. */
  taxTable?: TaxTable;
}): RothConversionYear[] {
  const {
    currentAge, retirementAge, rmdStartAge, taxDeferredBalance,
    rothBalance, otherTaxableIncomeForAge, returnPct, targetBracketRate, startYear,
    taxTable = DEFAULT_TAX_TABLE,
  } = params;

  // Find the top of the target bracket
  let targetBracketTop = 0;
  for (const bracket of taxTable.brackets) {
    if (bracket.rate <= targetBracketRate) {
      targetBracketTop = bracket.limit;
    }
  }

  const results: RothConversionYear[] = [];
  let tradBalance = taxDeferredBalance;
  let rothBal = rothBalance;
  let cumConverted = 0;

  // Conversion window: from retirement to RMD start (or current age if already retired)
  const conversionStart = Math.max(currentAge, retirementAge);
  const conversionEnd = rmdStartAge;

  for (let age = conversionStart; age < conversionEnd; age++) {
    // Grow balances
    tradBalance *= (1 + returnPct / 100);
    rothBal *= (1 + returnPct / 100);

    // How much room in the target bracket?
    const taxableBeforeConversion = otherTaxableIncomeForAge(age);
    const adjustedIncome = Math.max(0, taxableBeforeConversion - taxTable.standardDeduction);
    const room = Math.max(0, targetBracketTop - adjustedIncome);
    const conversionAmount = Math.min(room, tradBalance);

    const taxOnConversion = conversionAmount > 0
      ? estimateTaxMFJ(taxableBeforeConversion + conversionAmount, taxTable) -
        estimateTaxMFJ(taxableBeforeConversion, taxTable)
      : 0;

    tradBalance -= conversionAmount;
    rothBal += conversionAmount;
    cumConverted += conversionAmount;

    results.push({
      age,
      year: startYear + (age - currentAge),
      taxableIncomeBeforeConversion: Math.round(taxableBeforeConversion),
      optimalConversionAmount: Math.round(conversionAmount),
      taxOnConversion: Math.round(taxOnConversion),
      marginalRateOnConversion:
        conversionAmount > 0
          ? getMarginalRate(taxableBeforeConversion + conversionAmount, taxTable)
          : 0,
      cumulativeConverted: Math.round(cumConverted),
      remainingTraditional: Math.round(tradBalance),
      rothBalance: Math.round(rothBal),
    });
  }

  return results;
}

// ============================================================
// 4. Social Security Break-Even Analysis
// ============================================================

export type SSBreakEven = {
  claimingAge: number;
  monthlyBenefit: number;
  annualBenefit: number;
  cumulativeByAge: Record<number, number>;
  breakEvenVs62: number | null; // age at which this beats claiming at 62
};

/**
 * The monthly benefit when claiming at `claimAge`, from the benefit at full
 * retirement age, by the SSA's rule.
 *
 * Early claiming is not cut at a flat rate per year. It is 5/9 of one percent
 * per month for the first 36 months early, then 5/12 of one percent per month
 * beyond that: 6.667% a year, then 5%. Claiming at 62 against a full
 * retirement age of 67 is a 30% cut, not 33.35%. Delaying past full
 * retirement age earns 8% a year, up to 70.
 *
 * The one rule for every screen and the assistant; the Projections page once
 * used a flat 6.67% while Analytics used this.
 */
export function ssBenefitAtClaimingAge(benefitAtFRA: number, fra: number, claimAge: number): number {
  if (claimAge < fra) {
    const monthsEarly = (fra - claimAge) * 12;
    const firstTier = Math.min(monthsEarly, 36);
    const secondTier = Math.max(0, monthsEarly - 36);
    return benefitAtFRA * (1 - firstTier * (5 / 9 / 100) - secondTier * (5 / 12 / 100));
  }
  const yearsDelayed = Math.min(claimAge - fra, Math.max(0, 70 - fra));
  return benefitAtFRA * (1 + 0.08 * yearsDelayed);
}

export function calculateSSBreakEven(
  benefitAtFRA: number,
  fra: number
): SSBreakEven[] {
  const ages = [62, 63, 64, 65, 66, 67, 68, 69, 70];
  const results: SSBreakEven[] = [];

  for (const claimAge of ages) {
    const monthly = ssBenefitAtClaimingAge(benefitAtFRA, fra, claimAge);

    const annual = monthly * 12;
    const cumulative: Record<number, number> = {};
    let total = 0;
    for (let age = claimAge; age <= 95; age++) {
      total += annual;
      cumulative[age] = Math.round(total);
    }

    results.push({
      claimingAge: claimAge,
      monthlyBenefit: Math.round(monthly),
      annualBenefit: Math.round(annual),
      cumulativeByAge: cumulative,
    } as SSBreakEven);
  }

  // Calculate break-even vs age 62
  const base62 = results.find((r) => r.claimingAge === 62)!;
  for (const r of results) {
    if (r.claimingAge === 62) {
      r.breakEvenVs62 = null;
      continue;
    }
    let breakEven: number | null = null;
    for (let age = r.claimingAge; age <= 95; age++) {
      if ((r.cumulativeByAge[age] || 0) >= (base62.cumulativeByAge[age] || 0)) {
        breakEven = age;
        break;
      }
    }
    r.breakEvenVs62 = breakEven;
  }

  return results;
}

// ============================================================
// 5. Catch-Up Contribution Calculator
// ============================================================

export type CatchUpProjection = {
  age: number;
  regularLimit: number;
  catchUpAmount: number;
  totalLimit: number;
  additionalGrowth: number;
  cumulativeExtra: number;
};

export function calculateCatchUpImpact(params: {
  currentAge: number;
  retirementAge: number;
  returnPct: number;
  accountType: string;
}): CatchUpProjection[] {
  const { currentAge, retirementAge, returnPct, accountType } = params;
  // catchUpAge differs by account: an HSA's extra $1,000 begins at 55, not
  // 50, and has no 60-63 enhancement. Treating every account as 50 handed
  // HSA holders five years of contributions they are not entitled to.
  const limits: Record<
    string,
    { regular: number; catchUp50: number; catchUp60: number; catchUpAge: number; superCatchUp: boolean }
  > = {
    "401k": { regular: 23500, catchUp50: 7500, catchUp60: 11250, catchUpAge: 50, superCatchUp: true },
    "403b": { regular: 23500, catchUp50: 7500, catchUp60: 11250, catchUpAge: 50, superCatchUp: true },
    ira_traditional: { regular: 7000, catchUp50: 1000, catchUp60: 1000, catchUpAge: 50, superCatchUp: false },
    ira_roth: { regular: 7000, catchUp50: 1000, catchUp60: 1000, catchUpAge: 50, superCatchUp: false },
    hsa: { regular: 4300, catchUp50: 1000, catchUp60: 1000, catchUpAge: 55, superCatchUp: false },
  };

  const acctLimits = limits[accountType] || limits["401k"];
  const results: CatchUpProjection[] = [];
  let cumulativeExtra = 0;

  for (let age = currentAge; age < retirementAge; age++) {
    const eligible = age >= acctLimits.catchUpAge;
    const is60to63 = acctLimits.superCatchUp && age >= 60 && age <= 63;
    const catchUp = !eligible ? 0 : is60to63 ? acctLimits.catchUp60 : acctLimits.catchUp50;
    const totalLimit = acctLimits.regular + catchUp;

    // Extra growth from catch-up contributions
    const yearsToGrow = retirementAge - age;
    const extraGrowth = catchUp * (Math.pow(1 + returnPct / 100, yearsToGrow) - 1);
    cumulativeExtra += catchUp + extraGrowth;

    results.push({
      age,
      regularLimit: acctLimits.regular,
      catchUpAmount: catchUp,
      totalLimit,
      additionalGrowth: Math.round(extraGrowth),
      cumulativeExtra: Math.round(cumulativeExtra),
    });
  }

  return results;
}

// ============================================================
// 6. Income Replacement Ratio
// ============================================================

export type IncomeReplacement = {
  preTaxHouseholdIncome: number;
  projectedRetirementIncome: number;
  replacementRatio: number;
  target: number; // typically 70-80%
  gap: number;
  sources: {
    portfolioWithdrawal: number;
    selfSS: number;
    spouseSS: number;
    pension: number;
    other: number;
  };
};

export function calculateIncomeReplacement(params: {
  selfSalary: number;
  spouseSalary: number;
  portfolioAtRetirement: number;
  withdrawalRate: number;
  selfSSMonthly: number;
  spouseSSMonthly: number;
  pensionMonthly: number;
}): IncomeReplacement {
  const {
    selfSalary, spouseSalary, portfolioAtRetirement,
    withdrawalRate, selfSSMonthly, spouseSSMonthly, pensionMonthly,
  } = params;

  const preTax = selfSalary + spouseSalary;
  const portfolioIncome = portfolioAtRetirement * (withdrawalRate / 100);
  const ssIncome = (selfSSMonthly + spouseSSMonthly) * 12;
  const pensionIncome = pensionMonthly * 12;
  const totalRetirement = portfolioIncome + ssIncome + pensionIncome;
  const ratio = preTax > 0 ? (totalRetirement / preTax) * 100 : 0;

  return {
    preTaxHouseholdIncome: Math.round(preTax),
    projectedRetirementIncome: Math.round(totalRetirement),
    replacementRatio: Math.round(ratio),
    target: 80,
    gap: Math.round(preTax * 0.8 - totalRetirement),
    sources: {
      portfolioWithdrawal: Math.round(portfolioIncome),
      selfSS: Math.round(selfSSMonthly * 12),
      spouseSS: Math.round(spouseSSMonthly * 12),
      pension: Math.round(pensionIncome),
      other: 0,
    },
  };
}

// ============================================================
// 7. Fee Impact Analysis
// ============================================================

// Common fund expense ratios
const KNOWN_EXPENSE_RATIOS: Record<string, number> = {
  VTI: 0.03, VOO: 0.03, VXUS: 0.07, VEA: 0.05, VWO: 0.08,
  BND: 0.03, VBTLX: 0.05, AGG: 0.03, VNQ: 0.12,
  FXAIX: 0.015, FSKAX: 0.015, FTIHX: 0.06, FZROX: 0, FZILX: 0,
  QQQ: 0.20, SPY: 0.09, IVV: 0.03, SCHB: 0.03, SCHD: 0.06,
  ITOT: 0.03, IXUS: 0.07, IEFA: 0.07, IEMG: 0.09,
  SPAXX: 0, FDRXX: 0, VMFXX: 0,
};

export type FeeImpact = {
  holdings: {
    ticker: string;
    value: number;
    expenseRatio: number;
    annualFee: number;
    tenYearDrag: number;
    thirtyYearDrag: number;
  }[];
  totalAnnualFees: number;
  weightedExpenseRatio: number;
  tenYearCumulativeDrag: number;
  thirtyYearCumulativeDrag: number;
};

export function calculateFeeImpact(
  holdings: { ticker: string; currentValue: number }[],
  returnPct: number
): FeeImpact {
  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const holdingFees = holdings.map((h) => {
    const er = KNOWN_EXPENSE_RATIOS[h.ticker] ?? 0.15; // default 0.15% if unknown
    const annualFee = h.currentValue * (er / 100);
    // Fee drag: difference between growth with and without fees
    const withFees10 = h.currentValue * Math.pow(1 + (returnPct - er) / 100, 10);
    const withoutFees10 = h.currentValue * Math.pow(1 + returnPct / 100, 10);
    const withFees30 = h.currentValue * Math.pow(1 + (returnPct - er) / 100, 30);
    const withoutFees30 = h.currentValue * Math.pow(1 + returnPct / 100, 30);

    return {
      ticker: h.ticker,
      value: h.currentValue,
      expenseRatio: er,
      annualFee: Math.round(annualFee),
      tenYearDrag: Math.round(withoutFees10 - withFees10),
      thirtyYearDrag: Math.round(withoutFees30 - withFees30),
    };
  });

  const totalAnnualFees = holdingFees.reduce((s, h) => s + h.annualFee, 0);
  const weightedER = totalValue > 0
    ? holdingFees.reduce((s, h) => s + h.expenseRatio * (h.value / totalValue), 0)
    : 0;

  return {
    holdings: holdingFees.sort((a, b) => b.annualFee - a.annualFee),
    totalAnnualFees: Math.round(totalAnnualFees),
    weightedExpenseRatio: Math.round(weightedER * 1000) / 1000,
    tenYearCumulativeDrag: holdingFees.reduce((s, h) => s + h.tenYearDrag, 0),
    thirtyYearCumulativeDrag: holdingFees.reduce((s, h) => s + h.thirtyYearDrag, 0),
  };
}

// ============================================================
// 8. Sequence of Returns Risk
// ============================================================

export type SequenceRiskResult = {
  scenario: string;
  description: string;
  yearByYear: { year: number; returnPct: number; balance: number }[];
  endBalance: number;
  survived: boolean;
};

export function calculateSequenceRisk(params: {
  portfolioAtRetirement: number;
  annualWithdrawal: number;
  years: number;
  /**
   * Inflation applied to the withdrawal each year.
   *
   * A flat nominal withdrawal held for thirty years is not a stress test —
   * it quietly halves the real drawdown over the period, in the one tool
   * whose entire purpose is to find out whether a bad decade breaks the
   * plan. Defaulted rather than required so existing callers do not silently
   * change meaning, but every caller in the app now passes it.
   */
  inflationPct?: number;
}): SequenceRiskResult[] {
  const { portfolioAtRetirement, annualWithdrawal, years, inflationPct = 0 } = params;

  function simulate(returns: number[], name: string, desc: string): SequenceRiskResult {
    let balance = portfolioAtRetirement;
    const yby: { year: number; returnPct: number; balance: number }[] = [];
    for (let y = 0; y < years; y++) {
      const ret = returns[y % returns.length];
      const withdrawal = annualWithdrawal * Math.pow(1 + inflationPct / 100, y);
      balance = balance * (1 + ret / 100) - withdrawal;
      balance = Math.max(0, balance);
      yby.push({ year: y + 1, returnPct: ret, balance: Math.round(balance) });
    }
    return { scenario: name, description: desc, yearByYear: yby, endBalance: Math.round(balance), survived: balance > 0 };
  }

  // Scenario 1: Bear market first (2000-2009 then recovery)
  const bearFirst = [-9.1, -11.9, -22.1, 28.7, 10.9, 4.9, 15.8, 5.5, -37.0, 26.5, 15.1, 16.0, 32.4, 13.7, 12.0, 21.8, 31.5, 18.4, 28.7, 26.3, 15.0, 12.0, 10.0, 8.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0];

  // Scenario 2: Bull market first (reverse order)
  const bullFirst = [...bearFirst].reverse();

  // Scenario 3: Steady 7%
  const steady = Array(30).fill(7.0);

  // Scenario 4: 2008-style crash in year 1
  const crashYear1 = [-37.0, 26.5, 15.1, 16.0, 32.4, 13.7, 12.0, 21.8, -4.4, 31.5, 18.4, 28.7, 10.0, 8.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0];

  return [
    simulate(bearFirst, "Bear Market First", "Retire into a lost decade (2000-2009), then recovery. Worst case for sequence risk."),
    simulate(bullFirst, "Bull Market First", "Strong early returns, downturn later. Best case — early gains compound."),
    simulate(steady, "Steady 7%", "Constant 7% annual return. No volatility — the textbook assumption."),
    simulate(crashYear1, "2008 Crash Year 1", "Massive 37% drop in your first year of retirement, then recovery."),
  ];
}

// ============================================================
// 9. Healthcare Cost Modeling
// ============================================================

/**
 * Medicare IRMAA surcharges by modified adjusted gross income, married
 * filing jointly. Part B and Part D are published as separate schedules
 * and change independently, so they are stored and summed separately; see
 * src/lib/tax/table.ts.
 *
 * The tiers are cliffs: one dollar over a threshold moves the whole
 * surcharge to the next tier.
 */

function formatUsd(n: number): string {
  return `$${Math.round(n)}`;
}

export type HealthcareCostProjection = {
  age: number;
  year: number;
  medicarePremium: number; // Part B + D
  supplemental: number; // Medigap/Advantage
  outOfPocket: number;
  totalAnnual: number;
  irmaaNote: string;
  phase: "pre-medicare" | "medicare";
};

export function projectHealthcareCosts(params: {
  currentAge: number;
  retirementAge: number;
  yearsToProject: number;
  annualRetirementIncome: number; // for IRMAA calculation
  inflationPct: number;
  /** Medicare and IRMAA figures to compute with. Defaults to the built-in fallback. */
  taxTable?: TaxTable;
}): HealthcareCostProjection[] {
  const {
    currentAge, retirementAge, yearsToProject, annualRetirementIncome, inflationPct,
    taxTable = DEFAULT_TAX_TABLE,
  } = params;
  const results: HealthcareCostProjection[] = [];
  const healthInflation = Math.max(inflationPct, 5); // healthcare inflates faster

  // Base costs for taxTable.taxYear. These go stale every January, which is
  // why they come from the tax_reference table rather than from literals
  // here, and why the table carries the year it was seeded for.
  const preMedicareMonthly = taxTable.preMedicarePremiumMonthly; // ACA marketplace, couple
  const partBMonthly = taxTable.medicarePartBMonthly; // per person
  const partDMonthly = taxTable.medicarePartDMonthly; // per person
  const medigapMonthly = taxTable.medigapMonthly; // per person
  const outOfPocketAnnual = taxTable.outOfPocketAnnual; // per couple

  for (let y = 0; y < yearsToProject; y++) {
    const age = retirementAge + y;
    if (age < retirementAge) continue;

    /**
     * Inflated from TODAY, not from retirement.
     *
     * The exponent was y — years since retirement — so the first year of
     * retirement used today's premiums however far away that year is. At 5%
     * over eighteen years that understated the cost of the very first year
     * by about 2.4x, and the same mistake sat in the projection engine's
     * expenses until this pass.
     */
    const yearsFromNow = age - currentAge;
    const inflFactor = Math.pow(1 + healthInflation / 100, yearsFromNow);
    const isMedicare = age >= 65;

    let annualCost: number;
    let premium: number;
    let supplemental: number;
    let oop: number;
    let irmaa = "";

    if (!isMedicare) {
      // Pre-Medicare: ACA marketplace
      premium = preMedicareMonthly * 12 * inflFactor;
      supplemental = 0;
      oop = outOfPocketAnnual * inflFactor;
      annualCost = premium + oop;
    } else {
      // Medicare
      premium = (partBMonthly + partDMonthly) * 2 * 12 * inflFactor; // both spouses
      supplemental = medigapMonthly * 2 * 12 * inflFactor;
      oop = outOfPocketAnnual * inflFactor;

      // IRMAA is tiered, and this applied a flat $500 per person per month
      // to anyone over the lowest threshold — close to the TOP tier. A
      // household a dollar over the line was charged roughly six times what
      // it owes, and the overstatement happened to mask the understatement
      // above, which is why neither showed up as an obviously wrong total.
      const tier = taxTable.irmaaTiers.find((t) => annualRetirementIncome <= t.upTo);
      if (tier && tier.monthlyPerPerson > 0) {
        premium += tier.monthlyPerPerson * 2 * 12 * inflFactor;
        irmaa = `IRMAA tier: +${formatUsd(tier.monthlyPerPerson)}/mo per person`;
      }
      annualCost = premium + supplemental + oop;
    }

    results.push({
      age,
      year: new Date().getFullYear() + (age - currentAge),
      medicarePremium: Math.round(premium),
      supplemental: Math.round(supplemental),
      outOfPocket: Math.round(oop),
      totalAnnual: Math.round(annualCost),
      irmaaNote: irmaa,
      phase: isMedicare ? "medicare" : "pre-medicare",
    });
  }

  return results;
}
