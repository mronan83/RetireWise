import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { households, householdMembers } from "./db/schema";
import { auth } from "@clerk/nextjs/server";

/**
 * Get the household clerkId for data queries.
 *
 * If the current user belongs to a household, returns the primary user's
 * clerkId (the one who owns all the data). This way both spouses see
 * the same data. If not in a household, returns the user's own clerkId.
 */
export async function getHouseholdClerkId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();

  // Check if this user is a member of any household
  const membership = await db
    .select({
      householdId: householdMembers.householdId,
      primaryClerkId: households.primaryClerkId,
    })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(eq(householdMembers.clerkId, userId))
    .limit(1);

  if (membership.length > 0) {
    // Return the primary user's clerkId — all data is stored under this ID
    return membership[0].primaryClerkId;
  }

  // Not in a household — use own clerkId
  return userId;
}

/**
 * Create a household for the current user (primary) and generate an invite code.
 */
export async function createHousehold(): Promise<{
  householdId: string;
  inviteCode: string;
}> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();

  // Generate a simple invite code
  const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

  const [household] = await db
    .insert(households)
    .values({
      primaryClerkId: userId,
      inviteCode,
    })
    .returning({ id: households.id });

  // Add the primary user as a member
  await db.insert(householdMembers).values({
    householdId: household.id,
    clerkId: userId,
    role: "primary",
  });

  return { householdId: household.id, inviteCode };
}

/**
 * Join a household using an invite code.
 */
export async function joinHousehold(inviteCode: string): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();

  const household = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.inviteCode, inviteCode.toUpperCase()))
    .limit(1);

  if (household.length === 0) return false;

  // Check if already a member
  const existing = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(eq(householdMembers.clerkId, userId))
    .limit(1);

  if (existing.length > 0) return true; // Already in a household

  await db.insert(householdMembers).values({
    householdId: household[0].id,
    clerkId: userId,
    role: "member",
  });

  return true;
}
