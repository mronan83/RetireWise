/**
 * What the published pages share about a release: the document as it was at
 * a commit, and which change-log lines are new since the release before.
 */
import { execFileSync } from "child_process";

export function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function fileAt(sha: string, path: string): string | null {
  try {
    return execFileSync("git", ["show", `${sha}:${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

/** The lines of a "## Change log" list. */
export function changeLog(markdown: string): string[] {
  const at = markdown.search(/^## Change log/m);
  if (at === -1) return [];
  return markdown
    .slice(at)
    .split("\n")
    .slice(1)
    .filter((l) => /^- /.test(l))
    .map((l) => l.slice(2).trim());
}

/**
 * Compare the document at sha with the one at previousSha. firstPublication
 * means there is nothing to compare with: no earlier release, or the document
 * did not exist then.
 */
export function releaseChanges(path: string, sha: string, previousSha?: string): { previousSha?: string; firstPublication: boolean; changes: string[] } {
  if (!previousSha) return { firstPublication: true, changes: [] };
  try {
    const previous = git("rev-parse", `${previousSha}^{commit}`);
    if (previous === sha) return { previousSha: previous, firstPublication: false, changes: [] };
    const before = fileAt(previous, path);
    const after = fileAt(sha, path);
    if (before === null || after === null) return { previousSha: previous, firstPublication: true, changes: [] };
    const seen = new Set(changeLog(before));
    return {
      previousSha: previous,
      firstPublication: false,
      changes: changeLog(after)
        .filter((l) => !seen.has(l))
        .map((l) => l.replace(/^(\d{4}-\d{2}-\d{2})\s+·\s+(.+?)\s+·\s+[^·]+$/, "$2")),
    };
  } catch {
    // The release it replaced is not in this clone; the page says only what is live.
    return { firstPublication: true, changes: [] };
  }
}
