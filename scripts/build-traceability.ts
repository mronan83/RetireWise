/**
 * Check, preview or enforce the requirements traceability document.
 *
 *   pnpm trace:check
 *       Check docs/REQUIREMENTS.md against the repository as it is on disk:
 *       every named file exists, every "Verified" claim names a check CI runs,
 *       every page and API route belongs to a feature, every CI check traces
 *       to something, and the gaps agree with docs/BACKLOG.md. Runs in CI.
 *
 *   pnpm trace:build [--sha <commit>] [--previous <commit>] [--out <path>]
 *       Write the page for a commit (default HEAD). A local preview only: the
 *       published page is built by deploy:prod after a successful release.
 *
 *   tsx scripts/build-traceability.ts --require-update <base>
 *       For a pull request: fail if it changes anything under src/ without
 *       changing docs/REQUIREMENTS.md, unless a commit in the range carries a
 *       "Traceability: unchanged — <reason>" line. Runs in CI on pull requests.
 */
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { buildTracePage } from "./traceability/build";
import { parseTrace, validate } from "./traceability/model";
import { renderTracePage } from "./traceability/render";

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (args.includes("--check")) {
  const trace = parseTrace(readFileSync("docs/REQUIREMENTS.md", "utf8"));
  const report = validate(trace, process.cwd());
  if (report.errors.length > 0) {
    fail(`docs/REQUIREMENTS.md does not match the repository (${report.errors.length}):\n  ${report.errors.join("\n  ")}`);
  }
  renderTracePage(trace, report, { sha: "0000000", date: "", firstPublication: true, changes: [] });
  const reqs = trace.functional.length + trace.nonFunctional.length;
  console.log(
    `✓ docs/REQUIREMENTS.md: ${trace.objectives.length} objectives, ${reqs} requirements, ${trace.features.length} features, ${trace.gaps.length} gaps, ${trace.questions.length} questions; every trace checks out`
  );
} else if (option("--require-update")) {
  const base = option("--require-update")!;
  const changed = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
  const code = changed.filter((f) => f.startsWith("src/"));
  if (code.length === 0 || changed.includes("docs/REQUIREMENTS.md")) {
    console.log(`✓ Traceability: ${code.length === 0 ? "no app code changed" : "docs/REQUIREMENTS.md updated with the code"}`);
  } else {
    const messages = git("log", "--format=%B", `${base}..HEAD`);
    const waiver = messages.match(/^Traceability: unchanged\s*[—-]\s*(.+)$/m);
    if (waiver) console.log(`✓ Traceability: unchanged, because ${waiver[1].trim()}`);
    else
      fail(
        `This change touches app code (${code.slice(0, 5).join(", ")}${code.length > 5 ? ", …" : ""}) but not docs/REQUIREMENTS.md.\n` +
          `  Update the affected requirements, features and change log, or, if behaviour is truly unchanged,\n` +
          `  add a line to a commit message: "Traceability: unchanged — <why>".`
      );
  }
} else {
  try {
    const { out, problems } = buildTracePage({
      sha: option("--sha") ?? "HEAD",
      previousSha: option("--previous"),
      out: option("--out"),
      // Only deploy:prod builds the page a release publishes; this one is for review.
      preview: true,
    });
    console.log(`✓ Wrote ${out}`);
    if (problems.length) console.warn(`  ⚠ ${problems.length} trace problem(s); run pnpm trace:check.`);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}
