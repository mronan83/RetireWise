/**
 * Check or preview the backlog page.
 *
 *   pnpm backlog:check
 *       Parse docs/BACKLOG.md as it is on disk and fail on a malformed item.
 *       Runs in CI, so a broken backlog fails the PR rather than the release.
 *
 *   pnpm backlog:build [--sha <commit>] [--previous <commit>] [--out <path>]
 *       Write the page for a commit (default HEAD) to .pages/backlog.html.
 *       A local preview only: the published page is built by deploy:prod after
 *       a successful release, never after a merge.
 */
import { readFileSync } from "fs";
import { buildBacklogPage } from "./backlog/build";
import { parseBacklog, renderBacklogPage, validate } from "./backlog/render";

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

if (args.includes("--check")) {
  const backlog = parseBacklog(readFileSync("docs/BACKLOG.md", "utf8"));
  const errors = validate(backlog);
  if (errors.length > 0) {
    console.error(`✗ docs/BACKLOG.md is malformed:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  // Rendering too, so anything that would break the page breaks here first.
  renderBacklogPage(backlog, {
    sha: "0000000",
    date: "",
    firstPublication: true,
    rollback: false,
    commits: [],
    opened: [],
    closed: [],
  });
  console.log(`✓ docs/BACKLOG.md: ${backlog.open.length} open, ${backlog.done.length} done`);
} else {
  try {
    const out = buildBacklogPage({ sha: option("--sha") ?? "HEAD", previousSha: option("--previous"), out: option("--out") });
    console.log(`✓ Wrote ${out}`);
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
