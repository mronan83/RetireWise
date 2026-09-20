/**
 * The tax reference table, and the ways it can be wrong quietly.
 *
 * Federal brackets, IRMAA tiers, and Medicare base costs used to be `const`
 * arrays in financial-analytics.ts. They were wrong once already —
 * commented "2025" while carrying 2024 figures — and nothing in the app
 * could have told you, because nothing in the app knew which year it was
 * computing. Moving them into a table is only an improvement if the table
 * cannot half-load: three of seven brackets produces a tax figure that
 * looks entirely reasonable and is wrong by tens of thousands of dollars.
 *
 * So every assertion here names a wrong behaviour rather than a right one.
 */
import {
  buildTaxTable,
  taxTableFreshness,
  DEFAULT_TAX_TABLE,
  BUILT_IN_TAX_YEAR,
  type TaxReferenceRow,
} from "../src/lib/tax/table";
import { selectTaxTable } from "../src/lib/tax/load";
import { seedRows, SEED_TAX_YEARS, allSeedRows } from "../src/lib/tax/seed";
import {
  estimateTaxMFJ,
  getMarginalRate,
  getRemainingInBracket,
  projectHealthcareCosts,
  projectRMDs,
} from "../src/lib/utils/financial-analytics";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const rows2025 = seedRows(SEED_TAX_YEARS[0]).map(
  ({ taxYear, kind, ordinal, threshold, value }): TaxReferenceRow => ({
    taxYear, kind, ordinal, threshold, value,
  })
);

function without(rows: TaxReferenceRow[], kind: string, ordinal?: number) {
  return rows.filter((r) => !(r.kind === kind && (ordinal === undefined || r.ordinal === ordinal)));
}
function patch(rows: TaxReferenceRow[], kind: string, ordinal: number, patchWith: Partial<TaxReferenceRow>) {
  return rows.map((r) => (r.kind === kind && r.ordinal === ordinal ? { ...r, ...patchWith } : r));
}

function main() {
  // ---- the round trip -----------------------------------------------------
  // The whole change is only safe if the database path and the fallback path
  // produce the SAME numbers. Otherwise switching over silently moves every
  // household's tax bill.
  const built = buildTaxTable(2025, rows2025);
  check("a complete 2025 year loads", built.ok, built.ok ? "" : built.reason);
  if (built.ok) {
    const t = built.table;
    check(
      "the seeded brackets are identical to the built-in fallback",
      JSON.stringify(t.brackets) === JSON.stringify(DEFAULT_TAX_TABLE.brackets),
      JSON.stringify(t.brackets.slice(0, 2))
    );
    check(
      "the seeded IRMAA tiers are identical to the built-in fallback",
      JSON.stringify(t.irmaaTiers) === JSON.stringify(DEFAULT_TAX_TABLE.irmaaTiers)
    );
    check(
      "the seeded scalars are identical to the built-in fallback",
      t.standardDeduction === DEFAULT_TAX_TABLE.standardDeduction &&
        t.medicarePartBMonthly === DEFAULT_TAX_TABLE.medicarePartBMonthly &&
        t.medicarePartDMonthly === DEFAULT_TAX_TABLE.medicarePartDMonthly &&
        t.medigapMonthly === DEFAULT_TAX_TABLE.medigapMonthly &&
        t.preMedicarePremiumMonthly === DEFAULT_TAX_TABLE.preMedicarePremiumMonthly &&
        t.outOfPocketAnnual === DEFAULT_TAX_TABLE.outOfPocketAnnual
    );
    check(
      "a table loaded from rows says so, rather than claiming to be built-in",
      t.source === "database"
    );
    check(
      "the top bracket comes back unbounded, not clamped to its stored NULL",
      t.brackets[t.brackets.length - 1].limit === Infinity
    );
    check(
      "the top IRMAA tier comes back unbounded",
      t.irmaaTiers[t.irmaaTiers.length - 1].upTo === Infinity
    );
    check(
      "IRMAA Part B and Part D are summed, not one substituted for the pair",
      t.irmaaTiers[1].monthlyPerPerson === t.irmaaTiers[1].partBMonthly + t.irmaaTiers[1].partDMonthly &&
        t.irmaaTiers[1].partBMonthly > 0 &&
        t.irmaaTiers[1].partDMonthly > 0
    );
  }

  // ---- half a year must not load -----------------------------------------
  // Each of these would otherwise return a believable number.
  const rejects: [string, TaxReferenceRow[]][] = [
    ["four of the seven brackets are missing", without(rows2025, "bracket_mfj", 3)
      .filter((r) => !(r.kind === "bracket_mfj" && r.ordinal > 2))],
    ["the top bracket is bounded, so the highest earners fall off the end",
      patch(rows2025, "bracket_mfj", 6, { threshold: 900_000 })],
    ["a bracket limit goes backwards", patch(rows2025, "bracket_mfj", 3, { threshold: 50_000 })],
    ["a bracket rate goes backwards", patch(rows2025, "bracket_mfj", 3, { value: 0.11 })],
    ["a bracket rate is stored as a percentage rather than a fraction",
      patch(rows2025, "bracket_mfj", 2, { value: 22 })],
    ["the standard deduction is missing", without(rows2025, "standard_deduction_mfj")],
    ["the standard deduction is zero", patch(rows2025, "standard_deduction_mfj", 0, { value: 0 })],
    ["the Part B premium is missing", without(rows2025, "medicare_part_b_monthly")],
    ["the out-of-pocket assumption is missing", without(rows2025, "out_of_pocket_annual")],
    ["IRMAA Part D has fewer tiers than Part B", without(rows2025, "irmaa_part_d_mfj", 3)],
    ["IRMAA Part B and Part D disagree about a threshold",
      patch(rows2025, "irmaa_part_d_mfj", 2, { threshold: 999_999 })],
    ["the IRMAA tiers are not ascending", patch(rows2025, "irmaa_part_b_mfj", 1, { threshold: 10_000 })],
    ["there is no IRMAA schedule at all",
      without(without(rows2025, "irmaa_part_b_mfj"), "irmaa_part_d_mfj")],
  ];
  for (const [label, rows] of rejects) {
    const result = buildTaxTable(2025, rows);
    check(`rejected: ${label}`, !result.ok, result.ok ? "loaded anyway" : "");
  }

  // A duplicated scalar is its own trap: the row that wins would be whichever
  // the database happened to return first.
  check(
    "rejected: the standard deduction appears twice",
    !buildTaxTable(2025, [
      ...rows2025,
      { taxYear: 2025, kind: "standard_deduction_mfj", ordinal: 1, threshold: null, value: 29200 },
    ]).ok
  );

  // ---- picking a year -----------------------------------------------------
  const jan2026 = new Date("2026-01-15T00:00:00Z");
  const rows2026 = rows2025.map((r) => ({ ...r, taxYear: 2026 }));

  check(
    "the newest complete year wins",
    selectTaxTable([...rows2025, ...rows2026], jan2026).taxYear === 2026
  );
  check(
    "a year that has not started yet is not used, however tempting",
    selectTaxTable(
      [...rows2025, ...rows2025.map((r) => ({ ...r, taxYear: 2027 }))],
      jan2026
    ).taxYear === 2025
  );
  check(
    "a corrupt newest year falls back to the last good one rather than to nothing",
    selectTaxTable([...rows2025, ...without(rows2026, "standard_deduction_mfj")], jan2026).taxYear === 2025
  );
  const empty = selectTaxTable([], jan2026);
  check(
    "an empty table falls back to the built-ins and admits it",
    empty.taxYear === BUILT_IN_TAX_YEAR && empty.source === "built-in",
    `${empty.taxYear}/${empty.source}`
  );
  check(
    "so does a table with rows that cannot be assembled",
    selectTaxTable(without(rows2025, "bracket_mfj"), jan2026).source === "built-in"
  );

  // ---- the staleness the reader is shown ----------------------------------
  const f2025in2025 = taxTableFreshness({ taxYear: 2025, source: "database" }, new Date("2025-06-01"));
  check("figures for the current year read as current", f2025in2025.status === "current");
  check("and the caption names the year", f2025in2025.label === "2025 tax year");

  const f2025in2026 = taxTableFreshness({ taxYear: 2025, source: "database" }, jan2026);
  check("a year behind is flagged, not passed over", f2025in2026.status === "stale");
  check("and the reader is told what to do about it", /Refresh/.test(f2025in2026.detail));

  const f2023in2026 = taxTableFreshness({ taxYear: 2023, source: "database" }, jan2026);
  check("three years behind is escalated", f2023in2026.status === "very-stale");
  check("and says how far behind", f2023in2026.yearsBehind === 3);

  const fBuiltIn = taxTableFreshness({ taxYear: 2025, source: "built-in" }, new Date("2025-06-01"));
  check(
    "a current-year fallback still says the reference table is not being used",
    /built-in fallback/.test(fBuiltIn.detail)
  );

  // ---- the table is actually used -----------------------------------------
  // A parameter that is accepted and ignored is the failure that would leave
  // every number identical while the badge changes. Each of these uses a
  // deliberately absurd table so an ignored argument cannot pass.
  const flat = {
    ...DEFAULT_TAX_TABLE,
    taxYear: 2099,
    source: "database" as const,
    standardDeduction: 0,
    brackets: [{ limit: Infinity, rate: 0.5 }],
  };
  check(
    "estimateTaxMFJ computes with the table it is given",
    Math.round(estimateTaxMFJ(200_000, flat)) === 100_000,
    String(Math.round(estimateTaxMFJ(200_000, flat)))
  );
  check(
    "and without one it still matches the built-in fallback",
    estimateTaxMFJ(200_000) === estimateTaxMFJ(200_000, DEFAULT_TAX_TABLE)
  );
  check(
    "getMarginalRate reads the top rate off the table, not a hard-coded 0.37",
    getMarginalRate(50_000_000, flat) === 0.5,
    String(getMarginalRate(50_000_000, flat))
  );
  check(
    "so does getRemainingInBracket's next-rate",
    getRemainingInBracket(50_000_000, flat).nextRate === 0.5
  );

  const expensiveMedicare = {
    ...DEFAULT_TAX_TABLE,
    source: "database" as const,
    medicarePartBMonthly: 1_000,
    medicarePartDMonthly: 1_000,
  };
  const baseline = projectHealthcareCosts({
    currentAge: 64, retirementAge: 65, yearsToProject: 2,
    annualRetirementIncome: 100_000, inflationPct: 3,
  });
  const dearer = projectHealthcareCosts({
    currentAge: 64, retirementAge: 65, yearsToProject: 2,
    annualRetirementIncome: 100_000, inflationPct: 3,
    taxTable: expensiveMedicare,
  });
  check(
    "projectHealthcareCosts uses the table's Medicare premiums",
    dearer[0].medicarePremium > baseline[0].medicarePremium * 3,
    `${dearer[0].medicarePremium} vs ${baseline[0].medicarePremium}`
  );

  const rmdFlat = projectRMDs({
    taxDeferredBalance: 2_000_000, currentAge: 73, returnPct: 0,
    yearsToProject: 1, startYear: 2040, taxTable: flat,
  });
  const rmdDefault = projectRMDs({
    taxDeferredBalance: 2_000_000, currentAge: 73, returnPct: 0,
    yearsToProject: 1, startYear: 2040,
  });
  check(
    "projectRMDs taxes the distribution with the table it is given",
    rmdFlat[0].taxEstimate !== rmdDefault[0].taxEstimate &&
      Math.round(rmdFlat[0].taxEstimate) === Math.round(rmdFlat[0].rmdAmount * 0.5),
    `${rmdFlat[0].taxEstimate} vs ${rmdDefault[0].taxEstimate}`
  );

  // ---- what the seeder will write ----------------------------------------
  const all = allSeedRows();
  const keys = all.map((r) => `${r.taxYear}|${r.kind}|${r.ordinal}`);
  check(
    "no seed row collides with another on the upsert key",
    new Set(keys).size === keys.length,
    `${keys.length - new Set(keys).size} duplicates`
  );
  check(
    "every seeded year loads back through the validator",
    SEED_TAX_YEARS.every((y) => buildTaxTable(y.taxYear, all).ok),
    SEED_TAX_YEARS.map((y) => {
      const r = buildTaxTable(y.taxYear, all);
      return r.ok ? `${y.taxYear} ok` : `${y.taxYear}: ${r.reason}`;
    }).join("; ")
  );
  check(
    "every seeded row carries a note saying where the figure came from",
    all.every((r) => typeof r.notes === "string" && r.notes.length > 0)
  );
  check(
    "only the unbounded top tiers have a null threshold",
    all
      .filter((r) => r.threshold === null && r.kind.startsWith("bracket"))
      .every((r) => r.ordinal === SEED_TAX_YEARS[0].brackets.length - 1)
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
