/**
 * Check, preview or enforce "How RetireWise works".
 *
 *   pnpm how:check
 *       Check docs/HOW-IT-WORKS.md against the code on disk: every
 *       calculation module is named and every function it exports has a row
 *       in the code map; every "Code:" line names functions that are where it
 *       says; every "Checked by:" names a check CI runs; every {{figure}} is
 *       one the code supplies; every widget exists. It also bundles the
 *       engine and runs the example household, so a page that would not work
 *       fails here first. Runs in CI.
 *
 *   pnpm how:build [--sha <commit>] [--previous <commit>] [--out <path>] [--live <commit>]
 *       Write the page. Without --sha it is a preview of the working tree.
 *       The published page is built by deploy:prod after a successful release.
 *       --live names the commit in production, to publish ahead of a release;
 *       it refuses unless the app code at --sha is identical to it.
 *
 *   tsx scripts/build-how-it-works.ts --require-update <base>
 *       For a pull request: fail if it changes a calculation module or the
 *       page's engine entry without changing docs/HOW-IT-WORKS.md, unless a
 *       commit in the range carries a "How it works: unchanged — <reason>"
 *       line. Runs in CI.
 */
import { readFileSync } from "fs";
import { buildHowPage } from "./how-it-works/build";
import { bundleEngine, ENTRY, loadEngine } from "./how-it-works/bundle";
import { CALCULATION_MODULES, DOC_FILE, facts, parseHowDoc, validate } from "./how-it-works/model";
import { renderHowPage } from "./how-it-works/render";
import { git } from "./pages/release";

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  if (args.includes("--check")) {
    const markdown = readFileSync(DOC_FILE, "utf8");
    const engine = await loadEngine(process.cwd());
    const values = facts(engine, process.cwd());
    const h = parseHowDoc(markdown);
    const report = validate(h, values);
    if (report.errors.length > 0) fail(`${DOC_FILE} does not match the code (${report.errors.length}):\n  ${report.errors.join("\n  ")}`);
    const js = await bundleEngine(process.cwd(), "browser");
    renderHowPage(markdown, values, engine, js, report, { sha: "0000000", date: "", firstPublication: true, changes: [] });
    const fns = report.coverage.reduce((n, c) => n + c.functions.length, 0);
    console.log(
      `✓ ${DOC_FILE}: ${h.entries.length} calculations explained, all ${fns} functions in ${report.coverage.length} modules mapped, ${Object.keys(values).length} figures from the code; the example household runs (${values["example.success"]} of markets last)`
    );
  } else if (option("--require-update")) {
    const base = option("--require-update")!;
    const changed = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
    const calc = changed.filter((f) => CALCULATION_MODULES.includes(f) || f === ENTRY);
    if (calc.length === 0 || changed.includes(DOC_FILE)) {
      console.log(`✓ How it works: ${calc.length === 0 ? "no calculation changed" : `${DOC_FILE} updated with it`}`);
    } else {
      const waiver = git("log", "--format=%B", `${base}..HEAD`).match(/^How it works: unchanged\s*[—-]\s*(.+)$/m);
      if (waiver) console.log(`✓ How it works: unchanged, because ${waiver[1].trim()}`);
      else
        fail(
          `This change touches a calculation (${calc.slice(0, 5).join(", ")}${calc.length > 5 ? ", …" : ""}) but not ${DOC_FILE}.\n` +
            `  Update the explanation, formula or code map it affects and add a change-log line, or, if what the\n` +
            `  calculation does is truly unchanged, add a line to a commit message: "How it works: unchanged — <why>".`
        );
    }
  } else {
    const live = option("--live");
    if (live && !option("--sha")) fail("--live needs --sha: the commit whose explanation is published.");
    const { out, problems } = await buildHowPage({ sha: option("--sha"), previousSha: option("--previous"), out: option("--out"), preview: !live, liveSha: live });
    console.log(`✓ Wrote ${out}`);
    if (problems.length) console.warn(`  ⚠ ${problems.length} problem(s); run pnpm how:check.`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
