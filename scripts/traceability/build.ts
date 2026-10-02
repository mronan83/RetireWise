/**
 * Build the traceability page for a release.
 *
 * Like the backlog page, it reads docs/REQUIREMENTS.md as it was at the
 * released commit and compares it with the commit that release replaced, so
 * the page can say which requirements, features, gaps and questions moved.
 * Validation belongs to CI (`pnpm trace:check`); here a problem is reported
 * on the page's behalf but does not stop a release that has already happened.
 */
import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { parseTrace, statusOf, validate, type Entry, type Trace } from "./model";
import { renderTracePage, type TraceRelease } from "./render";

const FILE = "docs/REQUIREMENTS.md";
export const TRACE_OUT = ".pages/traceability.html";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function docAt(sha: string): string | null {
  try {
    return execFileSync("git", ["show", `${sha}:${FILE}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

function entries(t: Trace): Map<string, Entry> {
  return new Map(
    [...t.objectives, ...t.functional, ...t.nonFunctional, ...t.features, ...t.gaps, ...t.questions].map((e) => [e.id, e])
  );
}

/** What moved between two versions of the document, as lines the page can show. */
export function diffTrace(before: Trace, after: Trace): string[] {
  const a = entries(before);
  const b = entries(after);
  const out: string[] = [];
  for (const [id, e] of b) {
    const old = a.get(id);
    const state = (x: Entry) => (x.fields.Status ?? "").trim();
    if (!old) out.push(`Added ${id}: ${e.title}`);
    else if (state(old) !== state(e)) out.push(`${id}: ${statusOf(old) || state(old)} → ${state(e)}`);
    else if (old.title !== e.title) out.push(`${id} reworded: ${e.title}`);
  }
  for (const id of a.keys()) if (!b.has(id)) out.push(`Removed ${id}`);
  return out;
}

export function buildTracePage(opts: { sha: string; previousSha?: string; out?: string; root?: string }): {
  out: string;
  problems: string[];
} {
  const sha = git("rev-parse", `${opts.sha}^{commit}`);
  const markdown = docAt(sha);
  if (markdown === null) throw new Error(`${FILE} does not exist at ${sha.slice(0, 7)}.`);
  const trace = parseTrace(markdown);
  const report = validate(trace, opts.root ?? process.cwd());

  const release: TraceRelease = { sha, date: new Date().toISOString().slice(0, 10), firstPublication: true, changes: [] };
  if (opts.previousSha) {
    try {
      const previous = git("rev-parse", `${opts.previousSha}^{commit}`);
      if (previous !== sha) {
        release.previousSha = previous;
        const before = docAt(previous);
        if (before !== null) {
          release.firstPublication = false;
          release.changes = diffTrace(parseTrace(before), trace);
        }
      }
    } catch {
      // The commit it replaced is not in this clone; the page says only what is live.
    }
  }

  const out = resolve(opts.out ?? TRACE_OUT);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderTracePage(trace, report, release));
  return { out, problems: report.errors };
}
