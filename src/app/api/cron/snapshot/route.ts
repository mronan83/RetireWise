import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, cronRuns } from "@/lib/db/schema";
import { snapshotHouseholds } from "@/lib/utils/portfolio-snapshot";
import { withSystemRole } from "@/lib/db/tenant";
import { OPERATOR, notifySafely } from "@/lib/notifications/send";
import { messages } from "@/lib/notifications/kinds";

export async function GET(request: Request) {
  return withSystemRole("snapshots every household", async () => {
    try {
      return await handleGet(request);
    } catch (e) {
      await notifySafely({
        clerkId: OPERATOR,
        kind: "jobs",
        eventKey: `portfolio_snapshot:crash:${new Date().toISOString().slice(0, 10)}`,
        message: messages.job("weekday snapshot"),
      });
      throw e;
    }
  });
}

async function handleGet(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Recorded so /api/health/freshness can tell "ran and found nothing to do"
  // from "has not run since Tuesday". Without a row, a cron that silently
  // stops looks exactly like one with no work.
  const [run] = await db
    .insert(cronRuns)
    .values({ job: "portfolio_snapshot" })
    .returning({ id: cronRuns.id });

  // Get all unique clerk IDs that have accounts
  const allAccounts = await db
    .select({ clerkId: accounts.clerkId })
    .from(accounts);
  const clerkIds = [...new Set(allAccounts.map((a) => a.clerkId))];

  const today = new Date().toISOString().split("T")[0];
  const result = await snapshotHouseholds(clerkIds, today);

  await db
    .update(cronRuns)
    .set({
      finishedAt: new Date(),
      // A run is ok only when every household was snapshotted.
      ok: result.failed === 0,
      processed: result.snapshotted,
      detail: { pricesUpdated: result.pricesUpdated, date: today, householdsFailed: result.failed },
    })
    .where(eq(cronRuns.id, run.id));

  if (result.failed > 0) {
    await notifySafely({ clerkId: OPERATOR, kind: "jobs", eventKey: `portfolio_snapshot:${today}`, message: messages.job("weekday snapshot") });
  }

  return Response.json({
    success: result.failed === 0,
    snapshotsCreated: result.snapshotted,
    householdsFailed: result.failed,
    pricesUpdated: result.pricesUpdated,
    date: today,
  });
}
