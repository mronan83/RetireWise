import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getAuthContext } from "@/lib/auth-helpers";
import { getDb } from "@/lib/db";

/**
 * TEMPORARY diagnostic. Reports how the request resolves to a data owner and
 * what the database connection can actually see. Auth-gated; returns no
 * secrets. Delete once the empty-dashboard issue is closed.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ signedIn: false }, { status: 401 });

  const db = getDb();
  const out: Record<string, unknown> = { signedIn: true, authUserId: userId };

  try {
    const ctx = await getAuthContext();
    out.dataClerkId = ctx.dataClerkId;
    out.isDemo = ctx.isDemo;
  } catch (e) {
    out.getAuthContextError = (e as Error).message;
  }

  const one = async (label: string, q: ReturnType<typeof sql>) => {
    try {
      const r = (await db.execute(q)) as unknown as Record<string, unknown>[];
      out[label] = Array.isArray(r) ? r[0] : r;
    } catch (e) {
      out[label] = { error: (e as Error).message };
    }
  };

  await one("connection", sql`select current_user::text as current_user, session_user::text as session_user, current_database()::text as db`);
  // Unfiltered count. If this is 0 while the table holds rows, the connection
  // is being filtered by row level security rather than by clerk_id.
  await one("rowsVisible", sql`select
      (select count(*) from accounts)::int  as accounts_all,
      (select count(*) from holdings)::int  as holdings_all,
      (select count(*) from household_members)::int as household_members_all`);
  await one("forAuthUser", sql`select count(*)::int as accounts from accounts where clerk_id = ${userId}`);
  await one("forDataOwner", sql`select count(*)::int as accounts from accounts where clerk_id = ${String(out.dataClerkId ?? "")}`);

  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
