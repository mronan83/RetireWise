/**
 * Bundle the engine entry from a source tree, for Node or for the browser.
 *
 * esbuild resolves every import, the `@/` alias included, against the tree it
 * is given, so a snapshot of a released commit bundles that commit's code and
 * nothing from whatever happens to be checked out.
 */
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { join, resolve } from "path";

export const ENTRY = "scripts/how-it-works/engine-entry.ts";
export type Engine = typeof import("./engine-entry");

export async function bundleEngine(root: string, platform: "node" | "browser"): Promise<string> {
  const result = await build({
    entryPoints: [join(root, ENTRY)],
    absWorkingDir: root,
    tsconfig: join(root, "tsconfig.json"),
    bundle: true,
    write: false,
    platform,
    format: platform === "node" ? "cjs" : "iife",
    globalName: platform === "browser" ? "RetireWiseEngine" : undefined,
    target: "es2020",
    minify: platform === "browser",
    legalComments: "none",
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

/** The engine, loaded in this process from the given tree. */
export async function loadEngine(root: string): Promise<Engine> {
  const code = await bundleEngine(root, "node");
  const dir = resolve(".pages");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `.engine-${process.pid}-${Date.now()}.cjs`);
  writeFileSync(file, code);
  try {
    return createRequire(file)(file) as Engine;
  } finally {
    rmSync(file, { force: true });
  }
}
