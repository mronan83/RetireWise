import { getApiUserId } from "@/lib/auth-helpers";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alerts } from "@/lib/db/schema";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const activeAlerts = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.clerkId, userId), eq(alerts.isDismissed, false)))
    .orderBy(desc(alerts.createdAt))
    .limit(20);

  return Response.json(activeAlerts);
}
