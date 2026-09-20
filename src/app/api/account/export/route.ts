import { withApiHousehold } from "@/lib/auth-helpers";
import { auth } from "@/lib/auth";
import { buildAccountExport } from "@/lib/account/export";
import { recordAudit } from "@/lib/audit";

/**
 * Download everything RetireWise holds for this household.
 *
 * A single JSON file rather than the per-table CSVs already offered, because
 * the question this answers is "what do you have on me", and an answer split
 * across three downloads that omit most of the tables does not answer it.
 */
export async function GET() {
  return withApiHousehold(async (clerkId) => {
    const { userId } = await auth();
    const payload = await buildAccountExport(clerkId);

    await recordAudit({
      clerkId,
      actorId: userId,
      action: "data.exported",
      detail: {
        tables: Object.keys(payload.data).length,
        rows: Object.values(payload.data).reduce(
          (total, rows) => total + (Array.isArray(rows) ? rows.length : 0),
          0
        ),
      },
    });

    const filename = `retirewise-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  });
}
