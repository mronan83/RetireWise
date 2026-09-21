import { getApiUserId, withApiWriteHousehold } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alerts } from "@/lib/db/schema";

export async function POST() {
  return withApiWriteHousehold(() => handlePost());
}

async function handlePost() {
  const userId = await getApiUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  await db
    .update(alerts)
    .set({ isDismissed: true })
    .where(and(eq(alerts.clerkId, userId), eq(alerts.isDismissed, false)));

  return Response.json({ success: true });
}
