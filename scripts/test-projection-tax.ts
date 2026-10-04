/**
 * The tested projection engine pays tax, and takes required distributions
 * from the right accounts.
 *
 * Until October 2026 runDetailedProjection withdrew exactly the spending, as
 * if a 401(k) dollar were a spendable dollar. When a required minimum
 * distribution was larger than the spending, it took the RMD from every
 * account in proportion, Roth included, and the part nobody spent simply
 * vanished. On a sample household that took $1.1M off the balance at 90.
 *
 * Expected figures here are worked out independently: the brackets are
 * applied by hand from the built-in table, not through estimateTaxMFJ.
 */
import {
  runDetailedProjection,
  taxableSocialSecurity,
  projectedIncomeTax,
  REINVESTED_ACCOUNT_NAME,
} from "../src/lib/utils/projection-scenarios";
import { calculateRMD } from "../src/lib/utils/financial-analytics";
import { DEFAULT_TAX_TABLE } from "../src/lib/tax/table";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}
const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

/** Married filing jointly, today's dollars, from the table's own figures. */
function handTax(income: number): number {
  let taxable = Math.max(0, income - DEFAULT_TAX_TABLE.standardDeduction);
  let tax = 0;
  let floor = 0;
  for (const { limit, rate } of DEFAULT_TAX_TABLE.brackets) {
    const slice = Math.min(taxable, limit - floor);
    if (slice <= 0) break;
    tax += slice * rate;
    taxable -= slice;
    floor = limit;
  }
  return tax;
}

const account = (name: string, type: string, taxTreatment: string, value: number) => ({
  name, owner: "self", type, taxTreatment, value,
  isActivelyContributing: false, annualContribution: 0, annualEscalation: 0,
  maxAnnualContribution: 0, contributionMethod: "fixed_amount", contributionPct: 0,
  employerMatchRate: 0, employerMatchMaxPct: 0, salary: 0, salaryGrowth: null,
});

function main() {
  // ---- 1. a 401(k) withdrawal pays its own tax ----------------------------
  const base = {
    totalAnnualContributions: 0,
    yearsToRetirement: 0,
    yearsInRetirement: 3,
    startAge: 64,
    returnPct: 0,
    inflationPct: 0,
    annualExpenses: 80_000,
    socialSecurity: [],
    withdrawalMethod: "expense" as const,
  };
  const traditional = runDetailedProjection({ ...base, accounts: [account("401k", "401k", "tax_deferred", 2_000_000)] });
  const g = traditional.withdrawals[0];
  const t = traditional.taxes[0];
  check("a 401(k)-only household withdraws more than it spends", g > 80_000, String(g));
  check("and what is left after tax is exactly the spending", near(g - t, 80_000), `${g} - ${t}`);
  check("the tax is the bracket tax on the whole withdrawal", near(t, handTax(g)), `${t} vs ${Math.round(handTax(g))}`);
  check(
    "and the balance falls by the gross withdrawal, tax included",
    near(traditional.totalValues[0], 2_000_000 - g),
    String(traditional.totalValues[0])
  );

  // ---- 2. Roth money is not taxed -----------------------------------------
  const roth = runDetailedProjection({ ...base, accounts: [account("Roth IRA", "ira_roth", "tax_free", 2_000_000)] });
  check("a Roth-only household pays no tax", roth.taxes.every((x) => x === 0), roth.taxes.join(","));
  check("so it withdraws exactly what it spends", near(roth.withdrawals[0], 80_000), String(roth.withdrawals[0]));

  // ---- 3. brackets rise with inflation --------------------------------------
  // The same real spending twenty years apart is taxed the same in real terms.
  const later = runDetailedProjection({
    ...base, startAge: 40, inflationPct: 3, yearsToRetirement: 19, yearsInRetirement: 1,
    accounts: [account("401k", "401k", "tax_deferred", 20_000_000)],
  });
  const priceLevel = Math.pow(1.03, 20);
  check(
    "tax in year 20, in today's dollars, equals tax on the same real income today",
    near(later.taxes[19] / priceLevel, t, 2),
    `${Math.round(later.taxes[19] / priceLevel)} vs ${t}`
  );

  // ---- 4. the RMD comes only from tax-deferred accounts ---------------------
  // Spending is fully covered by Social Security, so the only withdrawal is
  // the RMD. It must leave the 401(k) and nothing else.
  const rmdBase = {
    ...base, startAge: 74, yearsInRetirement: 1, annualExpenses: 50_000,
    socialSecurity: [{ annual: 50_000, startYear: 0 }],
  };
  const rmdHousehold = runDetailedProjection({
    ...rmdBase,
    accounts: [account("401k", "401k", "tax_deferred", 1_000_000), account("Roth IRA", "ira_roth", "tax_free", 500_000)],
  });
  const rmd = calculateRMD(1_000_000, 75);
  const byName = (p: typeof rmdHousehold, name: string) =>
    p.accountProjections.find((a) => a.name === name)?.projectedValues[0];
  check("the RMD is owed and taken", near(rmdHousehold.withdrawals[0], rmd), `${rmdHousehold.withdrawals[0]} vs ${Math.round(rmd)}`);
  check("the Roth is untouched", byName(rmdHousehold, "Roth IRA") === 500_000, String(byName(rmdHousehold, "Roth IRA")));
  check("the 401(k) falls by exactly the RMD", near(byName(rmdHousehold, "401k")!, 1_000_000 - rmd), String(byName(rmdHousehold, "401k")));

  // ---- 5. the unspent RMD is reinvested, after tax -------------------------
  const rmdTax = projectedIncomeTax(rmd, 50_000, 1);
  const ssTaxable = taxableSocialSecurity(50_000, rmd);
  check(
    "its tax counts the Social Security it makes taxable",
    near(rmdTax, handTax(rmd + ssTaxable)) && ssTaxable > 0,
    `${Math.round(rmdTax)} vs ${Math.round(handTax(rmd + ssTaxable))}`
  );
  check("what remains after tax is reinvested", near(rmdHousehold.reinvested[0], rmd - rmdTax), `${rmdHousehold.reinvested[0]} vs ${Math.round(rmd - rmdTax)}`);
  check(
    "into a new taxable account, since the household had none",
    near(byName(rmdHousehold, REINVESTED_ACCOUNT_NAME) ?? -1, rmd - rmdTax),
    String(byName(rmdHousehold, REINVESTED_ACCOUNT_NAME))
  );
  check(
    "so the household loses only the tax",
    near(rmdHousehold.totalValues[0], 1_500_000 - rmdTax),
    `${rmdHousehold.totalValues[0]} vs ${Math.round(1_500_000 - rmdTax)}`
  );

  const withBrokerage = runDetailedProjection({
    ...rmdBase,
    accounts: [account("401k", "401k", "tax_deferred", 1_000_000), account("Brokerage", "brokerage", "taxable", 100_000)],
  });
  check(
    "a household with a brokerage account gets the reinvestment there",
    near(byName(withBrokerage, "Brokerage")!, 100_000 + withBrokerage.reinvested[0]) &&
      byName(withBrokerage, REINVESTED_ACCOUNT_NAME) === undefined,
    String(byName(withBrokerage, "Brokerage"))
  );
  check(
    "a household that never has an unspent RMD gets no extra account",
    traditional.accountProjections.every((a) => a.name !== REINVESTED_ACCOUNT_NAME)
  );

  // ---- 6. a Roth 401(k) owes no RMD ----------------------------------------
  const roth401k = runDetailedProjection({ ...rmdBase, accounts: [account("Roth 401k", "401k", "tax_free", 1_000_000)] });
  check("a 401(k) held as Roth owes no RMD", roth401k.rmdAmounts[0] === 0, String(roth401k.rmdAmounts[0]));

  // ---- 7. the Social Security worksheet (IRS Publication 915) ---------------
  check("below $32,000 of provisional income, none is taxable", taxableSocialSecurity(30_000, 0) === 0);
  check("between $32,000 and $44,000, half the excess", taxableSocialSecurity(40_000, 20_000) === 4_000, String(taxableSocialSecurity(40_000, 20_000)));
  check("above $44,000, capped at 85% of the benefit", taxableSocialSecurity(40_000, 60_000) === 34_000, String(taxableSocialSecurity(40_000, 60_000)));
  check(
    "and in the 85% band below the cap, 85% of the excess plus $6,000",
    near(taxableSocialSecurity(40_000, 30_000), 0.85 * (50_000 - 44_000) + 6_000, 0.01),
    String(taxableSocialSecurity(40_000, 30_000))
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
