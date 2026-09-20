/**
 * Every signed-in page must be listed in the proxy.
 *
 * A page under (dashboard) that is missing from PROTECTED_PREFIXES is still
 * reachable signed out. It then calls getAuthContext(), which throws, and the
 * visitor gets a 500 instead of a sign-in redirect — as /onboarding did, in
 * production, having passed every check that existed at the time.
 *
 * The suite missed it because demo mode bypasses the proxy entirely, so the
 * browser tests exercise those routes only as a signed-in user. This closes
 * the gap statically, which is cheaper than closing it with a browser.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = "src/app/(dashboard)";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

/** "src/app/(dashboard)/net-worth/page.tsx" -> "/net-worth" */
function routeFor(file: string): string {
  const rel = file.slice(ROOT.length).replace(/\/page\.tsx$/, "");
  return rel === "" ? "/" : rel;
}

const proxy = readFileSync("src/proxy.ts", "utf8");
const block = proxy.match(/const PROTECTED_PREFIXES = \[([\s\S]*?)\];/);
if (!block) {
  console.error("Could not find PROTECTED_PREFIXES in src/proxy.ts");
  process.exit(1);
}
const prefixes = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const routes = walk(ROOT).map(routeFor);
const covered = (route: string) =>
  prefixes.some((p) => route === p || route.startsWith(`${p}/`));

// A dynamic segment is covered by its parent, so only top-level ones matter.
const topLevel = [...new Set(routes.map((r) => "/" + r.split("/")[1]))];
const unprotected = topLevel.filter((r) => !covered(r));

for (const route of unprotected) {
  console.error(`UNPROTECTED  ${route}`);
  console.error("  Reachable signed out, and will answer 500 rather than redirect.");
  console.error("  Add it to PROTECTED_PREFIXES in src/proxy.ts.");
}

console.log(
  `\nProtected routes: ${topLevel.length - unprotected.length}/${topLevel.length} signed-in pages covered.`
);
process.exit(unprotected.length === 0 ? 0 : 1);
