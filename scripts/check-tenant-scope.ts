/**
 * A ratchet for row-level-security coverage.
 *
 * Tenant scoping is applied one entry point at a time (see
 * src/lib/db/tenant.ts). A file that has not been converted still works — it
 * just keeps the old unprotected behaviour — which makes this exactly the kind
 * of migration that stalls silently at eighty percent.
 *
 * So the unconverted files are listed, and the list may only shrink. A new
 * entry point that touches the database without declaring its scope fails the
 * build; converting one and forgetting to update the list also fails, which
 * keeps the number honest.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SCOPERS = [
  "withHousehold",
  "withWriteHousehold",
  "withApiHousehold",
  "withApiWriteHousehold",
  "withSystemRole",
];

/** Files that reach the database without a declared tenant scope, yet. */
const UNSCOPED_BASELINE = new Set<string>(
  readFileSync("scripts/tenant-scope-baseline.txt", "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const ENTRY_DIRS = ["src/app/api", "src/app/(dashboard)", "src/lib/actions"];

const entryPoints = ENTRY_DIRS.flatMap((d) => walk(d)).filter((f) => {
  if (f.includes("/actions/")) return true;
  return f.endsWith("/route.ts") || f.endsWith("/page.tsx");
});

const unscoped: string[] = [];
const scoped: string[] = [];

for (const file of entryPoints) {
  const src = readFileSync(file, "utf8");
  // Only files that actually reach the database are in scope for this check.
  if (!/\bgetDb\s*\(|from "@\/lib\/queries|from "\.\.\/queries/.test(src)) continue;
  if (SCOPERS.some((s) => src.includes(s))) scoped.push(file);
  else unscoped.push(file);
}

let failures = 0;

const newlyUnscoped = unscoped.filter((f) => !UNSCOPED_BASELINE.has(f));
for (const f of newlyUnscoped) {
  console.error(`NEW UNSCOPED  ${f}`);
  console.error("  Reaches the database without declaring a tenant scope.");
  console.error(`  Wrap it in one of: ${SCOPERS.join(", ")}`);
  failures++;
}

const staleBaseline = [...UNSCOPED_BASELINE].filter((f) => scoped.includes(f));
for (const f of staleBaseline) {
  console.error(`STALE BASELINE  ${f}`);
  console.error("  This file is scoped now — remove it from scripts/tenant-scope-baseline.txt");
  failures++;
}

const gone = [...UNSCOPED_BASELINE].filter(
  (f) => !scoped.includes(f) && !unscoped.includes(f)
);
for (const f of gone) {
  console.error(`GONE  ${f}`);
  console.error("  Listed in the baseline but no longer an entry point — remove it.");
  failures++;
}

const total = scoped.length + unscoped.length;
console.log(
  `\nTenant scope: ${scoped.length}/${total} entry points converted, ` +
    `${unscoped.length} remaining.`
);

process.exit(failures === 0 ? 0 : 1);
