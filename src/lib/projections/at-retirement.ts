import { runDetailedProjection } from "@/lib/utils/projection-scenarios";
import { totalAnnual } from "@/lib/utils/contributions";
import { RETURN_BY_RISK } from "@/lib/utils/risk";
import type { SalaryGrowthConfig } from "@/lib/utils/salary-growth";
import type { userPreferences } from "@/lib/db/schema";
import { buildProjectionAccounts } from "./build-accounts";

type BuildInput = Parameters<typeof buildProjectionAccounts>[0];

const TAX_DEFERRED_TYPES = new Set(["401k", "403b", "ira_traditional", "pension"]);
const TAX_FREE_TYPES = new Set(["ira_roth", "hsa"]);

/**
 * Balances today and at the moment work stops, by tax treatment, from the
 * tested projection engine.
 *
 * The Analytics page and the AI assistant's analytics tool both start from
 * these, so both call this. The assistant used to compute them with a flat
 * annuity, with no salary growth, contribution pauses, employer money or IRS
 * limits, which the Analytics page had already abandoned for the engine; the
 * two quoted different balances for the same household.
 *
 * Returns follow the household's risk tolerance, as Analytics always has.
 * The caller has already made sure the ages are given.
 */
export function balancesAtRetirement(input: {
  pref: typeof userPreferences.$inferSelect & { currentAge: number; retirementAge: number };
  accounts: BuildInput["accounts"];
  holdings: (BuildInput["holdings"][number] & { accountType: string })[];
  contribs: BuildInput["contribs"];
}) {
  const { pref, holdings } = input;
  const selfSalary = pref.annualSalary ? Number(pref.annualSalary) : 0;
  const spouseSalary = pref.spouseAnnualSalary ? Number(pref.spouseAnnualSalary) : 0;
  const salaryFor = (c: { owner: string }) => (c.owner === "self" ? selfSalary : spouseSalary);
  const totalAnnualContributions = totalAnnual(input.contribs, salaryFor).total;

  // Today, by account type.
  const today = { taxDeferred: 0, taxFree: 0, taxable: 0, total: 0 };
  for (const h of holdings) {
    const v = Number(h.currentValue);
    today.total += v;
    if (TAX_DEFERRED_TYPES.has(h.accountType)) today.taxDeferred += v;
    else if (TAX_FREE_TYPES.has(h.accountType)) today.taxFree += v;
    else today.taxable += v;
  }

  const yearsToRetirement = Math.max(0, pref.retirementAge - pref.currentAge);
  const spouseYearsToRetirement =
    pref.spouseCurrentAge && pref.spouseRetirementAge
      ? Math.max(0, pref.spouseRetirementAge - pref.spouseCurrentAge)
      : yearsToRetirement;
  const returnPct = RETURN_BY_RISK[pref.riskTolerance || "moderate"] ?? 7;

  if (yearsToRetirement === 0) {
    return { ...today, atRetirement: { taxDeferred: today.taxDeferred, taxFree: today.taxFree, total: today.total }, returnPct, yearsToRetirement, totalAnnualContributions, selfSalary, spouseSalary };
  }

  // One year of retirement is enough: only the balances when work stops are
  // read, and spending does not touch them.
  const engine = runDetailedProjection({
    accounts: buildProjectionAccounts({
      accounts: input.accounts,
      holdings,
      contribs: input.contribs,
      selfSalary,
      spouseSalary,
      selfSalaryGrowth: (pref.salaryGrowth as SalaryGrowthConfig | null) ?? null,
      spouseSalaryGrowth: (pref.spouseSalaryGrowth as SalaryGrowthConfig | null) ?? null,
      selfCurrentAge: pref.currentAge,
      spouseCurrentAge: pref.spouseCurrentAge,
      selfYearsToRetirement: yearsToRetirement,
      spouseYearsToRetirement,
    }),
    totalAnnualContributions,
    yearsToRetirement,
    yearsInRetirement: 1,
    startAge: pref.currentAge,
    returnPct,
    inflationPct: 3,
    annualExpenses: 0,
    socialSecurity: [],
  });

  const last = yearsToRetirement - 1;
  const balanceAt = (types: Set<string>) =>
    engine.accountProjections
      .filter((ap) => types.has(ap.accountType))
      .reduce((sum, ap) => sum + (ap.projectedValues[last] ?? ap.currentValue), 0);

  return {
    ...today,
    atRetirement: {
      taxDeferred: balanceAt(TAX_DEFERRED_TYPES),
      taxFree: balanceAt(TAX_FREE_TYPES),
      total: engine.totalValues[last] ?? today.total,
    },
    returnPct,
    yearsToRetirement,
    totalAnnualContributions,
    selfSalary,
    spouseSalary,
  };
}
