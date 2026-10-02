/**
 * Build the backlog page for a release.
 *
 * Reads docs/BACKLOG.md as it was at the commit going live, not as it is on
 * disk, so the page describes production even when the working tree is ahead.
 * Compared with the backlog at the commit it replaced, that also yields what
 * the release opened and closed.
 */
import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { parseBacklog, renderBacklogPage, validate, type Release } from "./render";

const FILE = "docs/BACKLOG.md";
export const DEFAULT_OUT = ".backlog/backlog.html";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function backlogAt(sha: string): string | null {
  try {
    return execFileSync("git", ["show", `${sha}:${FILE}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

function isAncestor(a: string, b: string): boolean {
  try {
    git("merge-base", "--is-ancestor", a, b);
    return true;
  } catch {
    return false;
  }
}

/** Writes the page and returns its absolute path. Throws if the backlog is missing or malformed. */
export function buildBacklogPage(opts: { sha: string; previousSha?: string; out?: string }): string {
  const sha = git("rev-parse", `${opts.sha}^{commit}`);
  const markdown = backlogAt(sha);
  if (markdown === null) throw new Error(`${FILE} does not exist at ${sha.slice(0, 7)}.`);
  const backlog = parseBacklog(markdown);
  const errors = validate(backlog);
  if (errors.length > 0) throw new Error(`${FILE} at ${sha.slice(0, 7)} is malformed:\n  ${errors.join("\n  ")}`);

  const release: Release = {
    sha,
    date: new Date().toISOString().slice(0, 10),
    firstPublication: true,
    rollback: false,
    commits: [],
    opened: [],
    closed: [],
  };

  if (opts.previousSha) {
    let previous: string | null = null;
    try {
      previous = git("rev-parse", `${opts.previousSha}^{commit}`);
    } catch {
      // The commit it replaced is not in this clone; the page says only what is live.
    }
    if (previous && previous !== sha) {
      release.previousSha = previous;
      release.rollback = isAncestor(sha, previous);
      if (!release.rollback) {
        release.commits = git("log", "--format=%H%x09%s", `${previous}..${sha}`)
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [full, ...subject] = line.split("\t");
            return { sha: full, subject: subject.join("\t") };
          });
      }
      const before = backlogAt(previous);
      if (before !== null) {
        release.firstPublication = false;
        if (!release.rollback) {
          const old = parseBacklog(before);
          const wasOpen = new Set(old.open.map((i) => i.num));
          const existed = new Set([...old.open, ...old.done].map((i) => i.num));
          release.opened = backlog.open.map((i) => i.num).filter((n) => !existed.has(n));
          release.closed = backlog.done.map((i) => i.num).filter((n) => wasOpen.has(n));
        }
      }
    }
  }

  const out = resolve(opts.out ?? DEFAULT_OUT);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderBacklogPage(backlog, release));
  return out;
}
