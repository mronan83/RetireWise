import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { irsLimits } from "@/lib/db/schema";

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
  const { userId } = await auth();
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

  return Response.json({ success: true, upserted, years: [2025, 2026] });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const limits = await db
    .select()
    .from(irsLimits)
    .orderBy(irsLimits.taxYear, irsLimits.accountType);

  return Response.json({ limits });
}
