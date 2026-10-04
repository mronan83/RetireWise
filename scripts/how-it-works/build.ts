/**
 * Build the "How RetireWise works" page.
 *
 * For a release, the document and the engine are both taken from a snapshot
 * of the released commit, so the explanations, the figures and the
 * calculators all describe what is live. Validation belongs to CI
 * (`pnpm how:check`); here a problem is shown on the page but does not stop a
 * release that has already happened.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { git, releaseChanges } from "../pages/release";
import { withSnapshot } from "../pages/snapshot";
import { bundleEngine, loadEngine } from "./bundle";
import { DOC_FILE, facts, parseHowDoc, validate } from "./model";
import { renderHowPage, type HowRelease } from "./render";

export const HOW_OUT = ".pages/how-it-works.html";

async function build(root: string, release: HowRelease, out: string) {
  const markdown = readFileSync(join(root, DOC_FILE), "utf8");
  const engine = await loadEngine(root);
  const values = facts(engine, root);
  const report = validate(parseHowDoc(markdown), values, root);
  const engineJs = await bundleEngine(root, "browser");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderHowPage(markdown, values, engine, engineJs, report, release));
  return { out, problems: report.errors };
}

/**
 * sha: build from that commit. Without one, build a preview from the working
 * tree, uncommitted edits included. root: an existing snapshot of sha.
 */
export async function buildHowPage(opts: { sha?: string; previousSha?: string; out?: string; preview?: boolean; root?: string }) {
  const out = resolve(opts.out ?? HOW_OUT);
  const date = new Date().toISOString().slice(0, 10);
  if (!opts.sha) return build(process.cwd(), { sha: git("rev-parse", "HEAD"), date, firstPublication: true, changes: [], preview: true }, out);
  const sha = git("rev-parse", `${opts.sha}^{commit}`);
  const release: HowRelease = { sha, date, preview: opts.preview, ...releaseChanges(DOC_FILE, sha, opts.previousSha) };
  return opts.root ? build(opts.root, release, out) : withSnapshot(sha, (root) => build(root, release, out));
}
