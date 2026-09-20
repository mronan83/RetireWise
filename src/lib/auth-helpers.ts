import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { getDb } from "./db";
import { households, householdMembers } from "./db/schema";
import { withTenant } from "./db/tenant";

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

/**
 * For anything that writes: the id to key rows by.
 *
 * The demo household is seeded, shared, and read-only — a demo visitor who
 * reached a write path would otherwise edit the dataset every other visitor
 * sees, so this refuses rather than resolving to DEMO_CLERK_ID.
 */
export async function requireWriteClerkId(): Promise<string> {
  const ctx = await getAuthContext();
  if (ctx.isDemo) throw new Error("Demo mode is read-only.");
  return ctx.dataClerkId;
}

/**
 * Run a request's work as its household, under row level security.
 *
 * Auth resolution itself runs first and unscoped, because it is what decides
 * the tenant and so cannot already know it. Everything after runs as
 * `app_user` inside one transaction — see src/lib/db/tenant.ts.
 *
 * Call sites do not change how they query: `getDb()` returns the scoped
 * handle automatically inside this, because the context travels with the async
 * call stack rather than being passed down by hand.
 *
 * A missed entry point is not a regression — it simply keeps the old
 * unprotected behaviour — but scripts/check-tenant-scope.ts fails the build
 * when one appears, so "missed" does not quietly become "forgotten".
 */
export async function withHousehold<T>(fn: (clerkId: string) => Promise<T>): Promise<T> {
  const ctx = await getAuthContext();
  return withTenant(ctx.dataClerkId, ctx.userId, () => fn(ctx.dataClerkId));
}

/**
 * The same, for anything that writes.
 *
 * Refuses in demo mode, where the household is seeded, shared and read-only.
 */
export async function withWriteHousehold<T>(fn: (clerkId: string) => Promise<T>): Promise<T> {
  const ctx = await getAuthContext();
  if (ctx.isDemo) throw new Error("Demo mode is read-only.");
  return withTenant(ctx.dataClerkId, ctx.userId, () => fn(ctx.dataClerkId));
}

/**
 * The same, for route handlers: answers 401 instead of throwing when signed
 * out, so a signed-out request does not surface as a 500.
 */
export async function withApiHousehold(
  fn: (clerkId: string) => Promise<Response>
): Promise<Response> {
  const ctx = await read();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return withTenant(ctx.dataClerkId, ctx.userId, () => fn(ctx.dataClerkId));
}
