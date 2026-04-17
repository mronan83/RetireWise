/**
 * Financial analytics calculation engine.
 * Powers RMDs, tax projections, Roth conversions, SS break-even,
 * catch-up contributions, income replacement, fee analysis, and more.
 */

// ============================================================
// 1. RMD (Required Minimum Distribution) Projections
// ============================================================

// IRS Uniform Lifetime Table (simplified — distribution periods by age)
const RMD_TABLE: Record<number, number> = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
  79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8,
  85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2,
  91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
};

export function calculateRMD(balance: number, age: number): number {
  if (age < 73) return 0;
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
}): RMDProjection[] {
  const { taxDeferredBalance, currentAge, returnPct, yearsToProject, startYear } = params;
  const results: RMDProjection[] = [];
  let balance = taxDeferredBalance;

  for (let y = 0; y < yearsToProject; y++) {
    const age = currentAge + y;
    const year = startYear + y;
    const rmd = calculateRMD(balance, age);
    const tax = estimateTaxMFJ(rmd);
    const growth = (balance - rmd) * (returnPct / 100);
    const endBalance = balance - rmd + growth;

    if (age >= 73 || balance > 0) {
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

// 2025 MFJ brackets
const TAX_BRACKETS_MFJ = [
  { limit: 23200, rate: 0.10 },
  { limit: 94300, rate: 0.12 },
  { limit: 201050, rate: 0.22 },
  { limit: 383900, rate: 0.24 },
  { limit: 487450, rate: 0.32 },
  { limit: 731200, rate: 0.35 },
  { limit: Infinity, rate: 0.37 },
];
const STANDARD_DEDUCTION_MFJ = 29200;

export function estimateTaxMFJ(taxableIncome: number): number {
  const taxable = Math.max(0, taxableIncome - STANDARD_DEDUCTION_MFJ);
  let tax = 0;
  let prev = 0;
  for (const bracket of TAX_BRACKETS_MFJ) {
    if (taxable <= prev) break;
    const inBracket = Math.min(taxable, bracket.limit) - prev;
    tax += inBracket * bracket.rate;
    prev = bracket.limit;
  }
  return tax;
}

export function getMarginalRate(taxableIncome: number): number {
  const taxable = Math.max(0, taxableIncome - STANDARD_DEDUCTION_MFJ);
  for (const bracket of TAX_BRACKETS_MFJ) {
    if (taxable <= bracket.limit) return bracket.rate;
  }
  return 0.37;
}

export function getRemainingInBracket(taxableIncome: number): {
  currentRate: number;
  roomInBracket: number;
  nextRate: number;
} {
  const taxable = Math.max(0, taxableIncome - STANDARD_DEDUCTION_MFJ);
  for (let i = 0; i < TAX_BRACKETS_MFJ.length; i++) {
    if (taxable <= TAX_BRACKETS_MFJ[i].limit) {
      return {
        currentRate: TAX_BRACKETS_MFJ[i].rate,
        roomInBracket: TAX_BRACKETS_MFJ[i].limit - taxable,
        nextRate: i < TAX_BRACKETS_MFJ.length - 1 ? TAX_BRACKETS_MFJ[i + 1].rate : 0.37,
      };
    }
  }
  return { currentRate: 0.37, roomInBracket: 0, nextRate: 0.37 };
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
  otherTaxableIncome: number; // SS, pension, etc.
  returnPct: number;
  targetBracketRate: number; // e.g., 0.22 — fill up to the 22% bracket
  startYear: number;
}): RothConversionYear[] {
  const {
    currentAge, retirementAge, rmdStartAge, taxDeferredBalance,
    rothBalance, otherTaxableIncome, returnPct, targetBracketRate, startYear,
  } = params;

  // Find the top of the target bracket
  let targetBracketTop = 0;
  for (const bracket of TAX_BRACKETS_MFJ) {
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
    const taxableBeforeConversion = otherTaxableIncome;
    const adjustedIncome = Math.max(0, taxableBeforeConversion - STANDARD_DEDUCTION_MFJ);
    const room = Math.max(0, targetBracketTop - adjustedIncome);
    const conversionAmount = Math.min(room, tradBalance);

    const taxOnConversion = conversionAmount > 0
      ? estimateTaxMFJ(taxableBeforeConversion + conversionAmount) - estimateTaxMFJ(taxableBeforeConversion)
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
      marginalRateOnConversion: conversionAmount > 0 ? getMarginalRate(taxableBeforeConversion + conversionAmount) : 0,
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

export function calculateSSBreakEven(
  benefitAtFRA: number,
  fra: number
): SSBreakEven[] {
  const ages = [62, 63, 64, 65, 66, 67, 68, 69, 70];
  const results: SSBreakEven[] = [];

  for (const claimAge of ages) {
    let monthly: number;
    if (claimAge < fra) {
      const yearsEarly = fra - claimAge;
      monthly = benefitAtFRA * (1 - 0.0667 * yearsEarly);
    } else if (claimAge > fra) {
      const yearsDelayed = claimAge - fra;
      monthly = benefitAtFRA * (1 + 0.08 * yearsDelayed);
    } else {
      monthly = benefitAtFRA;
    }

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
  const limits: Record<string, { regular: number; catchUp50: number; catchUp60: number }> = {
    "401k": { regular: 23500, catchUp50: 7500, catchUp60: 11250 },
    "403b": { regular: 23500, catchUp50: 7500, catchUp60: 11250 },
    ira_traditional: { regular: 7000, catchUp50: 1000, catchUp60: 1000 },
    ira_roth: { regular: 7000, catchUp50: 1000, catchUp60: 1000 },
    hsa: { regular: 4300, catchUp50: 1000, catchUp60: 1000 },
  };

  const acctLimits = limits[accountType] || limits["401k"];
  const results: CatchUpProjection[] = [];
  let cumulativeExtra = 0;

  for (let age = currentAge; age < retirementAge; age++) {
    const isOver50 = age >= 50;
    const is60to63 = age >= 60 && age <= 63;
    const catchUp = is60to63 ? acctLimits.catchUp60 : isOver50 ? acctLimits.catchUp50 : 0;
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

// Historical annual S&P 500 returns (2000-2023)
const HISTORICAL_RETURNS = [
  -9.1, -11.9, -22.1, 28.7, 10.9, 4.9, 15.8, 5.5, -37.0, 26.5,
  15.1, 2.1, 16.0, 32.4, 13.7, 1.4, 12.0, 21.8, -4.4, 31.5,
  18.4, 28.7, -18.1, 26.3,
];

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
}): SequenceRiskResult[] {
  const { portfolioAtRetirement, annualWithdrawal, years } = params;

  function simulate(returns: number[], name: string, desc: string): SequenceRiskResult {
    let balance = portfolioAtRetirement;
    const yby: { year: number; returnPct: number; balance: number }[] = [];
    for (let y = 0; y < years; y++) {
      const ret = returns[y % returns.length];
      balance = balance * (1 + ret / 100) - annualWithdrawal;
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
}): HealthcareCostProjection[] {
  const { currentAge, retirementAge, yearsToProject, annualRetirementIncome, inflationPct } = params;
  const results: HealthcareCostProjection[] = [];
  const healthInflation = Math.max(inflationPct, 5); // healthcare inflates faster

  // 2025 base costs
  const preMedicareMonthly = 1200; // ACA marketplace estimate for couple
  const partBMonthly = 185; // per person
  const partDMonthly = 35; // per person
  const medigapMonthly = 250; // per person
  const outOfPocketAnnual = 5000; // per couple

  for (let y = 0; y < yearsToProject; y++) {
    const age = retirementAge + y;
    if (age < retirementAge) continue;

    const inflFactor = Math.pow(1 + healthInflation / 100, y);
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

      // IRMAA surcharge for higher earners
      if (annualRetirementIncome > 206000) {
        const surcharge = 500 * 2 * 12 * inflFactor; // rough IRMAA surcharge
        premium += surcharge;
        irmaa = "IRMAA surcharge applies (income > $206k)";
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
