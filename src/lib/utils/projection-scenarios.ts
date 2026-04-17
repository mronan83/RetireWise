/**
 * Market scenario presets and detailed projection tables.
 */

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
};

export function runDetailedProjection(params: {
  accounts: {
    name: string; owner: string; type: string; taxTreatment: string;
    value: number; isActivelyContributing: boolean; annualContribution: number;
    annualEscalation: number; // amount to add per year (% points for pct method, $ for fixed)
    maxAnnualContribution: number; // cap (0 = no cap)
    contributionMethod: string; // "percent_of_salary" | "fixed_amount"
    salary: number; // needed to recalculate pct-based contributions with escalation
  }[];
  totalAnnualContributions: number; // kept for backward compat / summary
  yearsToRetirement: number;
  yearsInRetirement: number;
  startAge: number;
  returnPct: number;
  inflationPct: number;
  annualExpenses: number;
  annualSSIncome: number;
  ssStartYear: number; // year when SS starts (0-indexed from now)
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
    annualSSIncome,
    ssStartYear,
  } = params;

  const totalYears = yearsToRetirement + yearsInRetirement;
  const rate = returnPct / 100;

  // Initialize account projections
  const accountProjs: AccountProjection[] = accounts.map((a) => ({
    name: a.name,
    owner: a.owner,
    accountType: a.type,
    taxTreatment: a.taxTreatment,
    currentValue: a.value,
    projectedValues: [],
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

  for (let y = 0; y < totalYears; y++) {
    const isRetirement = y >= yearsToRetirement;
    const hasSS = y >= ssStartYear;
    const yearSS = hasSS ? annualSSIncome : 0;

    years.push(y);
    ages.push(startAge + y + 1);
    phases.push(isRetirement ? "retirement" : "accumulation");
    ssIncomeArr.push(yearSS);

    // Grow each account
    for (const ap of accountProjs) {
      const prev =
        ap.projectedValues.length > 0
          ? ap.projectedValues[ap.projectedValues.length - 1]
          : ap.currentValue;
      const growth = prev * rate;
      let newVal = prev + growth;

      if (!isRetirement) {
        // Add this account's annual contribution with escalation
        const idx = accountProjs.indexOf(ap);
        const acct = accounts[idx];
        if (acct.annualContribution > 0 || acct.annualEscalation > 0) {
          // Calculate escalated contribution for year y
          let yearContrib = acct.annualContribution;
          if (acct.annualEscalation > 0 && y > 0) {
            if (acct.contributionMethod === "percent_of_salary" && acct.salary > 0) {
              // Base % + escalation per year, recalculate from salary
              const basePct = acct.annualContribution > 0 && acct.salary > 0
                ? (acct.annualContribution / acct.salary) * 100
                : 0;
              const escalatedPct = basePct + acct.annualEscalation * y;
              yearContrib = (escalatedPct / 100) * acct.salary;
            } else {
              // Fixed amount + $ increase per year
              yearContrib = acct.annualContribution + acct.annualEscalation * y;
            }
          }
          // Apply cap
          if (acct.maxAnnualContribution > 0) {
            yearContrib = Math.min(yearContrib, acct.maxAnnualContribution);
          }
          newVal += Math.max(0, yearContrib);
        }
      }

      ap.projectedValues.push(Math.max(0, Math.round(newVal)));
    }

    // Withdrawals in retirement
    let yearWithdrawal = 0;
    if (isRetirement) {
      const needed = Math.max(0, annualExpenses - yearSS);
      let remaining = needed;

      // Withdraw proportionally from all accounts
      const totalCurrent = accountProjs.reduce(
        (s, ap) => s + ap.projectedValues[ap.projectedValues.length - 1],
        0
      );

      if (totalCurrent > 0 && remaining > 0) {
        for (const ap of accountProjs) {
          const currentVal = ap.projectedValues[ap.projectedValues.length - 1];
          const share = currentVal / totalCurrent;
          const withdrawal = Math.min(currentVal, remaining * share);
          ap.projectedValues[ap.projectedValues.length - 1] -= Math.round(withdrawal);
          yearWithdrawal += withdrawal;
          remaining -= withdrawal;
        }
      }
    }

    withdrawalsArr.push(Math.round(yearWithdrawal));
    const yearContribs = isRetirement ? 0 : accounts.reduce((s, a) => s + a.annualContribution, 0);
    contributionsArr.push(Math.round(yearContribs));

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
  };
}
