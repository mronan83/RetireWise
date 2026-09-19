import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * Unauthenticated liveness check, for an external uptime monitor.
 *
 * It exists because this app was down for 92 days without anyone noticing:
 * the auth provider's credential had expired, and nothing was watching. A
 * monitor polling this would have caught it in minutes.
 *
 * Pinging it also keeps the database warm. Supabase pauses a Free plan
 * project after a 7-day low-activity window, and a paused project does not
 * wake on its own — a few requests a day is enough to prevent it.
 *
 * Deliberately reports booleans and a latency figure only. Error text can
 * carry connection strings and hostnames, and this endpoint is public.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  let database = false;
  // The database NAME, not the connection string. Cheap, non-sensitive, and
  // the one signal that would have caught this app silently running against
  // the wrong database for a day.
  let databaseName: string | null = null;
  try {
    const r = (await getDb().execute(
      sql`select current_database()::text as db`
    )) as unknown as { db: string }[];
    databaseName = Array.isArray(r) ? (r[0]?.db ?? null) : null;
    database = true;
  } catch {
    database = false;
  }

  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );

  const healthy = database && authConfigured;

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: { database, authConfigured },
      databaseName,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
