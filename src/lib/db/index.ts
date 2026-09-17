import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

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
