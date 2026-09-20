import { getApiUserId } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { irsLimits, taxReference } from "@/lib/db/schema";
import { withSystemRole } from "@/lib/db/tenant";
import { allSeedRows, SEED_TAX_YEARS } from "@/lib/tax/seed";
import { loadTaxTable } from "@/lib/tax/load";

// Known IRS limits — updated manually when IRS announces new numbers
// Source: irs.gov retirement plan contribution limits
const KNOWN_LIMITS = [
  // 2025
  { taxYear: 2025, accountType: "401k", limitUnder50: 23500, limitOver50: 31000, limitAge60to63: 34750, notes: "Employee elective deferral" },
  { taxYear: 2025, accountType: "403b", limitUnder50: 23500, limitOver50: 31000, limitAge60to63: 34750, notes: "Employee elective deferral" },
  { taxYear: 2025, accountType: "ira_traditional", limitUnder50: 7000, limitOver50: 8000, limitAge60to63: null, notes: "Combined Traditional + Roth limit" },
  { taxYear: 2025, accountType: "ira_roth", limitUnder50: 7000, limitOver50: 8000, limitAge60to63: null, notes: "Combined Traditional + Roth limit" },
  { taxYear: 2025, accountType: "hsa", limitUnder50: 4300, limitOver50: 5300, limitAge60to63: null, notes: "Family coverage ($3550 self-only)" },
  // 2026
  { taxYear: 2026, accountType: "401k", limitUnder50: 24500, limitOver50: 32500, limitAge60to63: 35750, notes: "Employee elective deferral" },
  { taxYear: 2026, accountType: "403b", limitUnder50: 24500, limitOver50: 32500, limitAge60to63: 35750, notes: "Employee elective deferral" },
  { taxYear: 2026, accountType: "ira_traditional", limitUnder50: 7500, limitOver50: 8600, limitAge60to63: null, notes: "Combined Traditional + Roth limit" },
  { taxYear: 2026, accountType: "ira_roth", limitUnder50: 7500, limitOver50: 8600, limitAge60to63: null, notes: "Combined Traditional + Roth limit" },
  { taxYear: 2026, accountType: "hsa", limitUnder50: 4400, limitOver50: 5400, limitAge60to63: null, notes: "Family coverage (estimated)" },
];

export async function POST() {
  return withSystemRole(
    "shared reference data, owned by no household",
    () => handlePost()
  );
}

async function handlePost() {
  const userId = await getApiUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  let upserted = 0;

  for (const limit of KNOWN_LIMITS) {
    // Check if exists
    const existing = await db
      .select({ id: irsLimits.id })
      .from(irsLimits)
      .where(
        and(
          eq(irsLimits.taxYear, limit.taxYear),
          eq(irsLimits.accountType, limit.accountType)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(irsLimits)
        .set({
          limitUnder50: String(limit.limitUnder50),
          limitOver50: String(limit.limitOver50),
          limitAge60to63: limit.limitAge60to63 ? String(limit.limitAge60to63) : null,
          notes: limit.notes,
          updatedAt: new Date(),
        })
        .where(eq(irsLimits.id, existing[0].id));
    } else {
      await db.insert(irsLimits).values({
        taxYear: limit.taxYear,
        accountType: limit.accountType,
        limitUnder50: String(limit.limitUnder50),
        limitOver50: String(limit.limitOver50),
        limitAge60to63: limit.limitAge60to63 ? String(limit.limitAge60to63) : null,
        notes: limit.notes,
      });
    }
    upserted++;
  }

  /**
   * Tax brackets, IRMAA tiers, and Medicare base costs.
   *
   * Same job as the contribution limits above and the same endpoint,
   * because they go stale on the same schedule and a person updating one
   * and not the other is how the app ends up quietly mixing years.
   */
  const taxRows = allSeedRows();
  let taxUpserted = 0;
  for (const row of taxRows) {
    const existing = await db
      .select({ id: taxReference.id })
      .from(taxReference)
      .where(
        and(
          eq(taxReference.taxYear, row.taxYear),
          eq(taxReference.kind, row.kind),
          eq(taxReference.ordinal, row.ordinal)
        )
      )
      .limit(1);

    const values = {
      threshold: row.threshold === null ? null : String(row.threshold),
      value: String(row.value),
      notes: row.notes,
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      await db.update(taxReference).set(values).where(eq(taxReference.id, existing[0].id));
    } else {
      await db.insert(taxReference).values({
        taxYear: row.taxYear,
        kind: row.kind,
        ordinal: row.ordinal,
        ...values,
      });
    }
    taxUpserted++;
  }

  /**
   * Read back through the same loader the app uses.
   *
   * A seed that writes rows the validator then rejects is a seed that did
   * nothing, and the caller should hear about it here rather than discover
   * it as a "built-in fallback" badge on the analytics page.
   */
  const table = await loadTaxTable();

  return Response.json({
    success: true,
    upserted,
    years: [...new Set(KNOWN_LIMITS.map((l) => l.taxYear))],
    taxReference: {
      upserted: taxUpserted,
      years: SEED_TAX_YEARS.map((y) => y.taxYear),
      activeTaxYear: table.taxYear,
      source: table.source,
    },
  });
}

export async function GET() {
  return withSystemRole(
    "shared reference data, owned by no household",
    () => handleGet()
  );
}

async function handleGet() {
  const userId = await getApiUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const [limits, taxRows] = await Promise.all([
    db.select().from(irsLimits).orderBy(irsLimits.taxYear, irsLimits.accountType),
    db
      .select()
      .from(taxReference)
      .orderBy(taxReference.taxYear, taxReference.kind, taxReference.ordinal),
  ]);

  const table = await loadTaxTable();

  return Response.json({
    limits,
    taxReference: taxRows,
    activeTaxTable: { taxYear: table.taxYear, source: table.source },
  });
}
