import type { InferSelectModel } from "drizzle-orm";
import type { contributions } from "../db/schema";

export type ContributionRow = InferSelectModel<typeof contributions>;

/** How many times a year each frequency pays out. */
export const FREQUENCY_PER_YEAR: Record<string, number> = {
  per_paycheck_biweekly: 26,
  per_paycheck_semimonthly: 24,
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

/**
 * The shape every caller needs, split by who is paying.
 *
 * The split is not cosmetic. The IRS elective-deferral limit applies to
 * `employee` alone — employer money sits under the far higher combined limit —
 * so any code that caps a single blended number caps the wrong thing.
 */
export type ContributionBreakdown = {
  employee: number;
  employerMatch: number;
  employerNonElective: number;
  employer: number;
  total: number;
};

const ZERO: ContributionBreakdown = {
  employee: 0,
  employerMatch: 0,
  employerNonElective: 0,
  employer: 0,
  total: 0,
};

/**
 * A contribution still in force.
 *
 * Retired entries are kept rather than deleted so past years still explain
 * themselves, which means every forward-looking calculation has to exclude
 * them explicitly. Reading this rather than the raw flag keeps that decision
 * in one place.
 */
export function isContributionActive(
  c: Pick<ContributionRow, "isActive">
): boolean {
  return c.isActive;
}

/** Split a list into the entries that still apply and the retired ones. */
export function partitionByActive<T extends Pick<ContributionRow, "isActive">>(
  rows: T[]
): { active: T[]; archived: T[] } {
  return {
    active: rows.filter((c) => c.isActive),
    archived: rows.filter((c) => !c.isActive),
  };
}

type ContributionInput = Pick<
  ContributionRow,
  | "contributionMethod"
  | "contributionPercent"
  | "contributionAmount"
  | "frequency"
  | "hasEmployerMatch"
  | "employerMatchRate"
  | "employerMatchMaxPercent"
  | "hasEmployerNonElective"
  | "employerNonElectivePercent"
  | "employerNonElectiveAmount"
>;

/** What the employee defers in a year, before any IRS cap. */
export function employeeAnnual(c: ContributionInput, salary: number): number {
  if (c.contributionMethod === "percent_of_salary") {
    if (salary <= 0) return 0;
    return (Number(c.contributionPercent || 0) / 100) * salary;
  }
  const perPeriod = Number(c.contributionAmount || 0);
  return perPeriod * (FREQUENCY_PER_YEAR[c.frequency] ?? 1);
}

/**
 * Work out a year's contributions for one entry.
 *
 * `deferralPercent` overrides the stored rate for projections that escalate
 * the deferral over time; leave it out to use what is on the record.
 */
export function contributionBreakdown(
  c: ContributionInput,
  salary: number,
  deferralPercent?: number
): ContributionBreakdown {
  const usingPercent = c.contributionMethod === "percent_of_salary";

  const employee =
    deferralPercent !== undefined && usingPercent
      ? salary > 0
        ? (deferralPercent / 100) * salary
        : 0
      : employeeAnnual(c, salary);

  if (employee === 0 && !c.hasEmployerNonElective && !c.hasEmployerMatch) {
    return ZERO;
  }

  // The deferral as a percent of salary, which is what a match formula is
  // written against even when the employee elected a dollar amount.
  const deferredPct =
    deferralPercent !== undefined && usingPercent
      ? deferralPercent
      : salary > 0
        ? (employee / salary) * 100
        : 0;

  let employerMatch = 0;
  if (c.hasEmployerMatch && salary > 0) {
    const matchablePct = Math.min(
      deferredPct,
      Number(c.employerMatchMaxPercent || 0)
    );
    employerMatch =
      (matchablePct / 100) * salary * Number(c.employerMatchRate || 0);
  }

  // Non-elective money is paid whatever the employee does, so it is never
  // scaled by the deferral. An employee at 0% still receives it.
  let employerNonElective = 0;
  if (c.hasEmployerNonElective) {
    const pct = Number(c.employerNonElectivePercent || 0);
    const flat = Number(c.employerNonElectiveAmount || 0);
    employerNonElective = pct > 0 && salary > 0 ? (pct / 100) * salary : flat;
  }

  const employer = employerMatch + employerNonElective;
  return {
    employee,
    employerMatch,
    employerNonElective,
    employer,
    total: employee + employer,
  };
}

/**
 * Apply an IRS elective-deferral limit to the employee's share only.
 *
 * The 401(k) and 403(b) figures in this app (23,500 and the catch-up tiers)
 * are §402(g) elective-deferral limits. Employer match and non-elective money
 * fall under the much higher §415(c) combined limit, so clamping the blended
 * total against the deferral limit silently deletes employer contributions —
 * and does it worst for the people contributing most.
 */
export function capEmployeeDeferral(
  breakdown: ContributionBreakdown,
  limit: number
): ContributionBreakdown {
  if (limit <= 0 || breakdown.employee <= limit) return breakdown;
  const employee = limit;
  return {
    ...breakdown,
    employee,
    total: employee + breakdown.employer,
  };
}

/** Sum a list of entries, skipping retired ones. */
export function totalAnnual(
  rows: ContributionRow[],
  salaryFor: (row: ContributionRow) => number,
  asOf = new Date()
): ContributionBreakdown {
  return rows.filter(isContributionActive).reduce<ContributionBreakdown>(
    (acc, c) => {
      // A paused entry contributes nothing today. Showing its full rate would
      // report cash flow that is not happening.
      const b = isPaused(c, asOf)
        ? { ...ZERO }
        : contributionBreakdown(c, salaryFor(c));
      return {
        employee: acc.employee + b.employee,
        employerMatch: acc.employerMatch + b.employerMatch,
        employerNonElective: acc.employerNonElective + b.employerNonElective,
        employer: acc.employer + b.employer,
        total: acc.total + b.total,
      };
    },
    { ...ZERO }
  );
}

type VestingInput = Pick<
  ContributionRow,
  "vestingSchedule" | "vestingYears" | "serviceStartDate"
>;

export type Vesting = {
  /** 0 to 1. */
  fraction: number;
  yearsOfService: number | null;
  /** Years until 100%, or null once fully vested or when unknown. */
  yearsRemaining: number | null;
  label: string;
};

/**
 * How much of the employer's money is already the employee's to keep.
 *
 * This is a property of leaving, not of saving. It never reduces a projected
 * balance — someone who stays to retirement vests in full — so it is reported
 * as exposure on the account rather than folded into any forecast.
 */
export function vestingStatus(c: VestingInput, asOf = new Date()): Vesting {
  if (c.vestingSchedule === "immediate") {
    return {
      fraction: 1,
      yearsOfService: null,
      yearsRemaining: null,
      label: "Vests immediately",
    };
  }

  const years = Number(c.vestingYears || 0);
  if (!c.serviceStartDate || years <= 0) {
    return {
      fraction: 1,
      yearsOfService: null,
      yearsRemaining: null,
      label:
        years > 0
          ? `${years}-year ${c.vestingSchedule} — add a start date to track it`
          : "Vesting not set",
    };
  }

  const started = new Date(c.serviceStartDate);
  const yearsOfService =
    (asOf.getTime() - started.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);

  const fraction =
    c.vestingSchedule === "cliff"
      ? yearsOfService >= years
        ? 1
        : 0
      : Math.max(0, Math.min(1, yearsOfService / years));

  const yearsRemaining = fraction >= 1 ? null : years - yearsOfService;

  return {
    fraction,
    yearsOfService: Math.max(0, yearsOfService),
    yearsRemaining,
    label:
      fraction >= 1
        ? "Fully vested"
        : c.vestingSchedule === "cliff"
          ? `0% until ${years} years, then 100%`
          : `${Math.round(fraction * 100)}% vested of ${years}-year schedule`,
  };
}

/* ------------------------------------------------------------------------ *
 * Pauses
 * ------------------------------------------------------------------------ */

type PauseInput = Pick<ContributionRow, "pausedFrom" | "resumesOn">;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The window a contribution is not being funded, as timestamps. */
function pauseWindow(c: PauseInput): { from: number; to: number } | null {
  if (!c.pausedFrom) return null;
  const from = new Date(c.pausedFrom).getTime();
  // No resume date means paused until told otherwise. Projecting that as a
  // pause that ends on some assumed date would inflate the forecast on an
  // assumption nobody made.
  const to = c.resumesOn ? new Date(c.resumesOn).getTime() : Infinity;
  return to > from ? { from, to } : null;
}

/** Is this contribution paused right now? */
export function isPaused(c: PauseInput, asOf = new Date()): boolean {
  const w = pauseWindow(c);
  if (!w) return false;
  const t = asOf.getTime();
  return t >= w.from && t < w.to;
}

/**
 * How much of projected year `yearIndex` this contribution is actually funded.
 *
 * A pause rarely lines up with a calendar year: stopping in March and
 * resuming the following February is ten months missed across two projection
 * years, not a year off in one and a full year in the other. Returning a
 * fraction rather than a flag keeps the forecast honest at the edges, which
 * is where the difference between "paused a while" and "paused for good"
 * actually lives.
 */
export function fundedFractionOfYear(
  c: PauseInput,
  yearIndex: number,
  asOf = new Date()
): number {
  const w = pauseWindow(c);
  if (!w) return 1;

  const yearStart = new Date(asOf);
  yearStart.setFullYear(yearStart.getFullYear() + yearIndex);
  const yearEnd = new Date(asOf);
  yearEnd.setFullYear(yearEnd.getFullYear() + yearIndex + 1);

  const start = yearStart.getTime();
  const end = yearEnd.getTime();
  const overlap = Math.max(0, Math.min(end, w.to) - Math.max(start, w.from));
  const length = end - start;
  if (length <= 0) return 1;

  return Math.max(0, Math.min(1, 1 - overlap / length));
}

/** The funded fraction for each projected year, for the engine to apply. */
export function fundedFactors(
  c: PauseInput,
  years: number,
  asOf = new Date()
): number[] {
  return Array.from({ length: years }, (_, y) => fundedFractionOfYear(c, y, asOf));
}

/** How long the pause runs, in months, or null when it has no end. */
export function pauseLengthMonths(c: PauseInput): number | null {
  const w = pauseWindow(c);
  if (!w || w.to === Infinity) return null;
  return Math.round((w.to - w.from) / MS_PER_DAY / 30.44);
}
