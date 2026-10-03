/**
 * A missing input is asked for, never assumed.
 *
 * Analytics and the AI assistant used to fill a missing age with 42, a
 * missing retirement age with 65 and missing spending with $7,000 a month,
 * and price any fund whose fee they did not know at 0.15%. Each produced a
 * plausible figure about a household that had not given the number it rests
 * on (Q4 in docs/REQUIREMENTS.md). Now the setup that the Projections page,
 * Analytics and the assistant share reports what is missing, and the fee
 * analysis leaves unknown fees out and counts them.
 */
import { missingPlanningInputs, givenMonthlySpending, describeMissing } from "../src/lib/planning-inputs";
import { projectionSetupFromRows } from "../src/lib/projections/household";
import { calculateFeeImpact } from "../src/lib/utils/financial-analytics";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

type Pref = Parameters<typeof projectionSetupFromRows>[0]["pref"];
const pref = (fields: Record<string, unknown>) => ({ ...fields }) as unknown as Pref;
const rows = (p: Pref) => ({ pref: p, accounts: [], holdings: [], contribs: [], selfSS: undefined, spouseSS: undefined });

function main() {
  // ---- what counts as missing ----------------------------------------------
  const all = ["currentAge", "retirementAge", "monthlyExpensesRetirement"] as const;
  check("with nothing set, all three are missing", missingPlanningInputs(undefined, [...all]).join() === all.join());
  check(
    "with only an age, retirement age and spending are missing",
    missingPlanningInputs(pref({ currentAge: 55 }), [...all]).join() === "retirementAge,monthlyExpensesRetirement"
  );
  check("a zero is not an answer", missingPlanningInputs(pref({ currentAge: 0, retirementAge: 65, monthlyExpensesRetirement: "0" }), [...all]).join() === "currentAge,monthlyExpensesRetirement");
  check("spending saved on the Projections page counts as given", givenMonthlySpending(pref({ projectionMonthlySpending: "8500" })) === 8_500);
  check("and wins over the Settings figure, as the page's slider does", givenMonthlySpending(pref({ projectionMonthlySpending: "8500", monthlyExpensesRetirement: "7000" })) === 8_500);
  check("otherwise Settings is used", givenMonthlySpending(pref({ monthlyExpensesRetirement: "6000" })) === 6_000);
  check("and with neither, there is no figure — not $7,000", givenMonthlySpending(pref({})) === null);

  // ---- the shared projection setup refuses rather than guesses -------------
  const noSpending = projectionSetupFromRows(rows(pref({ currentAge: 55, retirementAge: 65 })));
  check(
    "the projection setup asks for spending instead of assuming $7,000",
    !noSpending.ok && noSpending.missing.join() === "monthlyExpensesRetirement",
    JSON.stringify(noSpending)
  );
  const noAge = projectionSetupFromRows(rows(pref({ retirementAge: 65, monthlyExpensesRetirement: "7000" })));
  check("and for an age instead of assuming 42", !noAge.ok && noAge.missing.join() === "currentAge");
  const complete = projectionSetupFromRows(rows(pref({ currentAge: 55, retirementAge: 65, monthlyExpensesRetirement: "6500" })));
  check(
    "with all three it runs on the household's own figures",
    complete.ok && complete.household.currentAge === 55 && complete.household.monthlyExpenses === 6_500,
    JSON.stringify(complete.ok ? complete.household.monthlyExpenses : complete)
  );

  // ---- what the assistant says -----------------------------------------------
  check(
    "the assistant names what is missing and where to add it",
    describeMissing(["currentAge"]) === "This needs your current age, which is not set yet. Add it in Settings → Preferences and ask again.",
    describeMissing(["currentAge"])
  );
  check(
    "and lists several in plain English",
    describeMissing(["currentAge", "retirementAge", "monthlyExpensesRetirement"]).startsWith(
      "This needs your current age, the age you plan to retire and your monthly spending in retirement, which are not set yet."
    ),
    describeMissing(["currentAge", "retirementAge", "monthlyExpensesRetirement"])
  );

  // ---- an unknown fund fee is left out, not assumed ----------------------------
  const fees = calculateFeeImpact(
    [
      { ticker: "VTI", currentValue: 100_000 },
      { ticker: "ZZZUNKNOWN", currentValue: 50_000 },
    ],
    7
  );
  check("the unknown fund is counted", fees.unknownFeeCount === 1 && fees.unknownFeeValue === 50_000, JSON.stringify(fees));
  check("the weighted fee is the known fund's own, not blended with a guess", fees.weightedExpenseRatio === 0.03, String(fees.weightedExpenseRatio));
  check("annual fees cover only the known fund", fees.totalAnnualFees === 30, String(fees.totalAnnualFees));
  check(
    "and the unknown fund is listed with no fee at all",
    fees.holdings.some((h) => h.ticker === "ZZZUNKNOWN" && h.expenseRatio === null && h.annualFee === null)
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
