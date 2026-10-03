/**
 * Build the data model page.
 *
 * For a release, everything is read from the released commit: the document,
 * the schema and the migrations, through a snapshot of that commit, so the
 * page describes what is live even when something else is checked out.
 * Validation belongs to CI (`pnpm datamodel:check`); here a problem is shown
 * on the page but does not stop a release that has already happened.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { git, releaseChanges } from "../pages/release";
import { withSnapshot } from "../pages/snapshot";
import { DOC_FILE, introspect, parseModelDoc, validate } from "./model";
import { renderModelPage, type ModelRelease } from "./render";

export const MODEL_OUT = ".pages/data-model.html";

async function build(root: string, release: ModelRelease, out: string) {
  const model = parseModelDoc(readFileSync(join(root, DOC_FILE), "utf8"));
  const catalog = await introspect(root);
  const report = validate(model, catalog, root);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderModelPage(model, catalog, report, release));
  return { out, problems: report.errors };
}

/**
 * sha: build from that commit. Without one, build a preview from the working
 * tree, uncommitted edits included, for review before anything is committed.
 * root: an existing snapshot of sha to read from instead of making one.
 */
export async function buildModelPage(opts: { sha?: string; previousSha?: string; out?: string; preview?: boolean; root?: string }) {
  const out = resolve(opts.out ?? MODEL_OUT);
  const date = new Date().toISOString().slice(0, 10);
  if (!opts.sha) {
    const head = git("rev-parse", "HEAD");
    return build(process.cwd(), { sha: head, date, firstPublication: true, changes: [], preview: true }, out);
  }
  const sha = git("rev-parse", `${opts.sha}^{commit}`);
  const release: ModelRelease = { sha, date, preview: opts.preview, ...releaseChanges(DOC_FILE, sha, opts.previousSha) };
  return opts.root ? build(opts.root, release, out) : withSnapshot(sha, (root) => build(root, release, out));
}
