import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alerts } from "@/lib/db/schema";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  await db
    .update(alerts)
    .set({ isDismissed: true })
    .where(and(eq(alerts.clerkId, userId), eq(alerts.isDismissed, false)));

  return Response.json({ success: true });
}
