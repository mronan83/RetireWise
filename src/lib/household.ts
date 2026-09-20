import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { households, householdMembers } from "./db/schema";
import { auth } from "./auth";
import { compHousehold } from "./billing/entitlements";
import { redeemInvite, type RedeemResult } from "./invites";

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
 * Create a household for the current user, as its primary member.
 *
 * No invite code is issued here. Invitations are separate, expiring,
 * single-use objects created on demand — see src/lib/invites.ts — so a
 * household does not carry a permanently valid credential just by existing.
 */
export async function createHousehold(): Promise<{ householdId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();

  const [household] = await db
    .insert(households)
    .values({ primaryClerkId: userId })
    .returning({ id: households.id });

  await db.insert(householdMembers).values({
    householdId: household.id,
    clerkId: userId,
    role: "primary",
  });

  // Every household created while the app is free is comped, so switching
  // billing on later cannot take anything away from someone who was already
  // using it. Cheap to record now; impossible to reconstruct afterwards.
  await compHousehold(userId, "friends-and-family");

  return { householdId: household.id };
}

/**
 * Join a household using an invite code.
 *
 * Everything that decides the answer — the code check, the rate limit, the
 * single-use claim and the household's member limit — lives in
 * src/lib/invites.ts, so there is one place where redemption can be reasoned
 * about rather than a check here and a check there.
 */
export async function joinHousehold(inviteCode: string): Promise<RedeemResult> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return redeemInvite(inviteCode, userId);
}
