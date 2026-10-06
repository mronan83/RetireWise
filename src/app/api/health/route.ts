import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { withSystemRole } from "@/lib/db/tenant";
import { missingColumns } from "@/lib/db/schema-check";

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
 * It also reports whether the database has every column the code reads.
 * Migrations are applied by hand, so a release can arrive before its
 * migration, and then every page reading that table fails; the release
 * script reads this and prints the rollback.
 *
 * Deliberately reports booleans, counts and a latency figure only. Error
 * text can carry connection strings and hostnames, and this endpoint is
 * public, so it says how many columns are missing, not which.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return withSystemRole(
    "liveness probe, no session",
    () => handleGet()
  );
}

async function handleGet() {
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

  // Null when it could not be checked; the schema then counts as unconfirmed.
  let missing: number | null = null;
  if (database) {
    try {
      missing = (await missingColumns(getDb())).length;
    } catch {
      missing = null;
    }
  }
  const schema = missing === 0;

  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );

  const healthy = database && schema && authConfigured;

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: { database, schema, authConfigured },
      databaseName,
      missingColumns: missing,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
