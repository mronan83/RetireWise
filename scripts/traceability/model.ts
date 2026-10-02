/**
 * docs/REQUIREMENTS.md: parsing and the checks that keep it true.
 *
 * The document states what RetireWise is required to do and traces each
 * requirement to the features that deliver it and the code and checks that
 * prove them. A trace is only worth having if it is right, so validate()
 * checks it against the repository itself: every named file must exist, a
 * "Verified" claim must name a check that CI actually runs, every page and
 * API route must belong to a feature, every CI check must trace to
 * something, and the gaps here must agree with docs/BACKLOG.md.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parseBacklog } from "../backlog/render";

export const STATUSES = ["Verified", "Implemented", "Partial", "Planned", "Deferred"] as const;
export const PRIORITIES = ["Must", "Should", "Could"] as const;
export const SEVERITIES = ["High", "Medium", "Low"] as const;
export type Status = (typeof STATUSES)[number];

export type Block = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export interface Entry {
  id: string;
  title: string;
  fields: Record<string, string>;
  body: Block[];
}

export interface Area {
  code: string;
  kind: "FR" | "NFR";
  name: string;
}

export interface LogEntry {
  date: string;
  change: string;
  by: string;
}

export interface Trace {
  title: string;
  lastReviewed: string;
  intro: Block[];
  method: Block[];
  areas: Area[];
  objectives: Entry[];
  functional: Entry[];
  nonFunctional: Entry[];
  features: Entry[];
  gaps: Entry[];
  questions: Entry[];
  log: LogEntry[];
  sources: string[];
}

const ID = {
  objective: /^BO-\d+$/,
  functional: /^FR-[A-Z]+-\d{2}$/,
  nonFunctional: /^NFR-[A-Z]+-\d{2}$/,
  feature: /^F-\d{2}$/,
  gap: /^GAP-\d{2}$/,
  question: /^Q\d+$/,
};
/** Any ID this document defines, wherever it appears in prose or fields. */
export const ID_IN_TEXT = /\b(BO-\d+|NFR-[A-Z]+-\d{2}|FR-[A-Z]+-\d{2}|F-\d{2}|GAP-\d{2}|Q\d+)\b/g;
/** A backticked token that names a repository file or directory. */
const PATH_IN_TEXT = /`((?:src|scripts|e2e|docs|\.github|public)\/[^`\s:]+|[A-Za-z0-9_.-]+\.(?:json|md|ts|mjs|yml))(?::\d+(?:-\d+)?)?`/g;

// ── Parsing ──────────────────────────────────────────────────────────────────

export function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    if (buf.every((l) => l.startsWith("- "))) blocks.push({ kind: "ul", items: buf.map((l) => l.slice(2).trim()) });
    else blocks.push({ kind: "p", text: buf.join(" ").trim() });
    buf = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") flush();
    else {
      // A list may follow a paragraph without a blank line ("The shortfalls:" then "- …").
      if (buf.length && line.startsWith("- ") !== buf[buf.length - 1].startsWith("- ")) flush();
      buf.push(line);
    }
  }
  flush();
  return blocks;
}

function toEntry(heading: string, lines: string[]): Entry {
  const m = heading.match(/^###\s+([A-Z]+(?:-[A-Z]+)?-?\d+)\.\s+(.+)$/);
  if (!m) throw new Error(`Not an entry heading: "${heading}" (expected "### ID. Title")`);
  const blocks = toBlocks(lines);
  const fields: Record<string, string> = {};
  const first = blocks[0];
  if (first?.kind === "ul" && first.items.every((i) => /^[A-Z][A-Za-z ]+:/.test(i))) {
    for (const item of first.items) {
      const at = item.indexOf(":");
      fields[item.slice(0, at).trim()] = item.slice(at + 1).trim();
    }
    blocks.shift();
  }
  return { id: m[1], title: m[2].trim(), fields, body: blocks };
}

type Section = "intro" | "method" | "areas" | "objectives" | "functional" | "nonFunctional" | "features" | "gaps" | "questions" | "log" | "sources" | "other";

function sectionFor(name: string): Section {
  const n = name.toLowerCase();
  if (n.startsWith("how this document works")) return "method";
  if (n.startsWith("areas")) return "areas";
  if (n.startsWith("business objectives")) return "objectives";
  if (n.startsWith("functional")) return "functional";
  if (n.startsWith("non-functional")) return "nonFunctional";
  if (n.startsWith("features")) return "features";
  if (n.startsWith("gaps")) return "gaps";
  if (n.startsWith("open questions")) return "questions";
  if (n.startsWith("change log")) return "log";
  if (n.startsWith("sources")) return "sources";
  return "other";
}

export function parseTrace(markdown: string): Trace {
  const text = markdown.replace(/<!--[\s\S]*?-->/g, "");
  const t: Trace = {
    title: "Requirements",
    lastReviewed: "",
    intro: [],
    method: [],
    areas: [],
    objectives: [],
    functional: [],
    nonFunctional: [],
    features: [],
    gaps: [],
    questions: [],
    log: [],
    sources: [],
  };
  const loose: Record<Section, string[]> = {
    intro: [], method: [], areas: [], objectives: [], functional: [], nonFunctional: [],
    features: [], gaps: [], questions: [], log: [], sources: [], other: [],
  };
  let section: Section = "intro";
  let head: string | null = null;
  let lines: string[] = [];
  const close = () => {
    if (head === null) return;
    const e = toEntry(head, lines);
    const into: Partial<Record<Section, Entry[]>> = {
      objectives: t.objectives, functional: t.functional, nonFunctional: t.nonFunctional,
      features: t.features, gaps: t.gaps, questions: t.questions,
    };
    into[section]?.push(e);
    head = null;
    lines = [];
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("# ")) t.title = line.slice(2).trim();
    else if (line.startsWith("## ")) {
      close();
      section = sectionFor(line.slice(3).trim());
    } else if (line.startsWith("### ")) {
      close();
      head = line.trim();
    } else if (head !== null) lines.push(line);
    else {
      const reviewed = section === "intro" && line.match(/^Last reviewed:\s*(.+)$/);
      if (reviewed) t.lastReviewed = reviewed[1].trim();
      else loose[section].push(line);
    }
  }
  close();
  t.intro = toBlocks(loose.intro);
  t.method = toBlocks(loose.method);
  for (const l of loose.areas) {
    const m = l.match(/^-\s+(FR|NFR)-([A-Z]+):\s*(.+)$/);
    if (m) t.areas.push({ kind: m[1] as "FR" | "NFR", code: m[2], name: m[3].trim() });
  }
  for (const l of loose.log) {
    const m = l.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+·\s+(.+?)\s+·\s+([^·]+)$/);
    if (m) t.log.push({ date: m[1], change: m[2].trim(), by: m[3].trim() });
  }
  t.sources = loose.sources.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());
  return t;
}

// ── Helpers shared with the renderer ─────────────────────────────────────────

export const list = (v: string | undefined): string[] =>
  (v ?? "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s && !/^none\b/i.test(s));

export const idsIn = (s: string | undefined): string[] => [...(s ?? "").matchAll(ID_IN_TEXT)].map((m) => m[1]);
export const pathsIn = (s: string | undefined): string[] => [...(s ?? "").matchAll(PATH_IN_TEXT)].map((m) => m[1]);
export const backlogIn = (s: string | undefined): number[] =>
  [...(s ?? "").matchAll(/(?:^|[\s(,;])#(\d+)\b/g)].map((m) => Number(m[1]));
export const statusOf = (e: Entry): string => (e.fields.Status ?? "").split(/\s/)[0];
export const areaOf = (id: string): string => id.split("-")[1];

/**
 * Files whose failure fails CI: scripts named in ci.yml, pnpm scripts it runs,
 * and e2e specs if it runs them. Seed scripts set CI up rather than check
 * anything, so they are left out.
 */
export function ciRunFiles(root: string): Set<string> {
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
  const files = new Set<string>();
  for (const m of ci.matchAll(/\b(scripts\/[\w./-]+\.ts)\b/g)) files.add(m[1]);
  for (const m of ci.matchAll(/\bpnpm\s+(?:run\s+)?([\w:-]+)/g)) {
    const cmd = pkg.scripts[m[1]];
    if (!cmd) continue;
    for (const f of cmd.matchAll(/\b(scripts\/[\w./-]+\.ts)\b/g)) files.add(f[1]);
    if (/playwright test/.test(cmd)) {
      for (const spec of readdirSync(join(root, "e2e")).filter((f) => f.endsWith(".spec.ts"))) files.add(`e2e/${spec}`);
    }
  }
  for (const f of [...files]) if (/^scripts\/seed-/.test(f)) files.delete(f);
  return files;
}

function walk(dir: string, name: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, name, out);
    else if (entry === name) out.push(full);
  }
  return out;
}

/** Every page and API route a user or another system can reach. */
export function surfaces(root: string): string[] {
  const rel = (p: string) => p.slice(root.length + 1).split("\\").join("/");
  return [...walk(join(root, "src/app"), "page.tsx"), ...walk(join(root, "src/app/api"), "route.ts")].map(rel).sort();
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface Report {
  errors: string[];
  /** Facts the page shows rather than failures: they are allowed, but visible. */
  featuresWithoutRequirement: string[];
}

export function validate(t: Trace, root: string): Report {
  const errors: string[] = [];
  const all = [...t.objectives, ...t.functional, ...t.nonFunctional, ...t.features, ...t.gaps, ...t.questions];
  const ids = new Set<string>();
  for (const e of all) {
    if (ids.has(e.id)) errors.push(`${e.id} is defined twice.`);
    ids.add(e.id);
  }
  const shape = (entries: Entry[], re: RegExp, what: string) =>
    entries.forEach((e) => re.test(e.id) || errors.push(`${e.id} is in ${what} but is not shaped like one.`));
  shape(t.objectives, ID.objective, "Business objectives");
  shape(t.functional, ID.functional, "Functional requirements");
  shape(t.nonFunctional, ID.nonFunctional, "Non-functional requirements");
  shape(t.features, ID.feature, "Features");
  shape(t.gaps, ID.gap, "Gaps");
  shape(t.questions, ID.question, "Open questions");

  const areaCodes = new Set(t.areas.map((a) => `${a.kind}-${a.code}`));
  for (const e of [...t.functional, ...t.nonFunctional]) {
    const kind = e.id.startsWith("NFR") ? "NFR" : "FR";
    if (!areaCodes.has(`${kind}-${areaOf(e.id)}`)) errors.push(`${e.id} uses area ${areaOf(e.id)}, which is not listed under Areas.`);
  }

  // Every reference resolves, except in the change log, which records history.
  for (const o of t.objectives) {
    const served = list(o.fields["Served by"]);
    if (served.length === 0) errors.push(`${o.id} names nothing that serves it.`);
    for (const s of served) {
      if (/^(FR|NFR)-[A-Z]+$/.test(s) && !areaCodes.has(s)) errors.push(`${o.id} is served by ${s}, which is not an area.`);
    }
  }
  const everything = JSON.stringify([t.intro, t.method, all.map((e) => [e.fields, e.body, e.title])]);
  for (const id of new Set(idsIn(everything))) {
    if (!ids.has(id) && !/^(FR|NFR)-[A-Z]+$/.test(id)) errors.push(`${id} is referenced but not defined.`);
  }

  // Every named file exists.
  for (const e of all) {
    for (const [key, value] of Object.entries(e.fields)) {
      for (const p of pathsIn(value)) {
        if (!existsSync(join(root, p))) errors.push(`${e.id} ${key} names ${p}, which does not exist.`);
      }
    }
  }

  const enums = (e: Entry, key: string, allowed: readonly string[], value = e.fields[key]) => {
    if (!value) errors.push(`${e.id} has no ${key}.`);
    else if (!allowed.includes(value)) errors.push(`${e.id} has ${key} "${value}"; expected ${allowed.join(", ")}.`);
  };

  // Statuses say what the repository can prove.
  const ci = ciRunFiles(root);
  const backlog = parseBacklog(readFileSync(join(root, "docs/BACKLOG.md"), "utf8"));
  const backlogOpen = new Set(backlog.open.map((i) => i.num));
  const backlogDone = new Set(backlog.done.map((i) => i.num));
  const checkStatus = (e: Entry, checksKey: string) => {
    const status = statusOf(e);
    enums(e, "Status", STATUSES, status);
    const checks = pathsIn(e.fields[checksKey]);
    const inCi = checks.filter((p) => ci.has(p));
    if (status === "Verified" && inCi.length === 0) {
      errors.push(`${e.id} is Verified, but none of its ${checksKey} runs in CI. Name a CI check, or mark it Implemented.`);
    }
    if (status === "Implemented" && inCi.length > 0) {
      errors.push(`${e.id} is Implemented, but ${inCi.join(", ")} runs in CI. Mark it Verified.`);
    }
    if (status === "Partial" && backlogIn(e.fields.Backlog).length === 0 && idsIn(e.fields.Gap).length === 0) {
      errors.push(`${e.id} is Partial but names no backlog item or gap for the shortfall.`);
    }
    for (const n of backlogIn(e.fields.Backlog)) {
      if (!backlogOpen.has(n) && !backlogDone.has(n)) errors.push(`${e.id} names backlog #${n}, which does not exist.`);
    }
  };
  const featureIds = new Set(t.features.map((f) => f.id));
  for (const r of t.functional) {
    enums(r, "Priority", PRIORITIES);
    checkStatus(r, "Verified by");
    const status = statusOf(r);
    const feats = idsIn(r.fields.Features).filter((id) => featureIds.has(id));
    if (r.fields.Priority === "Must" && !["Planned", "Deferred"].includes(status) && feats.length === 0) {
      errors.push(`${r.id} is a Must that is built, but names no feature.`);
    }
    if (!r.fields.Source) errors.push(`${r.id} has no Source.`);
  }
  for (const r of t.nonFunctional) {
    enums(r, "Priority", PRIORITIES);
    checkStatus(r, "Verified by");
    if (!r.fields["Enforced by"] && !["Planned", "Deferred"].includes(statusOf(r))) errors.push(`${r.id} has no "Enforced by".`);
    if (!r.fields.Source) errors.push(`${r.id} has no Source.`);
  }
  const reqIds = new Set([...t.functional, ...t.nonFunctional].map((r) => r.id));
  const featuresWithoutRequirement: string[] = [];
  for (const f of t.features) {
    checkStatus(f, "Checks");
    if (!f.fields.Group) errors.push(`${f.id} has no Group.`);
    if (!idsIn(f.fields.Requirements).some((id) => reqIds.has(id))) featuresWithoutRequirement.push(f.id);
    if (!["Planned", "Deferred"].includes(statusOf(f)) && pathsIn(f.fields.Code).length === 0) {
      errors.push(`${f.id} is built but names no Code.`);
    }
  }
  // Requirements and features name each other consistently.
  for (const r of t.functional) {
    for (const fid of idsIn(r.fields.Features)) {
      const f = t.features.find((x) => x.id === fid);
      if (f && !idsIn(f.fields.Requirements).includes(r.id)) errors.push(`${r.id} names ${fid}, but ${fid} does not name ${r.id}.`);
    }
  }
  for (const f of t.features) {
    for (const rid of idsIn(f.fields.Requirements).filter((id) => id.startsWith("FR-"))) {
      const r = t.functional.find((x) => x.id === rid);
      if (r && !idsIn(r.fields.Features).includes(f.id)) errors.push(`${f.id} names ${rid}, but ${rid} does not name ${f.id}.`);
    }
  }

  // Gaps agree with the backlog.
  for (const g of t.gaps) {
    enums(g, "Severity", SEVERITIES);
    const status = g.fields.Status ?? "";
    if (!/^(Open|Closed \d{4}-\d{2}-\d{2})$/.test(status)) errors.push(`${g.id} needs Status: Open, or Closed YYYY-MM-DD.`);
    const items = backlogIn(g.fields.Backlog);
    if (items.length === 0) errors.push(`${g.id} names no backlog item. Every gap is also a backlog item.`);
    for (const n of items) {
      if (status === "Open" && !backlogOpen.has(n)) errors.push(`${g.id} is open, but backlog #${n} is ${backlogDone.has(n) ? "done" : "missing"}.`);
      if (status.startsWith("Closed") && !backlogDone.has(n)) errors.push(`${g.id} is closed, but backlog #${n} is ${backlogOpen.has(n) ? "still open" : "missing"}.`);
    }
    if (idsIn(g.fields.Affects).length === 0) errors.push(`${g.id} names nothing it affects.`);
  }

  for (const q of t.questions) {
    const s = q.fields.Status ?? "";
    if (!/^(Open|Answered \d{4}-\d{2}-\d{2})$/.test(s)) errors.push(`${q.id} needs Status: Open, or Answered YYYY-MM-DD.`);
    if (s.startsWith("Answered") && !q.body.some((b) => b.kind === "p" && b.text.startsWith("**Answer"))) {
      errors.push(`${q.id} is answered, but has no **Answer** paragraph.`);
    }
  }

  // Completeness: every page and route belongs to a feature, and every CI check traces to something.
  const coded = new Set(t.features.flatMap((f) => pathsIn(f.fields.Code)));
  for (const s of surfaces(root)) if (!coded.has(s)) errors.push(`${s} is not in any feature's Code.`);
  const traced = new Set(
    [...t.functional, ...t.nonFunctional].flatMap((r) => pathsIn(r.fields["Verified by"])).concat(t.features.flatMap((f) => pathsIn(f.fields.Checks)))
  );
  for (const c of ci) if (!traced.has(c)) errors.push(`${c} runs in CI but no requirement or feature names it.`);

  if (!t.lastReviewed) errors.push(`The document has no "Last reviewed:" line.`);
  if (t.log.length === 0) errors.push(`The change log is empty.`);
  return { errors: [...new Set(errors)], featuresWithoutRequirement };
}
