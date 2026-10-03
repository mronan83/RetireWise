import type { socialSecurityBenefits, userPreferences } from "@/lib/db/schema";
import { totalAnnual } from "@/lib/utils/contributions";
import type { SalaryGrowthConfig } from "@/lib/utils/salary-growth";
import { buildProjectionAccounts } from "./build-accounts";
import type { ProjectionHousehold, SavedProjectionControls } from "./settings";
import { givenMonthlySpending, missingPlanningInputs, type PlanningField } from "@/lib/planning-inputs";

/**
 * A household's projection setup, from its database rows.
 *
 * The Projections page and the AI assistant's projection tool read the same
 * rows and must turn them into the same inputs, so both call this. Until the
 * household has given its age, retirement age and retirement spending, it
 * returns which of them are missing instead: no projection is run on a guess.
 */

type Preferences = typeof userPreferences.$inferSelect;
type SocialSecurity = typeof socialSecurityBenefits.$inferSelect;

export function projectionSetupFromRows(rows: {
  pref: Preferences | undefined;
  accounts: Parameters<typeof buildProjectionAccounts>[0]["accounts"];
  holdings: Parameters<typeof buildProjectionAccounts>[0]["holdings"];
  contribs: Parameters<typeof buildProjectionAccounts>[0]["contribs"];
  selfSS: SocialSecurity | undefined;
  spouseSS: SocialSecurity | undefined;
}):
  | { ok: true; household: ProjectionHousehold; saved: SavedProjectionControls }
  | { ok: false; missing: PlanningField[] } {
  const { pref } = rows;
  const missing = missingPlanningInputs(pref, ["currentAge", "retirementAge", "monthlyExpensesRetirement"]);
  if (missing.length > 0 || !pref?.currentAge || !pref?.retirementAge) return { ok: false, missing };

  // Per-owner retirement years (0-indexed from now)
  const selfYearsToRetirement = Math.max(0, pref.retirementAge - pref.currentAge);
  const spouseYearsToRetirement =
    pref.spouseRetirementAge && pref.spouseCurrentAge
      ? Math.max(0, pref.spouseRetirementAge - pref.spouseCurrentAge)
      : selfYearsToRetirement;

  const selfSalary = pref.annualSalary ? Number(pref.annualSalary) : 0;
  const spouseSalary = pref.spouseAnnualSalary ? Number(pref.spouseAnnualSalary) : 0;
  const salaryFor = (c: { owner: string }) => (c.owner === "self" ? selfSalary : spouseSalary);

  return {
    ok: true,
    household: {
      accounts: buildProjectionAccounts({
        accounts: rows.accounts,
        holdings: rows.holdings,
        contribs: rows.contribs,
        selfSalary,
        spouseSalary,
        selfSalaryGrowth: pref.salaryGrowth as SalaryGrowthConfig | null,
        spouseSalaryGrowth: pref.spouseSalaryGrowth as SalaryGrowthConfig | null,
        selfCurrentAge: pref.currentAge,
        spouseCurrentAge: pref.spouseCurrentAge,
        selfYearsToRetirement,
        spouseYearsToRetirement,
      }),
      currentAge: pref.currentAge,
      retirementAge: pref.retirementAge,
      spouseAge: pref.spouseCurrentAge,
      selfSSAtFRA: rows.selfSS?.benefitAtFRA ? Number(rows.selfSS.benefitAtFRA) : 0,
      spouseSSAtFRA: rows.spouseSS?.benefitAtFRA ? Number(rows.spouseSS.benefitAtFRA) : 0,
      selfFRA: rows.selfSS?.fullRetirementAge || 67,
      spouseFRA: rows.spouseSS?.fullRetirementAge || 67,
      monthlyExpenses: givenMonthlySpending(pref)!,
      annualContributions: totalAnnual(rows.contribs, salaryFor).total,
      riskTolerance: pref.riskTolerance ?? undefined,
    },
    saved: {
      ssClaimAgeSelf: pref.projectionSSClaimAgeSelf || null,
      ssClaimAgeSpouse: pref.projectionSSClaimAgeSpouse || null,
      monthlySpending: pref.projectionMonthlySpending ? Number(pref.projectionMonthlySpending) : null,
      withdrawalRate: pref.projectionWithdrawalRate ? Number(pref.projectionWithdrawalRate) : null,
      maxWithdrawalAmount: pref.projectionMaxWithdrawalAmount ? Number(pref.projectionMaxWithdrawalAmount) : null,
      retirementYears: pref.projectionRetirementYears || null,
      marketScenario: pref.projectionMarketScenario || null,
      withdrawalMethod: pref.projectionWithdrawalMethod || null,
      glidePathEnabled: pref.glidePathEnabled ?? null,
      glidePathStartProfile: pref.glidePathStartProfile || null,
      glidePathEndProfile: pref.glidePathEndProfile || null,
      glidePathTransitionStartAge: pref.glidePathTransitionStartAge || null,
      glidePathTransitionEndAge: pref.glidePathTransitionEndAge || null,
      glidePathCurve: pref.glidePathCurve || null,
      catchUpEnabled: pref.catchUpEnabled ?? null,
    },
  };
}
