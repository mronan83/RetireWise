import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The connection string, preferring a name this app controls.
 *
 * A Vercel marketplace integration can own DATABASE_URL and render it
 * read-only, so edits to it silently do nothing and the app keeps talking to
 * the integration's database. That is exactly what happened here. Reading an
 * app-owned name first makes the app's database a decision of this codebase
 * rather than of whichever integration happens to be installed.
 */
export function databaseUrl(): string {
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Set SUPABASE_DATABASE_URL (or DATABASE_URL).");
  }
  return url;
}

function createDb() {
  const url = databaseUrl();

  const sql = postgres(url, {
    // Supabase's Supavisor pooler in transaction mode (port 6543) cannot hold
    // prepared statements across queries. Harmless on a direct connection, so
    // it is safe to leave off unconditionally.
    prepare: false,
    // Room for a few concurrent transactions. Tenant-scoped work runs inside
    // an explicit transaction (see tenant.ts), which holds a connection for
    // its duration, so a single-connection pool would serialise every request
    // on an instance and deadlock any that fans out.
    max: 5,
    idle_timeout: 20,
  });

  return drizzle(sql, { schema });
}

type FullDb = ReturnType<typeof createDb>;

/**
 * What query code is handed.
 *
 * `$client` is omitted because a transaction does not carry one, and the
 * tenant-scoped handle in ./tenant is a transaction. Everything the app
 * actually calls — select, insert, update, delete, execute, query — is
 * present on both.
 */
export type Db = Omit<FullDb, "$client">;

let _db: FullDb | null = null;

/**
 * The unscoped connection, as the table owner.
 *
 * Not for general use — call `getDb()` from ./tenant instead, which returns
 * the row-level-security-scoped handle when one is in scope. This is exported
 * for that module, for migrations, and for the seeder.
 */
export function getBaseDb(): FullDb {
  if (!_db) _db = createDb();
  return _db;
}

export { getDb } from "./tenant";
