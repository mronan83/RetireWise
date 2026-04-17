import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { households, householdMembers } from "./db/schema";

/**
 * Get the authenticated user's ID and the household clerkId for data access.
 * If the user belongs to a household, dataClerkId is the primary member's ID.
 * If not, dataClerkId is the same as userId.
 */
export async function getAuthContext(): Promise<{
  userId: string;
  dataClerkId: string;
}> {
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

  return { userId, dataClerkId };
}
