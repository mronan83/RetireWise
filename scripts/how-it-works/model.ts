/**
 * "How RetireWise works": the calculations explained, checked against the
 * code that performs them.
 *
 * docs/HOW-IT-WORKS.md explains each calculation in words and formulas. The
 * figures it quotes are not typed: a {{key}} in the text is replaced by the
 * value the code holds, so a changed rate, limit or default changes the page.
 * validate() fails when the document stops matching the code:
 *
 * - a calculation module, or an exported function in one, it never names;
 * - a "- Code:" line naming a function that is not in the file it names;
 * - a "- Checked by:" line naming a check that CI does not run;
 * - a {{key}} the code does not supply, or a widget the page cannot draw;
 * - a file it names that does not exist.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { ciRunFiles } from "../traceability/model";
import { parseDoc, pathsIn, section, type Doc, type Entry } from "../pages/markdown";
import type { Engine } from "./bundle";

export const DOC_FILE = "docs/HOW-IT-WORKS.md";

/**
 * Modules that calculate something a household sees. Every exported function
 * in them must be named in the document, so a new calculation cannot ship
 * unexplained.
 */
export const CALCULATION_MODULES = [
  "src/lib/utils/projection-scenarios.ts",
  "src/lib/projections/settings.ts",
  "src/lib/projections/household.ts",
  "src/lib/projections/build-accounts.ts",
  "src/lib/projections/monte-carlo.ts",
  "src/lib/projections/at-retirement.ts",
  "src/lib/planning-inputs.ts",
  "src/lib/utils/salary-growth.ts",
  "src/lib/utils/contributions.ts",
  "src/lib/utils/glide-path.ts",
  "src/lib/utils/financial-analytics.ts",
  "src/lib/utils/withdrawal-strategies.ts",
  "src/lib/tax/table.ts",
  "src/lib/tax/load.ts",
  "src/lib/net-worth/compose.ts",
  "src/lib/performance/twr.ts",
  "src/lib/utils/cost-basis.ts",
  "src/lib/utils/calculations.ts",
  "src/lib/utils/dividends.ts",
  "src/lib/goals/progress.ts",
  "src/lib/utils/alert-generator.ts",
  "src/lib/utils/freshness.ts",
  "src/lib/plaid/backoff.ts",
];

/** Interactive pieces the page can place where a ```widget fence names them. */
export const WIDGETS = ["playground", "year", "ss-claiming", "tax", "rmd", "glide-path", "monte-carlo", "assumptions"] as const;

export type HowDoc = { doc: Doc; entries: Entry[]; log: { date: string; change: string; by: string }[] };

export function parseHowDoc(markdown: string): HowDoc {
  const doc = parseDoc(markdown);
  const log = (section(doc, "change log")?.blocks ?? [])
    .flatMap((b) => (b.kind === "ul" ? b.items.map((i) => i.text) : []))
    .map((line) => {
      const m = line.match(/^(\d{4}-\d{2}-\d{2})\s+·\s+(.+?)\s+·\s+([^·]+)$/);
      return m ? { date: m[1], change: m[2], by: m[3].trim() } : { date: "", change: line, by: "" };
    });
  return { doc, entries: doc.sections.flatMap((s) => s.entries), log };
}

/** Exported functions of a module, read from its source. */
export function exportedFunctions(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*(?::[^=]+)?=>/gm)) names.add(m[1]);
  return [...names];
}

/** Whether a name is declared in a module, exported or not. */
function declares(source: string, name: string): boolean {
  return new RegExp(`(?:function|const|let|class|type|interface)\\s+${name}\\b`).test(source);
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${Number(n.toFixed(2))}%`;

/**
 * Every figure the document may quote, read from the code. Keys are stable
 * names; values are formatted for reading.
 */
export function facts(e: Engine): Record<string, string> {
  const f: Record<string, string> = {};
  const run = e.simulate(e.EXAMPLE_INPUTS);
  const x = e.EXAMPLE_INPUTS;

  f["mc.simulations"] = String(run.odds.simulations);
  f["mc.seed"] = String(e.DEFAULT_SEED);
  f["horizon.years"] = String(e.PROJECTION_YEARS);
  f["rmd.start"] = String(e.RMD_START_AGE);
  for (const age of [73, 75, 80, 85, 90, 95, 100]) f[`rmd.divisor.${age}`] = (1_000_000 / e.calculateRMD(1_000_000, age)).toFixed(1);
  f["tax.year"] = String(e.BUILT_IN_TAX_YEAR);
  f["tax.deduction"] = money(e.DEFAULT_TAX_TABLE.standardDeduction);
  f["tax.brackets"] = e.DEFAULT_TAX_TABLE.brackets.map((b) => `${pct(b.rate * 100)}`).join(", ");
  f["tax.top"] = pct(e.DEFAULT_TAX_TABLE.brackets[e.DEFAULT_TAX_TABLE.brackets.length - 1].rate * 100);
  for (const s of e.MARKET_SCENARIOS) {
    f[`scenario.${s.id}.name`] = s.name;
    f[`scenario.${s.id}.return`] = pct(s.returnPct);
    f[`scenario.${s.id}.volatility`] = pct(s.volatility);
    f[`scenario.${s.id}.inflation`] = pct(s.inflationPct);
  }
  f["scenario.count"] = String(e.MARKET_SCENARIOS.length);
  for (const [k, v] of Object.entries(e.RETURN_BY_RISK)) f[`risk.${k}`] = pct(v);
  for (const [k, v] of Object.entries(e.RISK_PROFILES)) {
    f[`profile.${k}.stocks`] = pct(v.stockPct);
    f[`profile.${k}.return`] = pct(v.returnPct);
    f[`profile.${k}.volatility`] = pct(v.volatility);
  }
  for (const [k, v] of Object.entries(e.IRS_LIMITS)) {
    f[`irs.${k}.under50`] = money(v.under50);
    f[`irs.${k}.over50`] = money(v.over50);
    f[`irs.${k}.60to63`] = money(v.age60to63);
  }
  for (const age of [62, 63, 64, 65, 66, 67, 68, 69, 70]) f[`ss.at${age}`] = pct((e.adjustSSBenefit(1000, 67, age) / 1000) * 100);

  // Social Security's claiming rule, measured from the function itself.
  const share = (age: number) => e.adjustSSBenefit(1000, 67, age) / 1000;
  f["ss.early1"] = `${((1 - share(66)) * 100 / 12).toFixed(3)}%`;
  f["ss.early2"] = `${((share(64) - share(63)) * 100 / 12).toFixed(3)}%`;
  f["ss.delayed"] = pct((share(68) - 1) * 100);

  // Where Social Security starts to be taxed, found by probing the IRS worksheet in the code.
  // A modest benefit keeps the 85% band clear of the cap on the taxable share.
  const benefits = 20_000;
  const taxed = (other: number) => e.taxableSocialSecurity(benefits, other);
  const firstOther = (test: (o: number) => boolean, lo: number, hi: number) => {
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (test(mid)) hi = mid; else lo = mid; }
    return hi;
  };
  const t1 = firstOther((o) => taxed(o) > 0, 0, 200_000);
  const t2 = firstOther((o) => taxed(o + 1) - taxed(o) > 0.7, t1, t1 + 20_000);
  f["ss.taxFrom"] = money(t1 - 1 + benefits / 2);
  f["ss.tax85From"] = money(t2 + benefits / 2);
  f["ss.taxMax"] = pct((e.taxableSocialSecurity(benefits, 10_000_000) / benefits) * 100);
  f["ss.taxMid"] = pct(((taxed(t1 + 2_000) - taxed(t1 + 1_000)) / 1_000) * 100);

  const c = run.controls;
  f["default.retirementYears"] = String(e.controlsFromSaved(run.household, null).retirementYears);
  f["default.withdrawalRate"] = pct(e.controlsFromSaved(run.household, null).withdrawalRatePct);
  f["default.scenario"] = e.MARKET_SCENARIOS.find((s) => s.id === e.controlsFromSaved(run.household, null).scenarioId)?.name ?? "";

  f["example.age"] = String(x.age);
  f["example.partnerAge"] = String(x.partnerAge ?? "");
  f["example.retirementAge"] = String(x.retirementAge);
  f["example.salary"] = money(x.salary);
  f["example.spending"] = money(x.monthlySpending);
  f["example.savings"] = money(x.pretaxBalance + x.rothBalance + x.taxableBalance);
  f["example.scenario"] = run.inputs.scenario.name;
  f["example.horizon"] = String(c.retirementYears);
  f["example.success"] = `${run.odds.successRate}%`;
  f["example.atRetirement"] = money(run.balanceAtRetirement);
  f["example.medianAtRetirement"] = money(run.odds.medianAtRetirement);
  f["example.p10AtRetirement"] = money(run.odds.worstCase);
  f["example.p90AtRetirement"] = money(run.odds.bestCase);
  f["example.ssAnnual"] = money(run.inputs.combinedSSAnnual);
  f["example.depletion"] = run.depletionAge === null ? "never, within the horizon" : `at ${run.depletionAge}`;
  f["example.finalBalance"] = money(run.projection.totalValues[run.projection.totalValues.length - 1]);
  return f;
}

export type HowReport = { errors: string[]; coverage: { module: string; functions: string[]; missing: string[] }[] };

export function validate(h: HowDoc, values: Record<string, string>, root = process.cwd()): HowReport {
  const errors: string[] = [];
  const raw = readFileSync(join(root, DOC_FILE), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const prose = raw.replace(/^```[\s\S]*?^```\s*$/gm, (fence) => (/^```(widget|mermaid)/.test(fence) ? "" : fence));
  const ticked = new Set([...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]));

  if (!h.doc.lastReviewed) errors.push(`${DOC_FILE} has no "Last reviewed:" line.`);
  for (const p of new Set(pathsIn(raw))) if (!existsSync(join(root, p))) errors.push(`${DOC_FILE} names ${p}, which does not exist.`);

  // Figures come from the code.
  for (const m of raw.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) if (!(m[1] in values)) errors.push(`{{${m[1]}}} is not a figure the code supplies.`);

  // Widgets the page can draw.
  for (const m of raw.matchAll(/^```widget\s*\n\s*([\w-]+)\s*\n```/gm)) {
    if (!(WIDGETS as readonly string[]).includes(m[1])) errors.push(`Widget "${m[1]}" does not exist; use one of ${WIDGETS.join(", ")}.`);
  }

  // Each "Code:" line names functions that are where it says.
  const ci = ciRunFiles(root);
  for (const e of h.entries) {
    const code = e.fields.Code;
    if (code) {
      let file: string | null = null;
      for (const token of [...code.matchAll(/`([^`]+)`/g)].map((m) => m[1])) {
        if (/[/.]/.test(token) && /\.(ts|tsx)$/.test(token)) {
          file = token;
          continue;
        }
        if (!file) { errors.push(`"${e.title}" names ${token} before naming the file it is in.`); continue; }
        const path = join(root, file);
        if (!existsSync(path)) continue;
        if (!declares(readFileSync(path, "utf8"), token)) errors.push(`"${e.title}" says ${token} is in ${file}, and it is not.`);
      }
    }
    for (const p of pathsIn(e.fields["Checked by"] ?? "")) if (!ci.has(p)) errors.push(`"${e.title}" is checked by ${p}, which CI does not run.`);
  }

  // Every calculation module is named, and every function exported from one
  // has a row of its own in the code map.
  const mapped = new Set(codeMap(h).map((row) => row.fn));
  const coverage = CALCULATION_MODULES.filter((m) => existsSync(join(root, m))).map((module) => {
    const functions = exportedFunctions(readFileSync(join(root, module), "utf8"));
    const missing = functions.filter((fn) => !mapped.has(fn));
    if (!raw.includes(module)) errors.push(`${DOC_FILE} does not name the calculation module ${module}.`);
    for (const fn of missing) errors.push(`The code map has no row for ${fn} from ${module}.`);
    return { module, functions, missing };
  });
  const known = new Set(coverage.flatMap((c) => c.functions));
  for (const row of codeMap(h)) {
    if (!known.has(row.fn)) errors.push(`The code map lists ${row.fn}, which no calculation module exports.`);
    if (row.what.trim().length < 12) errors.push(`The code map says too little about ${row.fn}.`);
  }
  if (!ticked.size) errors.push(`${DOC_FILE} names no code at all.`);

  for (const l of h.log) if (!l.date) errors.push(`Change log line is not "- YYYY-MM-DD · what changed · who": ${l.change}`);
  return { errors, coverage };
}

/** The rows of the "## Code map" table: a function in backticks, then what it does. */
export function codeMap(h: HowDoc): { fn: string; what: string }[] {
  const table = section(h.doc, "code map")?.blocks.find((b) => b.kind === "table");
  return table && table.kind === "table" ? table.rows.map((r) => ({ fn: (r[0] ?? "").replace(/`/g, "").trim(), what: r[1] ?? "" })) : [];
}

/** The document with every {{key}} replaced by its figure. */
export function fillFacts(markdown: string, values: Record<string, string>): string {
  return markdown.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, key: string) => values[key] ?? whole);
}
