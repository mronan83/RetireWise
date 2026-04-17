/**
 * Salary growth projection utility.
 *
 * Supports three growth methods:
 * 1. pct_per_year: salary increases by X% each year (e.g., 3% annual raise)
 * 2. target_by_year: salary reaches a target amount in N years (linear interpolation)
 * 3. pct_for_years: salary increases by X% per year for N years, then stays flat
 */

export type SalaryGrowthConfig = {
  method: "pct_per_year" | "target_by_year" | "pct_for_years";
  value: number; // percentage for pct methods, or target amount for target_by_year
  years: number; // number of years the growth applies
  targetAmount?: number; // for target_by_year method
};

/**
 * Get the projected salary for a specific year from now.
 */
export function getSalaryAtYear(
  currentSalary: number,
  growth: SalaryGrowthConfig | null,
  yearsFromNow: number
): number {
  if (!growth || yearsFromNow <= 0) return currentSalary;

  switch (growth.method) {
    case "pct_per_year": {
      // Compound growth: salary * (1 + pct/100)^years
      // Growth continues indefinitely at this rate
      return currentSalary * Math.pow(1 + growth.value / 100, yearsFromNow);
    }

    case "pct_for_years": {
      // Compound growth for N years, then flat
      const growthYears = Math.min(yearsFromNow, growth.years);
      return currentSalary * Math.pow(1 + growth.value / 100, growthYears);
    }

    case "target_by_year": {
      // Linear interpolation to target, then flat at target
      const target = growth.targetAmount || growth.value;
      if (yearsFromNow >= growth.years) return target;
      const annualIncrease = (target - currentSalary) / growth.years;
      return currentSalary + annualIncrease * yearsFromNow;
    }

    default:
      return currentSalary;
  }
}

/**
 * Get a full year-by-year salary projection.
 */
export function projectSalary(
  currentSalary: number,
  growth: SalaryGrowthConfig | null,
  years: number
): { year: number; salary: number }[] {
  const result: { year: number; salary: number }[] = [];
  for (let y = 0; y <= years; y++) {
    result.push({
      year: y,
      salary: Math.round(getSalaryAtYear(currentSalary, growth, y)),
    });
  }
  return result;
}

/**
 * Calculate total contributions over time accounting for salary growth.
 * Used by projections to get more accurate contribution forecasts.
 */
export function calculateContributionsWithSalaryGrowth(params: {
  currentSalary: number;
  salaryGrowth: SalaryGrowthConfig | null;
  contributionPct: number; // e.g., 6 for 6%
  employerMatchRate: number; // e.g., 1.0 for dollar-for-dollar
  employerMatchMaxPct: number; // e.g., 5 for up to 5%
  escalationPctPerYear: number; // e.g., 1 for +1% per year
  maxAnnualContribution: number; // IRS limit
  years: number;
}): { year: number; salary: number; contributionPct: number; yourContribution: number; employerMatch: number; total: number }[] {
  const {
    currentSalary, salaryGrowth, contributionPct,
    employerMatchRate, employerMatchMaxPct, escalationPctPerYear,
    maxAnnualContribution, years,
  } = params;

  const result: { year: number; salary: number; contributionPct: number; yourContribution: number; employerMatch: number; total: number }[] = [];

  for (let y = 0; y < years; y++) {
    const salary = getSalaryAtYear(currentSalary, salaryGrowth, y);
    const pct = contributionPct + escalationPctPerYear * y;
    let yourContrib = (pct / 100) * salary;

    // Apply IRS cap
    if (maxAnnualContribution > 0) {
      yourContrib = Math.min(yourContrib, maxAnnualContribution);
    }

    // Employer match
    const matchablePct = Math.min(pct, employerMatchMaxPct);
    const employerMatch = (matchablePct / 100) * salary * employerMatchRate;

    result.push({
      year: y,
      salary: Math.round(salary),
      contributionPct: Math.round(pct * 100) / 100,
      yourContribution: Math.round(yourContrib),
      employerMatch: Math.round(employerMatch),
      total: Math.round(yourContrib + employerMatch),
    });
  }

  return result;
}
