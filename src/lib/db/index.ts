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
    // One connection per serverless instance: postgres.js keeps a TCP pool,
    // unlike the stateless HTTP driver this replaced.
    max: 1,
    idle_timeout: 20,
  });

  return drizzle(sql, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}
