import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { taxReference } from "@/lib/db/schema";
import {
  buildTaxTable,
  DEFAULT_TAX_TABLE,
  type TaxReferenceRow,
  type TaxTable,
} from "./table";

/**
 * Load the tax table the app should compute with.
 *
 * Picks the newest seeded year that is not in the future — using next
 * year's brackets because somebody seeded them early would be its own
 * quiet wrongness — and falls back to the year below it, and below that,
 * until one passes validation. If none does, the built-ins are returned
 * with source "built-in" so the UI can say the table isn't being used.
 *
 * A read failure returns the built-ins rather than throwing. The analytics
 * page has no useful behaviour without a tax table, and a page that renders
 * 2025 figures labelled "built-in fallback" is a better outcome than a 500.
 */
export async function loadTaxTable(now: Date = new Date()): Promise<TaxTable> {
  let rows: TaxReferenceRow[];
  try {
    /**
     * Plain getDb(), not withSystemRole.
     *
     * tax_reference grants SELECT to app_user with a read-everything
     * policy (migration 0011), so inside a request this reads on the
     * tenant's own transaction at the tenant's own privilege — no
     * escalation, and no second connection taken from a pool that has
     * run short before.
     */
    const raw = await getDb()
      .select()
      .from(taxReference)
      .orderBy(desc(taxReference.taxYear), taxReference.kind, taxReference.ordinal);
    rows = raw.map((r) => ({
      taxYear: r.taxYear,
      kind: r.kind,
      ordinal: r.ordinal,
      threshold: r.threshold === null ? null : Number(r.threshold),
      value: Number(r.value),
    }));
  } catch {
    return DEFAULT_TAX_TABLE;
  }

  return selectTaxTable(rows, now);
}

/**
 * The pure half of loadTaxTable, so the selection rules can be tested
 * without a database.
 */
export function selectTaxTable(rows: TaxReferenceRow[], now: Date = new Date()): TaxTable {
  const currentYear = now.getFullYear();
  const years = Array.from(new Set(rows.map((r) => r.taxYear)))
    .filter((y) => y <= currentYear)
    .sort((a, b) => b - a);

  for (const year of years) {
    const built = buildTaxTable(year, rows);
    if (built.ok) return built.table;
  }
  return DEFAULT_TAX_TABLE;
}
