import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { getDb } from "./db";
import { households, householdMembers } from "./db/schema";

export const DEMO_CLERK_ID = "demo_user_retirewise";

export type AuthContext = {
  /** The signed-in account's own id. */
  userId: string;
  /** The id every row is keyed by — the household's primary account. */
  dataClerkId: string;
  isDemo: boolean;
};

/**
 * Resolve the signed-in account to the id its data is stored under.
 *
 * Both spouses sign in as themselves but share one dataset, so the household
 * join maps either account to the primary's id. Anything that reads or writes
 * a clerk_id-keyed row must use dataClerkId — using the raw account id returns
 * an empty result set rather than an error, which is why this is easy to get
 * wrong and hard to notice.
 */
async function resolve(userId: string): Promise<string> {
  const db = getDb();
  const membership = await db
    .select({ primaryClerkId: households.primaryClerkId })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(eq(householdMembers.clerkId, userId))
    .limit(1);

  return membership.length > 0 ? membership[0].primaryClerkId : userId;
}

async function read(): Promise<AuthContext | null> {
  // Demo mode (cookie set by proxy) reads the seeded demo household.
  const cookieStore = await cookies();
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_ENABLED !== "false";
  if (demoEnabled && cookieStore.get("demo")?.value === "1") {
    return { userId: DEMO_CLERK_ID, dataClerkId: DEMO_CLERK_ID, isDemo: true };
  }

  const { userId } = await auth();
  if (!userId) return null;

  return { userId, dataClerkId: await resolve(userId), isDemo: false };
}

/** For pages and server actions. Throws when signed out. */
export async function getAuthContext(): Promise<AuthContext> {
  const ctx = await read();
  if (!ctx) throw new Error("Unauthorized");
  return ctx;
}

/**
 * For route handlers: the id to key data by, or null when signed out so the
 * caller can answer 401 rather than throwing a 500.
 */
export async function getApiUserId(): Promise<string | null> {
  return (await read())?.dataClerkId ?? null;
}
