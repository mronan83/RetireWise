import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider } = await request.json();

  if (!["anthropic", "google", "openai", "gateway"].includes(provider)) {
    return Response.json({ error: "Invalid provider" }, { status: 400 });
  }

  const db = getDb();
  const existing = await db
    .select({ id: userPreferences.id })
    .from(userPreferences)
    .where(eq(userPreferences.clerkId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userPreferences)
      .set({ aiProvider: provider, updatedAt: new Date() })
      .where(eq(userPreferences.clerkId, userId));
  } else {
    await db.insert(userPreferences).values({
      clerkId: userId,
      aiProvider: provider,
    });
  }

  return Response.json({ success: true, provider });
}
