import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Does the database have every column this code reads?
 *
 * Migrations are applied by hand, outside the release (backlog #6). Drizzle
 * names every column of a table in each query it builds, so a release that
 * expects a column the database lacks fails on every page that reads that
 * table, and nothing said so until someone opened one. The health check runs
 * this, so a release made before its migration reports unhealthy at once and
 * the release script prints the rollback.
 */
export function declaredColumns(): { table: string; column: string }[] {
  return (Object.values(schema).filter((v) => is(v, PgTable)) as PgTable[]).flatMap((t) => {
    const cfg = getTableConfig(t);
    return cfg.columns.map((c) => ({ table: cfg.name, column: c.name }));
  });
}

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/** Declared columns the database does not have, as "table.column". Empty when it matches. */
export async function missingColumns(
  db: Executor,
  declared = declaredColumns()
): Promise<string[]> {
  // pg_catalog rather than information_schema: the second shows only what
  // the connecting role has privileges on, and would hide a table to look
  // like a missing one.
  const rows = (await db.execute(sql`
    select c.relname::text as "table", a.attname::text as "column"
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
  `)) as unknown as { table: string; column: string }[];
  const present = new Set(rows.map((r) => `${r.table}.${r.column}`));
  return declared.map((d) => `${d.table}.${d.column}`).filter((name) => !present.has(name));
}
