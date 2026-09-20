import { totalAnnual, fundedFractionOfYear } from "@/lib/utils/contributions";
import type { accounts, contributions } from "@/lib/db/schema";
import type { SalaryGrowthConfig } from "@/lib/utils/salary-growth";

/**
 * Turn a household's accounts and contribution records into the shape the
 * projection engine takes.
 *
 * This lived inline in the projections page while the analytics page rolled
 * its own three-line version — a flat annuity with no salary growth, no
 * contribution pauses, no IRS caps. The two then gave different answers for
 * the same household, on adjacent screens, with nothing saying so.
 *
 * One builder means there is one description of what this household
 * contributes, and a correction made once lands everywhere.
 */

/**
 * The rows as the database returns them.
 *
 * Inferred from the schema rather than hand-listed: totalAnnual and
 * fundedFractionOfYear read fields a narrower type would omit, and a
 * hand-written subset silently drifts from the table it describes.
 */
type AccountRow = typeof accounts.$inferSelect;
type ContributionRow = typeof contributions.$inferSelect;
type HoldingRow = { accountId: string; currentValue: string | number };

/** How many projected years each account carries a funding factor for. */
export const PROJECTION_YEARS = 60;

export function buildProjectionAccounts(input: {
  accounts: AccountRow[];
  holdings: HoldingRow[];
  contribs: ContributionRow[];
  selfSalary: number;
  spouseSalary: number;
  selfSalaryGrowth: SalaryGrowthConfig | null;
  spouseSalaryGrowth: SalaryGrowthConfig | null;
  selfCurrentAge: number | null | undefined;
  spouseCurrentAge: number | null | undefined;
  selfYearsToRetirement: number;
  spouseYearsToRetirement: number;
}) {
  const {
    accounts, holdings, contribs, selfSalary, spouseSalary,
    selfSalaryGrowth, spouseSalaryGrowth, selfCurrentAge, spouseCurrentAge,
    selfYearsToRetirement, spouseYearsToRetirement,
  } = input;

  const salaryFor = (c: { owner: string }) =>
    c.owner === "self" ? selfSalary : spouseSalary;

  return accounts
    .map((a) => {
      const acctHoldings = holdings.filter((h) => h.accountId === a.id);
      const value = acctHoldings.reduce((s, h) => s + Number(h.currentValue), 0);

      // Match contributions: prefer the direct accountId link, fall back to
      // owner + type. Retired entries are excluded by totalAnnual, so a
      // contribution left over from a previous job stops inflating this
      // account.
      const matchingContribs = contribs.filter((c) =>
        c.accountId ? c.accountId === a.id : c.owner === a.owner && c.accountType === a.accountType
      );
      const acctAnnualContribution = a.isActivelyContributing
        ? totalAnnual(matchingContribs, salaryFor).total
        : 0;

      const escalationContrib = matchingContribs.find((c) => c.hasAnnualEscalation);
      const annualEscalation = escalationContrib
        ? Number(escalationContrib.annualEscalationAmount || 0)
        : 0;
      const maxAnnual = escalationContrib?.maxAnnualContribution
        ? Number(escalationContrib.maxAnnualContribution)
        : 0;
      const contribMethod = matchingContribs[0]?.contributionMethod || "fixed_amount";
      const salary = a.owner === "self" ? selfSalary : spouseSalary;

      const mainContrib = matchingContribs.filter((c) => c.isActive)[0];
      const contribPct =
        mainContrib?.contributionMethod === "percent_of_salary"
          ? Number(mainContrib.contributionPercent || 0)
          : 0;
      const matchRate = mainContrib?.hasEmployerMatch ? Number(mainContrib.employerMatchRate || 0) : 0;
      const matchMaxPct = mainContrib?.hasEmployerMatch
        ? Number(mainContrib.employerMatchMaxPercent || 0)
        : 0;
      // Employer money paid regardless of what you defer. Carried separately
      // so it survives a year where the deferral is zero.
      const nonElectivePct = mainContrib?.hasEmployerNonElective
        ? Number(mainContrib.employerNonElectivePercent || 0)
        : 0;
      const nonElectiveAmount = mainContrib?.hasEmployerNonElective
        ? Number(mainContrib.employerNonElectiveAmount || 0)
        : 0;

      return {
        name: a.name,
        owner: a.owner,
        type: a.accountType,
        taxTreatment: a.taxTreatment,
        value,
        isActivelyContributing: Boolean(a.isActivelyContributing),
        annualContribution: Math.round(acctAnnualContribution),
        annualEscalation,
        maxAnnualContribution: maxAnnual,
        contributionMethod: contribMethod,
        contributionPct: contribPct,
        employerMatchRate: matchRate,
        employerMatchMaxPct: matchMaxPct,
        employerNonElectivePct: nonElectivePct,
        employerNonElectiveAmount: nonElectiveAmount,
        // One factor per projected year. Where several contributions feed one
        // account, the least-funded of them sets the year — a pause on the
        // main deferral is the thing that actually stops the money.
        contributionFactors: Array.from({ length: PROJECTION_YEARS }, (_, y) =>
          matchingContribs
            .filter((c) => c.isActive)
            .reduce((lowest, c) => Math.min(lowest, fundedFractionOfYear(c, y)), 1)
        ),
        salary,
        salaryGrowth: a.owner === "self" ? selfSalaryGrowth : spouseSalaryGrowth,
        ownerRetirementYear:
          a.owner === "spouse" ? spouseYearsToRetirement : selfYearsToRetirement,
        ownerCurrentAge:
          (a.owner === "spouse" ? (spouseCurrentAge ?? selfCurrentAge) : selfCurrentAge) ?? undefined,
      };
    })
    .filter((a) => a.value > 0 || a.annualContribution > 0);
}
