/**
 * The RetireWise data model: half read from the code, half written down.
 *
 * Tables, columns, types, defaults, keys, indexes and enums come from the
 * Drizzle schema (src/lib/db/schema.ts); row-level security, policies, grants
 * and any database functions come from the SQL migrations. What each table
 * is for, who writes it, the domains, the rules and the security model are
 * written in docs/DATA-MODEL.md. validate() fails when the two halves
 * disagree: a table or enum nobody described, a description of something
 * that no longer exists, a note on a column that is gone, or a table keyed to
 * a household without row-level security.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { is, SQL } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { parseDoc, section, pathsIn, blockText, type Doc, type Entry, type Block } from "../pages/markdown";

export const DOC_FILE = "docs/DATA-MODEL.md";
export const SCHEMA_FILE = "src/lib/db/schema.ts";
export const MIGRATIONS_DIR = "src/lib/db/migrations";

export type Column = {
  name: string;
  type: string;
  notNull: boolean;
  primary: boolean;
  unique: boolean;
  default: string | null;
  references?: { table: string; column: string; onDelete?: string };
};
export type Policy = { name: string; command: string; role: string; using: string | null; check: string | null };
export type TableInfo = {
  name: string;
  columns: Column[];
  indexes: { name: string; unique: boolean; columns: string[] }[];
  rls: boolean;
  policies: Policy[];
  /** Privileges granted to app_user, the role requests run as. */
  grants: string[];
  /** The column that ties a row to a household, if any. */
  householdKey: string | null;
};
export type EnumInfo = { name: string; values: string[] };
export type Catalog = {
  tables: TableInfo[];
  enums: EnumInfo[];
  functions: string[];
  views: string[];
  triggers: string[];
  /** Indexes the migrations create that the schema does not declare, or the reverse. */
  indexDrift: string[];
};

function renderDefault(col: { default?: unknown; defaultFn?: unknown; hasDefault?: boolean }): string | null {
  if (!col.hasDefault) return null;
  const d = col.default;
  if (is(d, SQL)) {
    return (d as SQL).queryChunks
      .map((c) => (typeof c === "object" && c && "value" in c ? (c as { value: string[] }).value.join("") : String(c)))
      .join("");
  }
  if (d !== undefined) return typeof d === "string" ? `'${d}'` : JSON.stringify(d);
  return col.defaultFn ? "set in code" : null;
}

const HOUSEHOLD_KEYS = ["clerk_id", "household_id", "primary_clerk_id", "account_id"];

/** Statements of every migration, in order, without the drizzle breakpoints. */
function migrationStatements(root: string): string[] {
  const dir = join(root, MIGRATIONS_DIR);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => readFileSync(join(dir, f), "utf8").replace(/--> statement-breakpoint/g, "").split(/;\s*(?:\n|$)/))
    .map((s) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Read the schema and migrations under root, which is the working tree for a
 * check and a snapshot of the released commit for a published page.
 */
export async function introspect(root = process.cwd()): Promise<Catalog> {
  const schema: Record<string, unknown> = await import(pathToFileURL(join(root, SCHEMA_FILE)).href);
  const tables = Object.values(schema).filter((v) => is(v, PgTable)) as PgTable[];
  const enums = Object.values(schema)
    .filter((v) => typeof v === "function" && "enumName" in (v as object) && "enumValues" in (v as object))
    .map((v) => ({ name: (v as unknown as { enumName: string }).enumName, values: [...(v as unknown as { enumValues: string[] }).enumValues] }));

  const rls = new Set<string>();
  const policies = new Map<string, Policy[]>();
  const grants = new Map<string, Set<string>>();
  const functions: string[] = [];
  const views: string[] = [];
  const triggers: string[] = [];
  const migrationIndexes = new Map<string, string>();
  for (const st of migrationStatements(root)) {
    let m = st.match(/^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"?(\w+)"? ON "?(\w+)"?/i);
    if (m) { migrationIndexes.set(m[1], m[2]); continue; }
    m = st.match(/^DROP INDEX (?:IF EXISTS )?"?(\w+)"?/i);
    if (m) { migrationIndexes.delete(m[1]); continue; }
    m = st.match(/^ALTER TABLE "?(\w+)"? ENABLE ROW LEVEL SECURITY/i);
    if (m) { rls.add(m[1]); continue; }
    m = st.match(/^ALTER TABLE "?(\w+)"? DISABLE ROW LEVEL SECURITY/i);
    if (m) { rls.delete(m[1]); continue; }
    m = st.match(/^CREATE POLICY "([^"]+)" ON "?(\w+)"?(?: AS \w+)? FOR (\w+) TO (\w+)(?: USING \((.*?)\))?(?: WITH CHECK \((.*)\))?$/i);
    if (m) {
      const list = policies.get(m[2]) ?? [];
      list.push({ name: m[1], command: m[3].toUpperCase(), role: m[4], using: m[5] ?? null, check: m[6] ?? null });
      policies.set(m[2], list);
      continue;
    }
    m = st.match(/^DROP POLICY (?:IF EXISTS )?"([^"]+)" ON "?(\w+)"?/i);
    if (m) { policies.set(m[2], (policies.get(m[2]) ?? []).filter((p) => p.name !== m![1])); continue; }
    m = st.match(/^GRANT ([A-Z, ]+) ON (?:TABLE )?"?(\w+)"? TO app_user/i);
    if (m) {
      const set = grants.get(m[2]) ?? new Set<string>();
      m[1].split(",").map((x) => x.trim().toUpperCase()).forEach((x) => set.add(x));
      grants.set(m[2], set);
      continue;
    }
    m = st.match(/^REVOKE ([A-Z, ]+) ON (?:TABLE )?"?(\w+)"? FROM app_user/i);
    if (m) { m[1].split(",").map((x) => x.trim().toUpperCase()).forEach((x) => grants.get(m![2])?.delete(x)); continue; }
    m = st.match(/^CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?"?(\w+)"?/i);
    if (m) { functions.push(m[1]); continue; }
    m = st.match(/^CREATE (?:OR REPLACE )?VIEW (?:public\.)?"?(\w+)"?/i);
    if (m) { views.push(m[1]); continue; }
    m = st.match(/^CREATE (?:OR REPLACE )?TRIGGER "?(\w+)"?/i);
    if (m) triggers.push(m[1]);
  }

  const schemaIndexes = new Map(
    tables.flatMap((t) => {
      const cfg = getTableConfig(t);
      return cfg.indexes.map((i) => [i.config.name ?? "", cfg.name] as [string, string]);
    })
  );
  const indexDrift = [
    ...[...migrationIndexes].filter(([n]) => !schemaIndexes.has(n)).map(([n, t]) => `${t}: the migrations create index ${n}, which ${SCHEMA_FILE} does not declare.`),
    ...[...schemaIndexes].filter(([n]) => !migrationIndexes.has(n)).map(([n, t]) => `${t}: ${SCHEMA_FILE} declares index ${n}, which no migration creates.`),
  ];

  return {
    enums,
    functions: [...new Set(functions)],
    views: [...new Set(views)],
    triggers: [...new Set(triggers)],
    indexDrift,
    tables: tables.map((t) => {
      const cfg = getTableConfig(t);
      const refs = new Map<string, Column["references"]>();
      for (const fk of cfg.foreignKeys) {
        const r = fk.reference();
        r.columns.forEach((c, i) =>
          refs.set(c.name, { table: getTableConfig(r.foreignTable).name, column: r.foreignColumns[i].name, onDelete: fk.onDelete })
        );
      }
      const columns: Column[] = cfg.columns.map((c) => ({
        name: c.name,
        type: c.getSQLType(),
        notNull: c.notNull,
        primary: c.primary,
        unique: c.isUnique,
        default: renderDefault(c as unknown as { default?: unknown; defaultFn?: unknown; hasDefault?: boolean }),
        references: refs.get(c.name),
      }));
      const names = new Set(columns.map((c) => c.name));
      return {
        name: cfg.name,
        columns,
        indexes: [
          ...cfg.indexes.map((i) => ({
            name: i.config.name ?? "",
            unique: Boolean(i.config.unique),
            columns: i.config.columns.map((x) => (x as { name?: string }).name ?? "expression"),
          })),
          ...cfg.uniqueConstraints.map((u) => ({ name: u.getName() ?? "", unique: true, columns: u.columns.map((c) => c.name) })),
        ],
        rls: rls.has(cfg.name),
        policies: policies.get(cfg.name) ?? [],
        grants: [...(grants.get(cfg.name) ?? [])],
        householdKey: HOUSEHOLD_KEYS.find((k) => names.has(k)) ?? null,
      };
    }),
  };
}

// ---- the written half ---------------------------------------------------------

export type ColumnNote = { column: string; note: string };
export type TableDoc = { name: string; entry: Entry; description: Block[]; columnNotes: ColumnNote[] };
export type ModelDoc = {
  doc: Doc;
  domains: { name: string; description: Block[]; tables: string[] }[];
  tables: TableDoc[];
  enums: { name: string; description: Block[]; valueNotes: ColumnNote[] }[];
  rules: Entry[];
  derived: Entry[];
  log: { date: string; change: string; by: string }[];
};

const NOTE_ITEM = /^`([a-z0-9_]+)`\s*[:—-]\s*(.+)$/i;

/** Split an entry's blocks into its description and its `name`: note list items. */
function splitNotes(blocks: Block[]): { description: Block[]; notes: ColumnNote[] } {
  const notes: ColumnNote[] = [];
  const description: Block[] = [];
  for (const b of blocks) {
    if (b.kind === "ul" && b.items.every((it) => NOTE_ITEM.test(it.text))) {
      b.items.forEach((it) => {
        const m = it.text.match(NOTE_ITEM)!;
        notes.push({ column: m[1], note: [m[2], ...it.children].join(" ") });
      });
    } else description.push(b);
  }
  return { description, notes };
}

export function parseModelDoc(markdown: string): ModelDoc {
  const doc = parseDoc(markdown);
  const list = (s: string | undefined) => (s ?? "").split(",").map((x) => x.replace(/`/g, "").trim()).filter(Boolean);
  const log = (section(doc, "change log")?.blocks ?? [])
    .flatMap((b) => (b.kind === "ul" ? b.items.map((i) => i.text) : []))
    .map((line) => {
      const m = line.match(/^(\d{4}-\d{2}-\d{2})\s+·\s+(.+?)\s+·\s+([^·]+)$/);
      return m ? { date: m[1], change: m[2], by: m[3].trim() } : { date: "", change: line, by: "" };
    });
  return {
    doc,
    domains: (section(doc, "domains")?.entries ?? []).map((e) => ({ name: e.title, description: e.blocks, tables: list(e.fields.Tables) })),
    tables: (section(doc, "tables")?.entries ?? []).map((e) => {
      const { description, notes } = splitNotes(e.blocks);
      return { name: e.title.replace(/`/g, ""), entry: e, description, columnNotes: notes };
    }),
    enums: (section(doc, "enums")?.entries ?? []).map((e) => {
      const { description, notes } = splitNotes(e.blocks);
      return { name: e.title.replace(/`/g, ""), description, valueNotes: notes };
    }),
    rules: section(doc, "business rules")?.entries ?? [],
    derived: section(doc, "derived data")?.entries ?? [],
    log,
  };
}

/** A health row is a pass/fail property of the catalog, or (info) a fact worth seeing. */
export type HealthRow = { label: string; ok: boolean; detail: string; info?: boolean };
export type ModelReport = { errors: string[]; health: HealthRow[] };

export function validate(m: ModelDoc, c: Catalog, root = process.cwd()): ModelReport {
  const errors: string[] = [];
  const tableNames = new Set(c.tables.map((t) => t.name));
  const enumNames = new Set(c.enums.map((e) => e.name));

  if (!m.doc.lastReviewed) errors.push(`${DOC_FILE} has no "Last reviewed:" line.`);

  // Domains cover every table exactly once.
  const placed = new Map<string, string>();
  for (const d of m.domains) {
    if (d.tables.length === 0) errors.push(`Domain "${d.name}" lists no tables.`);
    for (const t of d.tables) {
      if (!tableNames.has(t)) errors.push(`Domain "${d.name}" lists ${t}, which is not a table in ${SCHEMA_FILE}.`);
      else if (placed.has(t)) errors.push(`${t} is in two domains: "${placed.get(t)}" and "${d.name}".`);
      else placed.set(t, d.name);
    }
  }
  for (const t of c.tables) if (!placed.has(t.name)) errors.push(`${t.name} is in no domain. Add it to one under "## Domains".`);

  // Every table described, once, and only real ones.
  const described = new Map(m.tables.map((t) => [t.name, t]));
  for (const t of c.tables) {
    const d = described.get(t.name);
    if (!d) { errors.push(`${t.name} is not described. Add "### ${t.name}" under "## Tables".`); continue; }
    if (blockText(d.description).trim().length < 20) errors.push(`${t.name} needs a sentence or two on what a row is and why it exists.`);
    if (!d.entry.fields["Written by"]) errors.push(`${t.name} does not say what writes it ("- Written by:").`);
    const cols = new Set(t.columns.map((x) => x.name));
    for (const n of d.columnNotes) if (!cols.has(n.column)) errors.push(`${t.name} has a note on \`${n.column}\`, which is not one of its columns.`);
  }
  for (const d of m.tables) if (!tableNames.has(d.name)) errors.push(`"### ${d.name}" describes a table that does not exist.`);
  if (m.tables.length !== new Set(m.tables.map((t) => t.name)).size) errors.push("A table is described twice.");

  // Every enum described, with only real values noted.
  const enumDocs = new Map(m.enums.map((e) => [e.name, e]));
  for (const e of c.enums) {
    const d = enumDocs.get(e.name);
    if (!d) { errors.push(`The enum ${e.name} is not described. Add "### ${e.name}" under "## Enums".`); continue; }
    for (const n of d.valueNotes) if (!e.values.includes(n.column)) errors.push(`${e.name} has a note on '${n.column}', which is not one of its values.`);
  }
  for (const d of m.enums) if (!enumNames.has(d.name)) errors.push(`"### ${d.name}" describes an enum that does not exist.`);

  for (const r of m.rules) if (!r.fields["Enforced by"]) errors.push(`Business rule "${r.title}" does not say what enforces it ("- Enforced by:").`);

  // Paths named anywhere must exist.
  const raw = readFileSync(join(root, DOC_FILE), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  for (const p of new Set(pathsIn(raw))) if (!existsSync(join(root, p))) errors.push(`${DOC_FILE} names ${p}, which does not exist.`);

  for (const l of m.log) if (!l.date) errors.push(`Change log line is not "- YYYY-MM-DD · what changed · who": ${l.change}`);

  // The schema and the migrations must describe the same database.
  errors.push(...c.indexDrift);

  // Catalog health: properties of the database itself.
  const keyed = c.tables.filter((t) => t.householdKey);
  const unprotected = keyed.filter((t) => !t.rls || t.policies.length === 0);
  for (const t of unprotected) errors.push(`${t.name} is keyed to a household (${t.householdKey}) but has no row-level security policy.`);
  const noGrant = c.tables.filter((t) => t.grants.length === 0);
  const health: HealthRow[] = [
    { label: "Every table is in a domain and described", ok: errors.length === 0, detail: `${c.tables.length} tables, ${c.enums.length} enums` },
    { label: "Every household-keyed table has row-level security and a policy", ok: unprotected.length === 0, detail: `${keyed.length - unprotected.length} of ${keyed.length}` },
    { label: "Row-level security is on for every table", ok: c.tables.every((t) => t.rls), detail: `${c.tables.filter((t) => t.rls).length} of ${c.tables.length}` },
    { label: "The schema declares every index the migrations create, and no other", ok: c.indexDrift.length === 0, detail: c.indexDrift.join(" ") || "they agree" },
    {
      label: "Household tables with no index that starts with their household key",
      ok: true,
      info: true,
      detail:
        keyed
          .filter((t) => !t.indexes.some((i) => i.columns[0] === t.householdKey) && !t.columns.some((x) => x.name === t.householdKey && (x.unique || x.primary)))
          .map((t) => `\`${t.name}\``)
          .join(", ") || "none",
    },
    {
      label: "Tables the request role cannot reach at all",
      ok: true,
      info: true,
      detail: noGrant.length ? noGrant.map((t) => `\`${t.name}\``).join(", ") + " (system role only)" : "none",
    },
    {
      label: "Foreign keys that delete children with their parent",
      ok: true,
      info: true,
      detail: c.tables.flatMap((t) => t.columns.filter((x) => x.references?.onDelete === "cascade").map((x) => `\`${t.name}.${x.name}\` → \`${x.references!.table}\``)).join(", ") || "none",
    },
  ];
  return { errors, health };
}
