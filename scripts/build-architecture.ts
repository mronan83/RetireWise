/**
 * Check, preview or enforce the technical architecture document.
 *
 *   pnpm arch:check
 *       Check docs/ARCHITECTURE.md against the code on disk: it names every
 *       runtime dependency, environment variable, scheduled job, CI job, API
 *       route group and module under src/lib; every file it names exists;
 *       every decision record has its fields and evidence; every risk names
 *       an open backlog item; every key flow is drawn. Runs in CI.
 *
 *   pnpm arch:build [--sha <commit>] [--previous <commit>] [--out <path>]
 *       Write the page. Without --sha it is a preview of the working tree.
 *       The published page is built by deploy:prod after a successful release.
 *
 *   tsx scripts/build-architecture.ts --require-update <base>
 *       For a pull request: fail if it changes the shape of the system (a
 *       dependency, configuration, the CI workflow, the proxy, tenancy or
 *       auth code, a page or route added or removed, a new module) without
 *       changing docs/ARCHITECTURE.md, unless a commit in the range carries an
 *       "Architecture: unchanged — <reason>" line. Runs in CI.
 */
import { readFileSync } from "fs";
import { buildArchPage } from "./architecture/build";
import { DOC_FILE, inventory, parseArchDoc, validate } from "./architecture/model";
import { renderArchPage } from "./architecture/render";
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

/** Files whose change alters the shape of the system, whatever the edit. */
const SHAPE_FILES = [
  "package.json",
  "vercel.json",
  "next.config.ts",
  "drizzle.config.ts",
  ".env.example",
  "src/proxy.ts",
  "src/lib/db/index.ts",
  "src/lib/db/tenant.ts",
  "src/lib/auth.ts",
  "src/lib/auth-helpers.ts",
  "scripts/deploy-production.ts",
];

async function main() {
  if (args.includes("--check")) {
    const arch = parseArchDoc(readFileSync(DOC_FILE, "utf8"));
    const inv = inventory();
    const report = validate(arch, inv);
    if (report.errors.length > 0) fail(`${DOC_FILE} does not match the code (${report.errors.length}):\n  ${report.errors.join("\n  ")}`);
    renderArchPage(arch, inv, report, { sha: "0000000", date: "", firstPublication: true, changes: [] });
    console.log(
      `✓ ${DOC_FILE}: ${arch.decisions.length} decision records, ${arch.flows.length} key flows, ${arch.risks.length} risks; names all ${inv.dependencies.length} dependencies, ${inv.envVars.length} environment variables, ${inv.crons.length} jobs and ${inv.libModules.length} modules`
    );
  } else if (option("--require-update")) {
    const base = option("--require-update")!;
    const status = git("diff", "--name-status", `${base}...HEAD`).split("\n").filter(Boolean).map((l) => l.split("\t"));
    const changed = status.map((s) => s[s.length - 1]);
    const shape = status.filter(alters(base)).map((s) => s[s.length - 1]);
    if (shape.length === 0 || changed.includes(DOC_FILE)) {
      console.log(`✓ Architecture: ${shape.length === 0 ? "nothing that shapes the system changed" : `${DOC_FILE} updated with it`}`);
    } else {
      const waiver = git("log", "--format=%B", `${base}..HEAD`).match(/^Architecture: unchanged\s*[—-]\s*(.+)$/m);
      if (waiver) console.log(`✓ Architecture: unchanged, because ${waiver[1].trim()}`);
      else
        fail(
          `This change alters the shape of the system (${shape.slice(0, 5).join(", ")}${shape.length > 5 ? ", …" : ""}) but not ${DOC_FILE}.\n` +
            `  Update the sections it affects and add a change-log line (a decision record if a choice was made), or,\n` +
            `  if the architecture is truly unchanged, add a line to a commit message: "Architecture: unchanged — <why>".`
        );
    }
  } else {
    const { out, problems } = await buildArchPage({ sha: option("--sha"), previousSha: option("--previous"), out: option("--out"), preview: true });
    console.log(`✓ Wrote ${out}`);
    if (problems.length) console.warn(`  ⚠ ${problems.length} problem(s); run pnpm arch:check.`);
  }
}

/**
 * Whether one line of `git diff --name-status` changes the shape of the
 * system: a file in SHAPE_FILES or the workflows, whatever the edit; or a
 * page, route, layout or top-level module that appears, disappears or moves.
 * Editing inside an existing module is ordinary work, not a change of shape.
 */
function alters(base: string) {
  const exists = (ref: string, dir: string) => {
    try {
      return git("ls-tree", "--name-only", ref, dir).length > 0;
    } catch {
      return false;
    }
  };
  return ([status, ...paths]: string[]): boolean => {
    const path = paths[paths.length - 1];
    if (SHAPE_FILES.includes(path) || path.startsWith(".github/workflows/")) return true;
    if (!/^[ADR]/.test(status)) return false;
    if (/^src\/app\/(.*\/)?(page|route|layout)\.tsx?$/.test(path) || /^src\/lib\/[^/]+\.tsx?$/.test(path)) return true;
    const dir = path.match(/^src\/lib\/[^/]+\//)?.[0];
    return dir ? !exists(base, dir) || !exists("HEAD", dir) : false;
  };
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
