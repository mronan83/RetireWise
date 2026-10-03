/**
 * The RetireWise technical architecture: half read from the code, half
 * written down.
 *
 * The inventory is read from the repository on every build: pages and API
 * routes (with the methods they export, whether the proxy guards them and
 * which household scope they enter), server action modules, scheduled jobs,
 * CI jobs, runtime dependencies, environment variable names and the modules
 * under src/lib. The principles, flows, decisions and risks are written in
 * docs/ARCHITECTURE.md. validate() fails when the document stops covering
 * the code: a dependency, environment variable, scheduled job, CI job, API
 * group or module it does not name, a file it names that is gone, a decision
 * record without evidence, or a risk tied to a backlog item that is closed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { parseBacklog } from "../backlog/render";
import { blockText, parseDoc, pathsIn, section, type Doc, type Entry } from "../pages/markdown";

export const DOC_FILE = "docs/ARCHITECTURE.md";

export type Session = "proxy" | "machine" | "own check" | "public";
export type RouteInfo = { path: string; file: string; methods: string[]; session: Session; scope: string[] };
export type PageInfo = { path: string; file: string; session: Session; scope: string[] };
export type Inventory = {
  pages: PageInfo[];
  apis: RouteInfo[];
  actions: { file: string; exports: string[] }[];
  crons: { path: string; schedule: string }[];
  ciJobs: { id: string; name: string; steps: string[] }[];
  dependencies: { name: string; version: string }[];
  envVars: { name: string; files: string[] }[];
  libModules: string[];
  migrations: number;
  tables: number;
};

const SCOPES = ["withHousehold", "withWriteHousehold", "withApiHousehold", "withApiWriteHousehold", "withTenant", "withSystemRole"];

function walk(dir: string, keep: (file: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, keep, out);
    else if (keep(full)) out.push(full);
  }
  return out;
}

/** src/app/(dashboard)/accounts/[id]/page.tsx → /accounts/[id] */
function routePath(file: string, root: string, name: string): string {
  const rel = relative(join(root, "src/app"), file).split("/").slice(0, -1);
  return "/" + rel.filter((seg) => !/^\(.*\)$/.test(seg)).join("/").replace(new RegExp(`/?${name}$`), "");
}

function stringArray(source: string, name: string): string[] {
  const m = source.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  return m ? [...m[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]) : [];
}

export function inventory(root = process.cwd()): Inventory {
  const read = (f: string) => readFileSync(f, "utf8");
  const proxy = existsSync(join(root, "src/proxy.ts")) ? read(join(root, "src/proxy.ts")) : "";
  const protectedPrefixes = stringArray(proxy, "PROTECTED_PREFIXES");
  const machinePrefixes = stringArray(proxy, "MACHINE_PREFIXES");
  // The proxy's own rule: the prefix itself, or anything below it.
  const under = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));
  const scopeOf = (src: string) => SCOPES.filter((s) => new RegExp(`\\b${s}\\b`).test(src));
  const sessionOf = (path: string, src: string): Session =>
    under(path, machinePrefixes)
      ? "machine"
      : under(path, protectedPrefixes)
        ? "proxy"
        : /\b(getApiUserId|requireUser|getUserId|withApi\w*Household|auth\(\)|getClaims)\b/.test(src)
          ? "own check"
          : "public";

  const app = join(root, "src/app");
  const pages = walk(app, (f) => /\/page\.tsx?$/.test(f))
    .map((f) => {
      const path = routePath(f, root, "page") || "/";
      const src = read(f);
      return { path: path === "" ? "/" : path, file: relative(root, f), session: sessionOf(path, src), scope: scopeOf(src) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const apis = walk(app, (f) => /\/route\.tsx?$/.test(f))
    .map((f) => {
      const path = routePath(f, root, "route");
      const src = read(f);
      const methods = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1]);
      return { path, file: relative(root, f), methods: [...new Set(methods)], session: sessionOf(path, src), scope: scopeOf(src) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const actionsDir = join(root, "src/lib/actions");
  const actions = (existsSync(actionsDir) ? readdirSync(actionsDir) : [])
    .filter((f) => /\.tsx?$/.test(f))
    .sort()
    .map((f) => ({
      file: `src/lib/actions/${f}`,
      exports: [...read(join(actionsDir, f)).matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]),
    }));

  const vercel = existsSync(join(root, "vercel.json")) ? JSON.parse(read(join(root, "vercel.json"))) : {};
  const crons = ((vercel.crons ?? []) as { path: string; schedule: string }[]).map((c) => ({ path: c.path, schedule: c.schedule }));

  const ciJobs: Inventory["ciJobs"] = [];
  const ciFile = join(root, ".github/workflows/ci.yml");
  if (existsSync(ciFile)) {
    const lines = read(ciFile).split("\n");
    let inJobs = false;
    let job: Inventory["ciJobs"][number] | null = null;
    for (const line of lines) {
      if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
      if (!inJobs) continue;
      if (/^\S/.test(line)) break;
      const id = line.match(/^ {2}([\w-]+):\s*$/);
      if (id) { job = { id: id[1], name: id[1], steps: [] }; ciJobs.push(job); continue; }
      const name = line.match(/^ {4}name:\s*(.+)$/);
      if (name && job) { job.name = name[1].trim().replace(/^["']|["']$/g, ""); continue; }
      const run = line.match(/^\s+(?:-\s+)?run:\s*(.+)$/);
      if (run && job && run[1].trim() !== "|") job.steps.push(run[1].trim());
    }
  }

  const pkg = JSON.parse(read(join(root, "package.json"))) as { dependencies?: Record<string, string> };
  const dependencies = Object.entries(pkg.dependencies ?? {}).map(([name, version]) => ({ name, version }));

  const env = new Map<string, Set<string>>();
  const codeFiles = [
    ...walk(join(root, "src"), (f) => /\.(ts|tsx|mjs)$/.test(f)),
    ...walk(join(root, "scripts"), (f) => /\.(ts|mjs)$/.test(f)),
    ...readdirSync(root).filter((f) => /\.config\.(ts|mjs|js)$/.test(f)).map((f) => join(root, f)),
  ];
  for (const f of codeFiles) {
    const src = read(f);
    for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g)) {
      const name = m[1] ?? m[2];
      if (name === "NODE_ENV") continue;
      const set = env.get(name) ?? new Set<string>();
      set.add(relative(root, f));
      env.set(name, set);
    }
  }
  const envVars = [...env].map(([name, files]) => ({ name, files: [...files].sort() })).sort((a, b) => a.name.localeCompare(b.name));

  const lib = join(root, "src/lib");
  const libModules = [...new Set((existsSync(lib) ? readdirSync(lib) : []).map((f) => f.replace(/\.tsx?$/, "")))].sort();
  const migrations = readdirSync(join(root, "src/lib/db/migrations")).filter((f) => f.endsWith(".sql")).length;
  const tables = (read(join(root, "src/lib/db/schema.ts")).match(/\bpgTable\(/g) ?? []).length;

  return { pages, apis, actions, crons, ciJobs, dependencies, envVars, libModules, migrations, tables };
}

// ---- the written half ---------------------------------------------------------

export type ArchDoc = {
  doc: Doc;
  decisions: (Entry & { id: string })[];
  risks: Entry[];
  flows: Entry[];
  log: { date: string; change: string; by: string }[];
};

export const ADR_STATUSES = ["Accepted", "Proposed", "Superseded", "Deprecated"];

export function parseArchDoc(markdown: string): ArchDoc {
  const doc = parseDoc(markdown);
  const decisions = (section(doc, "decision records")?.entries ?? []).map((e) => {
    const m = e.heading.match(/^(ADR-\d{3})\.?\s+(.+)$/);
    return { ...e, id: m ? m[1] : "", title: m ? m[2] : e.heading };
  });
  const log = (section(doc, "change log")?.blocks ?? [])
    .flatMap((b) => (b.kind === "ul" ? b.items.map((i) => i.text) : []))
    .map((line) => {
      const m = line.match(/^(\d{4}-\d{2}-\d{2})\s+·\s+(.+?)\s+·\s+([^·]+)$/);
      return m ? { date: m[1], change: m[2], by: m[3].trim() } : { date: "", change: line, by: "" };
    });
  return { doc, decisions, risks: section(doc, "risks")?.entries ?? [], flows: section(doc, "key flows")?.entries ?? [], log };
}

export type ArchReport = { errors: string[]; coverage: { label: string; total: number; named: number; missing: string[] }[] };

export function validate(a: ArchDoc, inv: Inventory, root = process.cwd()): ArchReport {
  const errors: string[] = [];
  const raw = readFileSync(join(root, DOC_FILE), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  // Inline code spans only: a fenced block's backticks would pair with the wrong ones.
  const prose = raw.replace(/^```[\s\S]*?^```\s*$/gm, "");
  const ticked = new Set([...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]));

  if (!a.doc.lastReviewed) errors.push(`${DOC_FILE} has no "Last reviewed:" line.`);
  for (const p of new Set(pathsIn(raw))) if (!existsSync(join(root, p))) errors.push(`${DOC_FILE} names ${p}, which does not exist.`);

  // What the document must name, so that new parts of the system cannot arrive unexplained.
  const groups = [...new Set(inv.apis.filter((r) => r.path.startsWith("/api/")).map((r) => r.path.split("/")[2]))].sort();
  const coverage = [
    { label: "Runtime dependencies", one: "runtime dependency", items: inv.dependencies.map((d) => d.name), named: (n: string) => ticked.has(n), how: "in backticks" },
    { label: "Environment variables", one: "environment variable", items: inv.envVars.map((e) => e.name), named: (n: string) => ticked.has(n), how: "in backticks" },
    { label: "Scheduled jobs", one: "scheduled job", items: inv.crons.map((c) => c.path), named: (n: string) => raw.includes(n), how: "by path" },
    { label: "CI jobs", one: "CI job", items: inv.ciJobs.map((j) => j.name), named: (n: string) => raw.includes(n), how: "by name" },
    { label: "API route groups", one: "API route group", items: groups.map((g) => `/api/${g}`), named: (n: string) => raw.includes(n), how: "as /api/<group>" },
    { label: "Modules under src/lib", one: "module", items: inv.libModules.map((m) => `src/lib/${m}`), named: (n: string) => new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\.tsx?)?\\b`).test(raw), how: "by path" },
  ].map((c) => {
    const missing = c.items.filter((i) => !c.named(i));
    for (const m of missing) errors.push(`${DOC_FILE} does not name the ${c.one} ${m} (${c.how}).`);
    return { label: c.label, total: c.items.length, named: c.items.length - missing.length, missing };
  });

  // Decision records.
  const ids = new Set<string>();
  for (const d of a.decisions) {
    if (!d.id) { errors.push(`Decision record "${d.heading}" needs an id: "### ADR-NNN. Title".`); continue; }
    if (ids.has(d.id)) errors.push(`${d.id} is used twice.`);
    ids.add(d.id);
    const status = (d.fields.Status ?? "").split(/\s/)[0];
    if (!ADR_STATUSES.includes(status)) errors.push(`${d.id} has status "${d.fields.Status ?? ""}"; use one of ${ADR_STATUSES.join(", ")}.`);
    for (const f of ["Decided", "Context", "Decision", "Consequences", "Evidence"]) if (!d.fields[f]) errors.push(`${d.id} has no "- ${f}:" line.`);
    if (d.fields.Evidence && pathsIn(d.fields.Evidence).length === 0) errors.push(`${d.id} names no file as evidence.`);
  }
  for (const d of a.decisions) {
    const by = (d.fields.Status ?? "").match(/by (ADR-\d{3})/);
    if ((d.fields.Status ?? "").startsWith("Superseded") && !by) errors.push(`${d.id} is Superseded but does not say by which record ("Superseded by ADR-NNN").`);
    if (by && !ids.has(by[1])) errors.push(`${d.id} is superseded by ${by[1]}, which does not exist.`);
  }

  // Risks name open backlog items.
  const backlogFile = join(root, "docs/BACKLOG.md");
  const backlog = existsSync(backlogFile) ? parseBacklog(readFileSync(backlogFile, "utf8")) : null;
  const open = new Set(backlog?.open.map((i) => i.num));
  const done = new Set(backlog?.done.map((i) => i.num));
  for (const r of a.risks) {
    const refs = [...(r.fields.Backlog ?? "").matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
    if (refs.length === 0) errors.push(`Risk "${r.title}" names no backlog item ("- Backlog: #N").`);
    for (const n of refs) {
      if (done.has(n)) errors.push(`Risk "${r.title}" names #${n}, which is done. Retire the risk or name what is still open.`);
      else if (!open.has(n)) errors.push(`Risk "${r.title}" names #${n}, which is not in docs/BACKLOG.md.`);
    }
  }

  // Every key flow is drawn.
  for (const f of a.flows) if (!f.blocks.some((b) => b.kind === "code" && b.lang === "mermaid")) errors.push(`Key flow "${f.title}" has no sequence diagram.`);
  for (const s of a.doc.sections) if (blockText(s.blocks).trim() === "" && s.entries.length === 0) errors.push(`Section "${s.name}" is empty.`);

  for (const l of a.log) if (!l.date) errors.push(`Change log line is not "- YYYY-MM-DD · what changed · who": ${l.change}`);
  return { errors, coverage: coverage.map(({ label, total, named, missing }) => ({ label, total, named, missing })) };
}
