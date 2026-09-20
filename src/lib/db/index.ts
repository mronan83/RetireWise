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
    // Tenant-scoped work runs inside an explicit transaction (see tenant.ts),
    // which holds a connection for as long as the request renders — not just
    // for each query. That is the cost of enforcing row level security behind
    // a transaction-mode pooler, and it makes pool size a real limit on
    // concurrency rather than a formality. Sized for a burst of parallel page
    // loads on one instance; the mobile suite, which is far more concurrent
    // than real use, exhausted a pool of five.
    max: 10,
    idle_timeout: 20,
    // Wait rather than fail when the pool is busy, but not forever: a request
    // that cannot get a connection should surface as an error someone can
    // read, not as a page that hangs until the platform kills it.
    connect_timeout: 15,
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
