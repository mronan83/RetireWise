/**
 * Retirement projection and Monte Carlo simulation engine.
 *
 * All dollar amounts are in today's dollars unless noted.
 * Returns are annual percentages (7 = 7%).
 */

import {
  type GlidePathConfig,
  getGlidePathParams,
} from "./glide-path";

export type ProjectionInput = {
  currentPortfolioValue: number;
  annualContributions: number; // combined household
  yearsToRetirement: number;
  expectedReturnPct: number; // nominal (e.g., 7)
  inflationPct: number; // e.g., 3
  monthlyExpensesRetirement: number;
  socialSecurityMonthlyIncome: number; // combined household SS at claiming
  yearsInRetirement: number; // e.g., 30
  glidePath?: GlidePathConfig; // optional glide path rebalancing
};

export type ProjectionResult = {
  yearByYear: YearProjection[];
  portfolioAtRetirement: number;
  portfolioAtRetirementReal: number; // inflation-adjusted
  totalContributed: number;
  totalGrowth: number;
  monthlyIncomeFromPortfolio: number; // using 4% rule
  totalMonthlyRetirementIncome: number; // portfolio + SS
  canSustainRetirement: boolean;
  yearsPortfolioLasts: number;
  shortfallMonthly: number; // 0 if sustainable
};

export type YearProjection = {
  year: number;
  age: number;
  portfolioValue: number;
  contributions: number;
  growth: number;
  withdrawals: number;
  ssIncome: number;
  phase: "accumulation" | "retirement";
};

export function calculateProjection(
  input: ProjectionInput,
  startAge: number
): ProjectionResult {
  const {
    currentPortfolioValue,
    annualContributions,
    yearsToRetirement,
    expectedReturnPct,
    inflationPct,
    monthlyExpensesRetirement,
    socialSecurityMonthlyIncome,
    yearsInRetirement,
    glidePath,
  } = input;

  const nominalReturnRate = expectedReturnPct / 100;
  const yearByYear: YearProjection[] = [];
  let portfolio = currentPortfolioValue;
  let totalContributed = 0;

  // Helper: get return rate for a given age (uses glide path if enabled)
  function getReturnRate(age: number): number {
    if (glidePath?.enabled) {
      return getGlidePathParams(age, glidePath).returnPct / 100;
    }
    return nominalReturnRate;
  }

  // Accumulation phase
  for (let y = 0; y < yearsToRetirement; y++) {
    const age = startAge + y + 1;
    const rate = getReturnRate(age);
    const growth = portfolio * rate;
    portfolio += growth + annualContributions;
    totalContributed += annualContributions;

    yearByYear.push({
      year: y + 1,
      age,
      portfolioValue: Math.round(portfolio),
      contributions: Math.round(annualContributions),
      growth: Math.round(growth),
      withdrawals: 0,
      ssIncome: 0,
      phase: "accumulation",
    });
  }

  const portfolioAtRetirement = portfolio;
  const inflationFactor = Math.pow(1 + inflationPct / 100, yearsToRetirement);
  const portfolioAtRetirementReal = portfolio / inflationFactor;

  // 4% rule monthly income
  const monthlyIncomeFromPortfolio = (portfolio * 0.04) / 12;
  const totalMonthlyRetirementIncome =
    monthlyIncomeFromPortfolio + socialSecurityMonthlyIncome;
  const annualExpenses = monthlyExpensesRetirement * 12;
  const annualSSIncome = socialSecurityMonthlyIncome * 12;

  // Retirement/drawdown phase — expenses grow with inflation each year
  const inflationRate = inflationPct / 100;
  let yearsPortfolioLasts = 0;
  for (let y = 0; y < yearsInRetirement; y++) {
    if (portfolio <= 0) break;

    const age = startAge + yearsToRetirement + y + 1;
    const rate = getReturnRate(age);

    // Expenses grow with inflation; SS has its own COLA (approximate as same rate)
    const inflatedExpenses = annualExpenses * Math.pow(1 + inflationRate, y);
    const inflatedSS = annualSSIncome * Math.pow(1 + inflationRate, y);
    const yearWithdrawalNeeded = Math.max(0, inflatedExpenses - inflatedSS);

    const growth = portfolio * rate;
    const withdrawal = Math.min(yearWithdrawalNeeded, portfolio + growth);
    portfolio = portfolio + growth - withdrawal;
    yearsPortfolioLasts = y + 1;

    yearByYear.push({
      year: yearsToRetirement + y + 1,
      age,
      portfolioValue: Math.max(0, Math.round(portfolio)),
      contributions: 0,
      growth: Math.round(growth),
      withdrawals: Math.round(withdrawal),
      ssIncome: Math.round(annualSSIncome),
      phase: "retirement",
    });
  }

  const canSustainRetirement =
    portfolio > 0 || yearsPortfolioLasts >= yearsInRetirement;
  const shortfallMonthly = canSustainRetirement
    ? 0
    : Math.max(0, monthlyExpensesRetirement - socialSecurityMonthlyIncome);

  return {
    yearByYear,
    portfolioAtRetirement: Math.round(portfolioAtRetirement),
    portfolioAtRetirementReal: Math.round(portfolioAtRetirementReal),
    totalContributed: Math.round(totalContributed),
    totalGrowth: Math.round(
      portfolioAtRetirement - currentPortfolioValue - totalContributed
    ),
    monthlyIncomeFromPortfolio: Math.round(monthlyIncomeFromPortfolio),
    totalMonthlyRetirementIncome: Math.round(totalMonthlyRetirementIncome),
    canSustainRetirement,
    yearsPortfolioLasts,
    shortfallMonthly: Math.round(shortfallMonthly),
  };
}

// Monte Carlo simulation
export type MonteCarloResult = {
  percentiles: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
  successRate: number; // % of simulations where money lasts
  medianAtRetirement: number;
  worstCase: number;
  bestCase: number;
  years: number[];
};

export function runMonteCarlo(
  input: ProjectionInput,
  startAge: number,
  numSimulations = 1000
): MonteCarloResult {
  const {
    currentPortfolioValue,
    annualContributions,
    yearsToRetirement,
    expectedReturnPct,
    monthlyExpensesRetirement,
    socialSecurityMonthlyIncome,
    yearsInRetirement,
    glidePath,
  } = input;

  const totalYears = yearsToRetirement + yearsInRetirement;
  const baseMeanReturn = expectedReturnPct / 100;
  const baseStdDev = 0.15; // typical stock/bond portfolio volatility
  const annualExpenses = monthlyExpensesRetirement * 12;
  const annualSSIncome = socialSecurityMonthlyIncome * 12;
  const annualWithdrawal = Math.max(0, annualExpenses - annualSSIncome);

  // Pre-compute per-year return and volatility (avoids recalculating per simulation)
  const yearMeanReturn: number[] = [];
  const yearStdDev: number[] = [];
  for (let y = 0; y < totalYears; y++) {
    const age = startAge + y + 1;
    if (glidePath?.enabled) {
      const params = getGlidePathParams(age, glidePath);
      yearMeanReturn.push(params.returnPct / 100);
      yearStdDev.push(params.volatility / 100);
    } else {
      yearMeanReturn.push(baseMeanReturn);
      yearStdDev.push(baseStdDev);
    }
  }

  // Run simulations
  const allPaths: number[][] = [];
  let successes = 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    const path: number[] = [];
    let portfolio = currentPortfolioValue;

    for (let y = 0; y < totalYears; y++) {
      // Random return using normal distribution (Box-Muller transform)
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const yearReturn = yearMeanReturn[y] + yearStdDev[y] * z;

      const growth = portfolio * yearReturn;

      if (y < yearsToRetirement) {
        portfolio += growth + annualContributions;
      } else {
        const withdrawal = Math.min(annualWithdrawal, portfolio + growth);
        portfolio = portfolio + growth - withdrawal;
      }

      portfolio = Math.max(0, portfolio);
      path.push(Math.round(portfolio));
    }

    allPaths.push(path);

    // Success = still has money at the end
    if (path[path.length - 1] > 0) {
      successes++;
    }
  }

  // Calculate percentiles for each year
  const percentiles = {
    p10: [] as number[],
    p25: [] as number[],
    p50: [] as number[],
    p75: [] as number[],
    p90: [] as number[],
  };

  const years: number[] = [];
  for (let y = 0; y < totalYears; y++) {
    const values = allPaths.map((p) => p[y]).sort((a, b) => a - b);
    percentiles.p10.push(values[Math.floor(numSimulations * 0.1)]);
    percentiles.p25.push(values[Math.floor(numSimulations * 0.25)]);
    percentiles.p50.push(values[Math.floor(numSimulations * 0.5)]);
    percentiles.p75.push(values[Math.floor(numSimulations * 0.75)]);
    percentiles.p90.push(values[Math.floor(numSimulations * 0.9)]);
    years.push(startAge + y + 1);
  }

  const retirementIdx = yearsToRetirement - 1;
  const retirementValues = allPaths
    .map((p) => p[retirementIdx])
    .sort((a, b) => a - b);

  return {
    percentiles,
    successRate: Math.round((successes / numSimulations) * 100),
    medianAtRetirement:
      retirementValues[Math.floor(numSimulations * 0.5)],
    worstCase: retirementValues[Math.floor(numSimulations * 0.05)],
    bestCase: retirementValues[Math.floor(numSimulations * 0.95)],
    years,
  };
}

// Withdrawal strategy comparison
export type WithdrawalStrategy = {
  name: string;
  description: string;
  yearByYear: {
    age: number;
    taxDeferred: number;
    taxFree: number;
    taxable: number;
    totalWithdrawal: number;
    taxEstimate: number;
    afterTaxIncome: number;
  }[];
  totalTaxesPaid: number;
  portfolioAtEnd: number;
};

export function calculateWithdrawalStrategies(params: {
  taxDeferredBalance: number;
  taxFreeBalance: number;
  taxableBalance: number;
  annualExpenses: number;
  annualSSIncome: number;
  yearsInRetirement: number;
  returnRate: number;
  startAge: number;
}): WithdrawalStrategy[] {
  const {
    taxDeferredBalance,
    taxFreeBalance,
    taxableBalance,
    annualExpenses,
    annualSSIncome,
    yearsInRetirement,
    returnRate,
    startAge,
  } = params;

  const annualNeed = Math.max(0, annualExpenses - annualSSIncome);

  function simulate(
    order: ("taxable" | "taxDeferred" | "taxFree")[],
    name: string,
    description: string
  ): WithdrawalStrategy {
    let td = taxDeferredBalance;
    let tf = taxFreeBalance;
    let tx = taxableBalance;
    let totalTaxes = 0;

    const years: WithdrawalStrategy["yearByYear"] = [];

    for (let y = 0; y < yearsInRetirement; y++) {
      // Grow all buckets
      td *= 1 + returnRate;
      tf *= 1 + returnRate;
      tx *= 1 + returnRate;

      let remaining = annualNeed;
      let fromTD = 0,
        fromTF = 0,
        fromTX = 0;

      // RMD check (simplified: age 73+)
      const age = startAge + y;
      let rmd = 0;
      if (age >= 73 && td > 0) {
        const divisor = Math.max(1, 90 - age + 10); // simplified RMD divisor
        rmd = td / divisor;
        fromTD = Math.min(rmd, td);
        td -= fromTD;
        remaining = Math.max(0, remaining - fromTD);
      }

      // Withdraw in specified order
      for (const bucket of order) {
        if (remaining <= 0) break;
        if (bucket === "taxable" && tx > 0) {
          const w = Math.min(remaining, tx);
          fromTX += w;
          tx -= w;
          remaining -= w;
        } else if (bucket === "taxDeferred" && td > 0) {
          const w = Math.min(remaining, td);
          fromTD += w;
          td -= w;
          remaining -= w;
        } else if (bucket === "taxFree" && tf > 0) {
          const w = Math.min(remaining, tf);
          fromTF += w;
          tf -= w;
          remaining -= w;
        }
      }

      // Tax estimate (simplified)
      const taxableIncome = fromTD + annualSSIncome * 0.85; // 85% of SS is taxable for higher earners
      const tax = estimateFederalTax(taxableIncome);
      totalTaxes += tax;

      years.push({
        age,
        taxDeferred: Math.round(fromTD),
        taxFree: Math.round(fromTF),
        taxable: Math.round(fromTX),
        totalWithdrawal: Math.round(fromTD + fromTF + fromTX),
        taxEstimate: Math.round(tax),
        afterTaxIncome: Math.round(fromTD + fromTF + fromTX - tax + annualSSIncome),
      });
    }

    return {
      name,
      description,
      yearByYear: years,
      totalTaxesPaid: Math.round(totalTaxes),
      portfolioAtEnd: Math.round(td + tf + tx),
    };
  }

  return [
    simulate(
      ["taxable", "taxDeferred", "taxFree"],
      "Conventional",
      "Draw taxable first, then tax-deferred (401k/IRA), then Roth last. Lets Roth grow tax-free longest."
    ),
    simulate(
      ["taxDeferred", "taxable", "taxFree"],
      "Tax-Deferred First",
      "Draw 401k/IRA first to reduce future RMDs, then taxable, then Roth. Can reduce lifetime RMD burden."
    ),
    simulate(
      ["taxFree", "taxable", "taxDeferred"],
      "Roth First",
      "Use Roth first for tax-free income, then taxable, then tax-deferred. Keeps taxable income low early."
    ),
    simulate(
      ["taxable", "taxFree", "taxDeferred"],
      "Pro-Rata",
      "Draw proportionally from taxable and Roth, then tax-deferred. Balances tax impact across years."
    ),
  ];
}

// Simplified 2024 married filing jointly brackets
function estimateFederalTax(taxableIncome: number): number {
  const brackets = [
    { limit: 23200, rate: 0.1 },
    { limit: 94300, rate: 0.12 },
    { limit: 201050, rate: 0.22 },
    { limit: 383900, rate: 0.24 },
    { limit: 487450, rate: 0.32 },
    { limit: 731200, rate: 0.35 },
    { limit: Infinity, rate: 0.37 },
  ];

  // Standard deduction for MFJ
  const deduction = 29200;
  const taxable = Math.max(0, taxableIncome - deduction);

  let tax = 0;
  let prev = 0;
  for (const bracket of brackets) {
    if (taxable <= prev) break;
    const taxableInBracket = Math.min(taxable, bracket.limit) - prev;
    tax += taxableInBracket * bracket.rate;
    prev = bracket.limit;
  }

  return tax;
}
