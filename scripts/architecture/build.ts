/**
 * Build the technical architecture page.
 *
 * For a release, the document and the inventory are both read from the
 * released commit, through a snapshot of it, so the page describes what is
 * live. Validation belongs to CI (`pnpm arch:check`); here a problem is shown
 * on the page but does not stop a release that has already happened.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { git, releaseChanges } from "../pages/release";
import { withSnapshot } from "../pages/snapshot";
import { DOC_FILE, inventory, parseArchDoc, validate } from "./model";
import { renderArchPage, type ArchRelease } from "./render";

export const ARCH_OUT = ".pages/architecture.html";

function build(root: string, release: ArchRelease, out: string) {
  const arch = parseArchDoc(readFileSync(join(root, DOC_FILE), "utf8"));
  const inv = inventory(root);
  const report = validate(arch, inv, root);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderArchPage(arch, inv, report, release));
  return { out, problems: report.errors };
}

/**
 * sha: build from that commit. Without one, build a preview from the working
 * tree, uncommitted edits included. root: an existing snapshot of sha.
 */
export async function buildArchPage(opts: { sha?: string; previousSha?: string; out?: string; preview?: boolean; root?: string }) {
  const out = resolve(opts.out ?? ARCH_OUT);
  const date = new Date().toISOString().slice(0, 10);
  if (!opts.sha) return build(process.cwd(), { sha: git("rev-parse", "HEAD"), date, firstPublication: true, changes: [], preview: true }, out);
  const sha = git("rev-parse", `${opts.sha}^{commit}`);
  const release: ArchRelease = { sha, date, preview: opts.preview, ...releaseChanges(DOC_FILE, sha, opts.previousSha) };
  return opts.root ? build(opts.root, release, out) : withSnapshot(sha, (root) => build(root, release, out));
}
