/**
 * A copy of the repository as it was at one commit, for pages that read the
 * code itself (the schema, the routes, the workflows) rather than only a
 * document. The release that a page describes is not always what is checked
 * out, so the page is built from the commit, never from the working tree.
 *
 * The copy sits under .pages/ inside the repository so that the schema it
 * imports still resolves drizzle-orm from the repository's node_modules.
 */
import { execFileSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import { resolve } from "path";

export async function withSnapshot<T>(sha: string, fn: (root: string) => Promise<T> | T): Promise<T> {
  const root = resolve(".pages", `.src-${sha.slice(0, 12)}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  try {
    const tar = execFileSync("git", ["archive", "--format=tar", sha], { maxBuffer: 256 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", root], { input: tar });
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
