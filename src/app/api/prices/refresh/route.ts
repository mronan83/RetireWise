import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { households, householdMembers } from "@/lib/db/schema";
import { updateAllPrices } from "@/lib/utils/price-feed";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Resolve household clerkId
  const membership = await db
    .select({ primaryClerkId: households.primaryClerkId })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(eq(householdMembers.clerkId, userId))
    .limit(1);

  const dataClerkId = membership.length > 0 ? membership[0].primaryClerkId : userId;

  try {
    const result = await updateAllPrices(dataClerkId);

    revalidatePath("/dashboard");
    revalidatePath("/holdings");
    revalidatePath("/accounts");
    revalidatePath("/projections");
    revalidatePath("/analytics");
    revalidatePath("/net-worth");

    return Response.json({
      success: true,
      updated: result.updated,
      failed: result.failed,
      tickers: result.tickers,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Price update failed";
    console.error("Price refresh error:", e);
    return Response.json({ error: message, stack: String(e) }, { status: 500 });
  }
}
