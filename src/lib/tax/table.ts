/**
 * The tax figures every retirement number on this site depends on.
 *
 * These used to be `const` arrays sitting in financial-analytics.ts, which
 * meant the app's answers changed only when somebody remembered to edit
 * source each January. They were wrong once already: the brackets were
 * commented "2025" while carrying 2024 figures, and nothing in the product
 * could have told you, because nothing in the product knew which year it
 * was computing.
 *
 * Two things follow from that, and both are in this file:
 *
 *   1. The numbers live in the `tax_reference` table, loaded at request
 *      time, with these built-ins as the fallback. Updating them is a POST
 *      to /api/irs-limits/refresh, the same path the contribution limits
 *      already take.
 *   2. Every table carries its `taxYear` and its `source`, so the UI can
 *      say out loud how old the answer is. A stale figure that announces
 *      itself is a different class of problem from a stale figure that
 *      doesn't.
 *
 * This module is pure — no database, no `server-only` — because the
 * analytics dashboard is a client component and needs the same shapes.
 * The loader lives next door in ./load.ts.
 */

export type TaxBracket = {
  /** Top of the bracket, in taxable income after the standard deduction. */
  limit: number;
  rate: number;
};

export type IrmaaTier = {
  /** Top of the tier, in MAGI. `Infinity` for the last one. */
  upTo: number;
  partBMonthly: number;
  partDMonthly: number;
  /** Convenience: partB + partD, per person, per month. */
  monthlyPerPerson: number;
};

export type TaxTable = {
  taxYear: number;
  /** "built-in" means the database had nothing usable and this is source code. */
  source: "database" | "built-in";
  /** MFJ, ascending, last limit Infinity. */
  brackets: TaxBracket[];
  standardDeduction: number;
  /** MFJ, ascending, last upTo Infinity. */
  irmaaTiers: IrmaaTier[];
  /** Medicare Part B base premium, per person, per month. */
  medicarePartBMonthly: number;
  /** Medicare Part D base premium, per person, per month. */
  medicarePartDMonthly: number;
  /** Medigap / Advantage supplemental, per person, per month. */
  medigapMonthly: number;
  /** ACA marketplace premium before 65, per couple, per month. */
  preMedicarePremiumMonthly: number;
  /** Out-of-pocket medical, per couple, per year. */
  outOfPocketAnnual: number;
};

/**
 * The kinds a row in `tax_reference` can be.
 *
 * Tiered kinds (brackets, IRMAA) use `ordinal` for position and `threshold`
 * for the top of the tier, with NULL meaning unbounded. Scalar kinds use
 * ordinal 0 and leave `threshold` NULL, where it means nothing at all.
 */
export const TIERED_KINDS = [
  "bracket_mfj",
  "irmaa_part_b_mfj",
  "irmaa_part_d_mfj",
] as const;

export const SCALAR_KINDS = [
  "standard_deduction_mfj",
  "medicare_part_b_monthly",
  "medicare_part_d_monthly",
  "medigap_monthly",
  "pre_medicare_premium_monthly",
  "out_of_pocket_annual",
] as const;

export type TieredKind = (typeof TIERED_KINDS)[number];
export type ScalarKind = (typeof SCALAR_KINDS)[number];
export type TaxReferenceKind = TieredKind | ScalarKind;

export type TaxReferenceRow = {
  taxYear: number;
  kind: string;
  ordinal: number;
  /** null = unbounded for a tiered kind; ignored for a scalar kind. */
  threshold: number | null;
  value: number;
};

/**
 * 2025 federal figures, married filing jointly.
 *
 * Kept here as the fallback rather than deleted, because an empty or
 * half-seeded table must not silently become a household with no tax.
 */
/**
 * Built by the same addition buildTaxTable() performs, never by writing the
 * sum out by hand.
 *
 * 74.0 + 13.7 is 87.69999999999999 in binary floating point, and the literal
 * 87.7 is not. A fallback that disagrees with the database by a fifteenth
 * decimal place is harmless in dollars and fatal to the one test that proves
 * the two paths compute the same thing — which is the test that makes the
 * switch to the table safe.
 */
function irmaaTier(upTo: number, partBMonthly: number, partDMonthly: number): IrmaaTier {
  return { upTo, partBMonthly, partDMonthly, monthlyPerPerson: partBMonthly + partDMonthly };
}

export const BUILT_IN_TAX_YEAR = 2025;

export const DEFAULT_TAX_TABLE: TaxTable = {
  taxYear: BUILT_IN_TAX_YEAR,
  source: "built-in",
  brackets: [
    { limit: 23850, rate: 0.1 },
    { limit: 96950, rate: 0.12 },
    { limit: 206700, rate: 0.22 },
    { limit: 394600, rate: 0.24 },
    { limit: 501050, rate: 0.32 },
    { limit: 751600, rate: 0.35 },
    { limit: Infinity, rate: 0.37 },
  ],
  standardDeduction: 30000,
  irmaaTiers: [
    irmaaTier(212_000, 0, 0),
    irmaaTier(266_000, 74.0, 13.7),
    irmaaTier(334_000, 185.0, 35.3),
    irmaaTier(400_000, 295.9, 57.0),
    irmaaTier(750_000, 406.9, 78.6),
    irmaaTier(Infinity, 443.9, 85.8),
  ],
  medicarePartBMonthly: 185,
  medicarePartDMonthly: 35,
  medigapMonthly: 250,
  preMedicarePremiumMonthly: 1200,
  outOfPocketAnnual: 5000,
};

/**
 * Turn the rows for ONE tax year into a table, or explain why they can't be.
 *
 * Deliberately strict. A year seeded with three of the seven brackets would
 * produce a tax figure that looks entirely reasonable and is wrong by tens
 * of thousands of dollars — the exact failure mode this codebase keeps
 * producing. Anything short of a complete, well-ordered year is rejected so
 * the caller falls back to the built-ins and says so.
 */
export function buildTaxTable(
  taxYear: number,
  rows: TaxReferenceRow[]
): { ok: true; table: TaxTable } | { ok: false; reason: string } {
  const byKind = new Map<string, TaxReferenceRow[]>();
  for (const row of rows) {
    if (row.taxYear !== taxYear) continue;
    const list = byKind.get(row.kind) ?? [];
    list.push(row);
    byKind.set(row.kind, list);
  }

  const tiered = (kind: TieredKind) =>
    (byKind.get(kind) ?? []).slice().sort((a, b) => a.ordinal - b.ordinal);

  // --- Brackets ---
  const bracketRows = tiered("bracket_mfj");
  if (bracketRows.length < 2) {
    return { ok: false, reason: `bracket_mfj has ${bracketRows.length} rows, expected at least 2` };
  }
  const brackets: TaxBracket[] = [];
  let prevLimit = 0;
  for (let i = 0; i < bracketRows.length; i++) {
    const row = bracketRows[i];
    const isLast = i === bracketRows.length - 1;
    const limit = row.threshold === null ? Infinity : row.threshold;
    if (isLast && limit !== Infinity) {
      return { ok: false, reason: "top bracket must have a NULL threshold (unbounded)" };
    }
    if (!isLast && limit === Infinity) {
      return { ok: false, reason: `bracket ${i} is unbounded but is not the top bracket` };
    }
    if (limit <= prevLimit) {
      return { ok: false, reason: `bracket limits are not ascending at ordinal ${row.ordinal}` };
    }
    if (!(row.value > 0) || row.value > 1) {
      return { ok: false, reason: `bracket rate ${row.value} at ordinal ${row.ordinal} is not a fraction in (0, 1]` };
    }
    if (brackets.length > 0 && row.value <= brackets[brackets.length - 1].rate) {
      return { ok: false, reason: `bracket rates are not ascending at ordinal ${row.ordinal}` };
    }
    brackets.push({ limit, rate: row.value });
    prevLimit = limit;
  }

  // --- IRMAA: two published schedules, zipped by ordinal ---
  const partB = tiered("irmaa_part_b_mfj");
  const partD = tiered("irmaa_part_d_mfj");
  if (partB.length < 1) {
    return { ok: false, reason: "irmaa_part_b_mfj has no rows" };
  }
  if (partB.length !== partD.length) {
    return {
      ok: false,
      reason: `IRMAA Part B has ${partB.length} tiers and Part D has ${partD.length}; they must match`,
    };
  }
  const irmaaTiers: IrmaaTier[] = [];
  let prevUpTo = -1;
  for (let i = 0; i < partB.length; i++) {
    const b = partB[i];
    const d = partD[i];
    if (b.ordinal !== d.ordinal) {
      return { ok: false, reason: `IRMAA ordinals diverge at index ${i} (B=${b.ordinal}, D=${d.ordinal})` };
    }
    const bUpTo = b.threshold === null ? Infinity : b.threshold;
    const dUpTo = d.threshold === null ? Infinity : d.threshold;
    if (bUpTo !== dUpTo) {
      return { ok: false, reason: `IRMAA thresholds diverge at ordinal ${b.ordinal} (B=${bUpTo}, D=${dUpTo})` };
    }
    const isLast = i === partB.length - 1;
    if (isLast && bUpTo !== Infinity) {
      return { ok: false, reason: "top IRMAA tier must have a NULL threshold (unbounded)" };
    }
    if (!isLast && bUpTo === Infinity) {
      return { ok: false, reason: `IRMAA tier ${i} is unbounded but is not the top tier` };
    }
    if (bUpTo <= prevUpTo) {
      return { ok: false, reason: `IRMAA thresholds are not ascending at ordinal ${b.ordinal}` };
    }
    if (b.value < 0 || d.value < 0) {
      return { ok: false, reason: `negative IRMAA surcharge at ordinal ${b.ordinal}` };
    }
    irmaaTiers.push({
      upTo: bUpTo,
      partBMonthly: b.value,
      partDMonthly: d.value,
      monthlyPerPerson: b.value + d.value,
    });
    prevUpTo = bUpTo;
  }

  // --- Scalars ---
  const scalars: Partial<Record<ScalarKind, number>> = {};
  for (const kind of SCALAR_KINDS) {
    const list = byKind.get(kind) ?? [];
    if (list.length !== 1) {
      return { ok: false, reason: `${kind} has ${list.length} rows, expected exactly 1` };
    }
    if (!(list[0].value > 0)) {
      return { ok: false, reason: `${kind} is ${list[0].value}, expected a positive amount` };
    }
    scalars[kind] = list[0].value;
  }

  return {
    ok: true,
    table: {
      taxYear,
      source: "database",
      brackets,
      standardDeduction: scalars.standard_deduction_mfj!,
      irmaaTiers,
      medicarePartBMonthly: scalars.medicare_part_b_monthly!,
      medicarePartDMonthly: scalars.medicare_part_d_monthly!,
      medigapMonthly: scalars.medigap_monthly!,
      preMedicarePremiumMonthly: scalars.pre_medicare_premium_monthly!,
      outOfPocketAnnual: scalars.out_of_pocket_annual!,
    },
  };
}

export type TaxTableFreshness = {
  taxYear: number;
  source: TaxTable["source"];
  /** Calendar years between the figures and now. 0 = current. */
  yearsBehind: number;
  status: "current" | "stale" | "very-stale";
  label: string;
  detail: string;
};

/**
 * How old is this table, and should the reader be told?
 *
 * One year behind is normal for much of the year — the IRS publishes the
 * next year's figures in the autumn, and filing happens in arrears. Two or
 * more is a maintenance failure, and the UI says so in a colour the reader
 * can't miss.
 */
export function taxTableFreshness(
  table: Pick<TaxTable, "taxYear" | "source">,
  now: Date = new Date()
): TaxTableFreshness {
  const currentYear = now.getFullYear();
  const yearsBehind = Math.max(0, currentYear - table.taxYear);
  const status: TaxTableFreshness["status"] =
    yearsBehind === 0 ? "current" : yearsBehind === 1 ? "stale" : "very-stale";

  const origin =
    table.source === "built-in"
      ? "built-in fallback — the reference table has no usable data"
      : "from the tax reference table";

  const detail =
    status === "current"
      ? `Federal brackets, deduction, and Medicare figures for ${table.taxYear} (${origin}).`
      : status === "stale"
        ? `Using ${table.taxYear} figures in ${currentYear}. Refresh once the IRS publishes ${currentYear} (${origin}).`
        : `Using ${table.taxYear} figures in ${currentYear} — ${yearsBehind} years behind. Every tax number on this page is wrong by that much (${origin}).`;

  return {
    taxYear: table.taxYear,
    source: table.source,
    yearsBehind,
    status,
    label: `${table.taxYear} tax year`,
    detail,
  };
}
