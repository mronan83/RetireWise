/**
 * The three things a retirement figure cannot be worked out without.
 *
 * When one is missing the app asks for it, in place of the figure that needs
 * it, with a link straight to the field in Settings. It used to assume them
 * silently: age 42, retirement at 65, $7,000 a month. A 55-year-old who had
 * not filled in their age was shown a plan for a 42-year-old, and nothing on
 * screen said so (Q4 in docs/REQUIREMENTS.md).
 */

export type PlanningField = "currentAge" | "retirementAge" | "monthlyExpensesRetirement";

export const PLANNING_FIELDS: Record<PlanningField, { label: string; why: string; href: string }> = {
  currentAge: {
    label: "Your current age",
    why: "It sets the years until retirement, your contribution limits and when required withdrawals begin.",
    href: "/settings#currentAge",
  },
  retirementAge: {
    label: "The age you plan to retire",
    why: "It decides when contributions stop and withdrawals start.",
    href: "/settings#retirementAge",
  },
  monthlyExpensesRetirement: {
    label: "Your monthly spending in retirement",
    why: "It is the biggest single factor in whether your savings last.",
    href: "/settings#monthlyExpensesRetirement",
  },
};

type PlanningPreferences = {
  currentAge?: number | null;
  retirementAge?: number | null;
  monthlyExpensesRetirement?: string | number | null;
  projectionMonthlySpending?: string | number | null;
} | null | undefined;

/**
 * Monthly retirement spending as the household gave it: the figure saved on
 * the Projections page if there is one, else the one in Settings, else null.
 */
export function givenMonthlySpending(pref: PlanningPreferences): number | null {
  const saved = Number(pref?.projectionMonthlySpending ?? 0);
  if (saved > 0) return saved;
  const settings = Number(pref?.monthlyExpensesRetirement ?? 0);
  return settings > 0 ? settings : null;
}

/** Which of `needed` the household has not given yet, in the order asked. */
export function missingPlanningInputs(pref: PlanningPreferences, needed: PlanningField[]): PlanningField[] {
  return needed.filter((field) => {
    if (field === "currentAge") return !(Number(pref?.currentAge) > 0);
    if (field === "retirementAge") return !(Number(pref?.retirementAge) > 0);
    return givenMonthlySpending(pref) === null;
  });
}

/** One sentence for the assistant to relay, naming what is missing and where to add it. */
export function describeMissing(fields: PlanningField[]): string {
  const names = fields.map((f) => PLANNING_FIELDS[f].label.toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `This needs ${list}, which ${fields.length > 1 ? "are" : "is"} not set yet. Add ${fields.length > 1 ? "them" : "it"} in Settings → Preferences and ask again.`;
}
