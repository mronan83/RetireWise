import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { households, householdMembers } from "./db/schema";

export const DEMO_CLERK_ID = "demo_user_retirewise";

/**
 * Get the authenticated user's ID and the household clerkId for data access.
 * In demo mode (cookie set by middleware), returns the demo clerkId
 * so all reads show demo data. Writes still use auth() directly and will fail.
 */
export async function getAuthContext(): Promise<{
  userId: string;
  dataClerkId: string;
  isDemo: boolean;
}> {
  // Check for demo mode
  const cookieStore = await cookies();
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_ENABLED !== "false";
  if (demoEnabled && cookieStore.get("demo")?.value === "1") {
    return { userId: DEMO_CLERK_ID, dataClerkId: DEMO_CLERK_ID, isDemo: true };
  }

  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();
  const membership = await db
    .select({ primaryClerkId: households.primaryClerkId })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(eq(householdMembers.clerkId, userId))
    .limit(1);

  const dataClerkId =
    membership.length > 0 ? membership[0].primaryClerkId : userId;

  return { userId, dataClerkId, isDemo: false };
}
