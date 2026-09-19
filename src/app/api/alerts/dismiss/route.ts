import { getApiUserId } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alerts } from "@/lib/db/schema";

export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  const db = getDb();

  await db
    .update(alerts)
    .set({ isDismissed: true })
    .where(and(eq(alerts.id, id), eq(alerts.clerkId, userId)));

  return Response.json({ success: true });
}
