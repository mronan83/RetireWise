import type { TaxReferenceRow } from "./table";

/**
 * The published figures, by tax year.
 *
 * This is the one place a human edits each January, and the refresh
 * endpoint is what moves it into the database. Adding a year here and
 * POSTing /api/irs-limits/refresh is the whole update procedure.
 *
 * Sources: IRS Rev. Proc. for the year's inflation adjustments (brackets,
 * standard deduction) and the CMS annual premium notice (Part B, Part D,
 * IRMAA thresholds). The non-statutory figures — Medigap, marketplace
 * premium, out-of-pocket — are planning assumptions, not published rates,
 * and are labelled as such in `notes`.
 */

type SeedYear = {
  taxYear: number;
  /** [top of bracket or null for unbounded, rate] */
  brackets: [number | null, number][];
  standardDeduction: number;
  /** [top of tier or null for unbounded, partB surcharge, partD surcharge] */
  irmaa: [number | null, number, number][];
  medicarePartBMonthly: number;
  medicarePartDMonthly: number;
  medigapMonthly: number;
  preMedicarePremiumMonthly: number;
  outOfPocketAnnual: number;
  bracketNote: string;
  irmaaNote: string;
};

/**
 * Only 2025 is seeded, deliberately.
 *
 * I can state the 2026 MFJ brackets and standard deduction with reasonable
 * confidence, but not the 2026 IRMAA thresholds and Part B/D surcharges —
 * and a year is all-or-nothing here: buildTaxTable() rejects a partial
 * year rather than mixing 2026 brackets with 2025 surcharges. Filling the
 * gap with plausible-looking numbers would produce exactly the failure
 * this table exists to prevent: an answer that is wrong and looks fine.
 *
 * So the app computes 2025 figures and SAYS it is computing 2025 figures.
 * That is a visible, correctable staleness rather than an invisible error.
 *
 * TO ADD A YEAR: append an entry below from the two primary sources, then
 * POST /api/irs-limits/refresh. Nothing else changes.
 *   - Brackets, standard deduction: the IRS Revenue Procedure for that
 *     year's inflation adjustments (search "Rev. Proc. inflation
 *     adjustments <year>" on irs.gov).
 *   - Part B premium, Part D base, IRMAA thresholds and surcharges: the
 *     CMS annual Medicare premium notice (cms.gov newsroom, each autumn).
 *     Note the MAGI lookback: the <year> tiers are applied to the return
 *     filed two years earlier.
 *   - Medigap, marketplace premium, and out-of-pocket are planning
 *     assumptions, not published rates. Carry them forward at your own
 *     inflation estimate and keep the note saying what they are.
 */
export const SEED_TAX_YEARS: SeedYear[] = [
  {
    taxYear: 2025,
    brackets: [
      [23850, 0.1],
      [96950, 0.12],
      [206700, 0.22],
      [394600, 0.24],
      [501050, 0.32],
      [751600, 0.35],
      [null, 0.37],
    ],
    standardDeduction: 30000,
    irmaa: [
      [212000, 0, 0],
      [266000, 74.0, 13.7],
      [334000, 185.0, 35.3],
      [400000, 295.9, 57.0],
      [750000, 406.9, 78.6],
      [null, 443.9, 85.8],
    ],
    medicarePartBMonthly: 185,
    medicarePartDMonthly: 35,
    medigapMonthly: 250,
    preMedicarePremiumMonthly: 1200,
    outOfPocketAnnual: 5000,
    bracketNote: "MFJ, IRS Rev. Proc. 2024-40",
    irmaaNote: "MFJ, CMS 2025 premium notice; MAGI from the 2023 return",
  },
];

/**
 * Flatten a seed year into the rows the table stores.
 *
 * `threshold: null` is the unbounded top tier for a tiered kind, and is
 * meaningless for a scalar kind, where ordinal is always 0.
 */
export function seedRows(year: SeedYear): (TaxReferenceRow & { notes: string })[] {
  const rows: (TaxReferenceRow & { notes: string })[] = [];

  year.brackets.forEach(([limit, rate], i) => {
    rows.push({
      taxYear: year.taxYear,
      kind: "bracket_mfj",
      ordinal: i,
      threshold: limit,
      value: rate,
      notes: year.bracketNote,
    });
  });

  year.irmaa.forEach(([upTo, partB, partD], i) => {
    rows.push({
      taxYear: year.taxYear,
      kind: "irmaa_part_b_mfj",
      ordinal: i,
      threshold: upTo,
      value: partB,
      notes: year.irmaaNote,
    });
    rows.push({
      taxYear: year.taxYear,
      kind: "irmaa_part_d_mfj",
      ordinal: i,
      threshold: upTo,
      value: partD,
      notes: year.irmaaNote,
    });
  });

  const scalars: [string, number, string][] = [
    ["standard_deduction_mfj", year.standardDeduction, year.bracketNote],
    ["medicare_part_b_monthly", year.medicarePartBMonthly, "Standard Part B premium, per person"],
    ["medicare_part_d_monthly", year.medicarePartDMonthly, "Estimated Part D premium, per person"],
    ["medigap_monthly", year.medigapMonthly, "Planning assumption, not a published rate"],
    ["pre_medicare_premium_monthly", year.preMedicarePremiumMonthly, "Planning assumption: ACA marketplace, per couple"],
    ["out_of_pocket_annual", year.outOfPocketAnnual, "Planning assumption: out-of-pocket medical, per couple"],
  ];
  for (const [kind, value, notes] of scalars) {
    rows.push({ taxYear: year.taxYear, kind, ordinal: 0, threshold: null, value, notes });
  }

  return rows;
}

export function allSeedRows(): (TaxReferenceRow & { notes: string })[] {
  return SEED_TAX_YEARS.flatMap(seedRows);
}
