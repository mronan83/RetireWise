/**
 * Put a commit from main live in production, when someone asks for it.
 *
 * Merging does not deploy: vercel.json turns off Git auto-deploys for main,
 * so a merged change waits until this runs. That keeps "the code is ready"
 * and "ship it" as two separate decisions, and the second one belongs to a
 * person, not to whatever happened to merge.
 *
 * Before it deploys anything it checks that the commit is on origin/main and
 * that every CI check on it passed. It then builds that commit from Git
 * through the Vercel API, waits for the build, and confirms the production
 * domain now serves the new deployment and reports healthy. A failure at any
 * step stops it, and nothing already live is touched until a build succeeds.
 *
 * A passing failure — a dropped connection, a 5xx from Vercel or GitHub — is
 * retried rather than fatal (scripts/lib/release.ts). And running it again
 * after it stopped is safe: it follows a build of the same commit that is
 * already under way instead of starting a second one.
 *
 * Only after all of that does it build the published pages from the
 * released commit: the backlog, the requirements trace, the technical
 * architecture, the data model and how RetireWise works (.pages/backlog.html,
 * traceability.html, architecture.html, data-model.html, how-it-works.html),
 * so they always describe what is live.
 * Nothing builds them on a merge, a dry run, or a release that turns out to be
 * a no-op.
 *
 *   pnpm deploy:prod             # the tip of origin/main
 *   pnpm deploy:prod <sha>       # a specific commit on main (also a rollback)
 *   pnpm deploy:prod --dry-run   # every check, no deploy
 *
 * Needs VERCEL_TOKEN, and GITHUB_TOKEN or GH_TOKEN to read CI.
 */
import { execFileSync } from "child_process";
import { relative } from "path";
import { buildArchPage } from "./architecture/build";
import { buildBacklogPage } from "./backlog/build";
import { buildModelPage } from "./data-model/build";
import { buildHowPage } from "./how-it-works/build";
import { withSnapshot } from "./pages/snapshot";
import { buildTracePage } from "./traceability/build";
import { fetchWithRetry, findResumable, waitUntil, type ListedDeployment } from "./lib/release";

const REPO = "mronan83/RetireWise";
const TEAM_ID = "team_A8TfHlLyTc2toipq0WsMVKvK";
const PROJECT_ID = "prj_LVgkoqvGmYZCbsX10P9nmgBTdure";
const PRODUCTION_HOST = "retirewise-iota.vercel.app";

const BUILD_TIMEOUT_MS = 15 * 60 * 1000;
const ALIAS_TIMEOUT_MS = 90 * 1000;
const POLL_MS = 5000;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const requested = args.find((a) => !a.startsWith("--"));

/** The build this run started or is following, so a failure can say it may still finish. */
let inFlight: string | null = null;

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  if (inFlight) {
    console.error(
      `  The build ${inFlight} may still finish. Run pnpm deploy:prod again: it follows that build rather than starting another.`
    );
  }
  process.exit(1);
}

const retryNote = (what: string) => (attempt: number, reason: string) =>
  console.warn(`  … ${what}: ${reason}; retrying (${attempt})`);

function git(...gitArgs: string[]): string {
  return execFileSync("git", gitArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function vercel<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) fail("VERCEL_TOKEN is not set.");
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://api.vercel.com${path}${sep}teamId=${TEAM_ID}`;
  const request = { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
  // Reads are retried. Starting a build is not: a request that failed on the
  // way back may still have started one, and the next run will find it.
  let res: Response;
  try {
    res =
      (init.method ?? "GET") === "GET"
        ? await fetchWithRetry(url, request, { onRetry: retryNote(`Vercel ${path.split("?")[0]}`) })
        : await fetch(url, request);
  } catch (e) {
    fail(`Could not reach Vercel for ${init.method ?? "GET"} ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail(`Vercel ${init.method ?? "GET"} ${path} → ${res.status}: ${body?.error?.message ?? "no detail"}`);
  }
  return body as T;
}

type Deployment = {
  id: string;
  /** The list endpoint names the id `uid`. */
  uid?: string;
  url: string;
  readyState: string;
  errorMessage?: string;
  inspectorUrl?: string;
  meta?: { githubCommitSha?: string };
};

async function main() {
  // 1. The commit: on origin/main, or it does not ship.
  git("fetch", "--quiet", "origin", "main");
  let sha: string;
  try {
    sha = git("rev-parse", `${requested ?? "origin/main"}^{commit}`);
  } catch {
    fail(`${requested} is not a commit in this repository.`);
  }
  try {
    git("merge-base", "--is-ancestor", sha, "origin/main");
  } catch {
    fail(`${sha.slice(0, 7)} is not on origin/main. Only merged commits deploy.`);
  }
  console.log(`Commit   ${sha.slice(0, 7)}  ${git("log", "-1", "--format=%s", sha)}`);

  // 2. CI on that exact commit: every check finished, none failed.
  const ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!ghToken) fail("GITHUB_TOKEN or GH_TOKEN is needed to read CI.");
  const ciRes = await fetchWithRetry(
    `https://api.github.com/repos/${REPO}/commits/${sha}/check-runs`,
    { headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json" } },
    { onRetry: retryNote("GitHub check runs") }
  );
  const ci = await ciRes.json().catch(() => ({}));
  // An unreadable CI result is not an empty one; treating it as such would
  // report "no CI ran" when the token was simply refused.
  if (!ciRes.ok) fail(`Could not read CI from GitHub (${ciRes.status}): ${ci.message ?? "no detail"}`);
  const runs: { name: string; status: string; conclusion: string | null }[] = ci.check_runs ?? [];
  if (runs.length === 0) fail("No CI has run on this commit, so there is nothing to vouch for it.");
  const notGreen = runs.filter(
    (r) => r.status !== "completed" || !["success", "neutral", "skipped"].includes(r.conclusion ?? "")
  );
  if (notGreen.length > 0) {
    fail(`CI is not green: ${notGreen.map((r) => `${r.name} (${r.conclusion ?? r.status})`).join(", ")}`);
  }
  console.log(`CI       ${[...new Set(runs.map((r) => r.name))].join(", ")} — all passed`);

  // 3. What is live now, which is also what a rollback returns to: the build
  //    the production address actually serves. This used to read the latest
  //    finished production build instead, so a build the address never moved
  //    to counted as live, and a second run would report "Already live".
  const live = await vercel<Deployment>(`/v13/deployments/${PRODUCTION_HOST}`);
  const liveSha = live.meta?.githubCommitSha;
  console.log(`Live     ${liveSha?.slice(0, 7) ?? "unknown"}  (${live.id})`);
  if (liveSha === sha) {
    console.log("\n✓ Already live. Nothing to do.");
    return;
  }
  if (DRY_RUN) {
    console.log(`\nDry run: would deploy ${sha.slice(0, 7)} to ${PRODUCTION_HOST}.`);
    return;
  }

  // 4. Build it from Git. Production is only switched once this succeeds.
  //    A build of this commit already under way, from a run that stopped
  //    early, is followed rather than duplicated.
  const { deployments: recent } = await vercel<{ deployments: ListedDeployment[] }>(
    `/v6/deployments?projectId=${PROJECT_ID}&target=production&limit=20`
  );
  const resumable = findResumable(recent, sha);
  let created: Deployment;
  if (resumable) {
    created = await vercel<Deployment>(`/v13/deployments/${resumable.uid}`);
    console.log(`Resuming ${created.id}, a build of this commit already under way  https://${created.url}`);
  } else {
    const project = await vercel<{ name: string; link?: { repoId?: number } }>(`/v9/projects/${PROJECT_ID}`);
    if (!project.link?.repoId) fail("The Vercel project is not linked to a GitHub repo.");
    created = await vercel<Deployment>("/v13/deployments", {
      method: "POST",
      body: JSON.stringify({
        name: project.name,
        project: PROJECT_ID,
        target: "production",
        gitSource: { type: "github", repoId: project.link.repoId, ref: "main", sha },
      }),
    });
    console.log(`Building ${created.id}  https://${created.url}`);
  }
  inFlight = created.id;

  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  let d = created;
  while (!["READY", "ERROR", "CANCELED"].includes(d.readyState)) {
    if (Date.now() > deadline) fail(`Build still ${d.readyState} after 15 minutes: ${d.inspectorUrl ?? d.id}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
    d = await vercel<Deployment>(`/v13/deployments/${created.id}`);
  }
  if (d.readyState !== "READY") {
    fail(`Build ${d.readyState}: ${d.errorMessage ?? "see the build log"} ${d.inspectorUrl ?? ""}\nProduction was not changed.`);
  }

  // 5. The production domain serves the new build, and the app is healthy.
  //    Vercel moves the address a few seconds after the build is READY, so
  //    keep looking for a while before calling it a failure.
  let servedBy = live.id;
  const moved = await waitUntil(
    async () => {
      servedBy = (await vercel<Deployment>(`/v13/deployments/${PRODUCTION_HOST}`)).id;
      return servedBy === created.id;
    },
    { timeoutMs: ALIAS_TIMEOUT_MS, intervalMs: 3000 }
  );
  if (!moved) {
    fail(
      `Built, but ${PRODUCTION_HOST} still serves ${servedBy} after ${ALIAS_TIMEOUT_MS / 1000} seconds. ` +
        `Promote ${created.id} in Vercel, then run pnpm deploy:prod again to confirm it.`
    );
  }
  const health = await fetchWithRetry(
    `https://${PRODUCTION_HOST}/api/health`,
    { cache: "no-store" },
    { onRetry: retryNote("health check") }
  );
  const report = await health.json().catch(() => ({}));
  if (!health.ok || report.status !== "ok") {
    fail(
      `Live, but /api/health says ${report.status ?? health.status}: ${JSON.stringify(report.checks ?? {})}\n` +
        `Roll back with: pnpm deploy:prod ${liveSha ?? "<previous sha>"}`
    );
  }

  inFlight = null;
  console.log(`\n✓ ${sha.slice(0, 7)} is live on https://${PRODUCTION_HOST} and healthy.`);
  if (liveSha) console.log(`  Roll back with: pnpm deploy:prod ${liveSha.slice(0, 7)}`);

  // 6. The pages, now that there is a release for them to describe. The
  //    release has already succeeded, so a problem here is reported, not fatal.
  try {
    const page = buildBacklogPage({ sha, previousSha: liveSha });
    console.log(`  Backlog page: ${relative(process.cwd(), page)} (publish it to the RetireWise Backlog artifact)`);
  } catch (e) {
    console.warn(`  ⚠ Released, but the backlog page was not built: ${e instanceof Error ? e.message : String(e)}`);
  }
  // These read the code itself, so they are built from a copy of the
  // released commit rather than whatever happens to be checked out. The
  // traceability check reads the backlog, the CI workflow and the files the
  // requirements name; checked against a working tree that had moved on, it
  // reported problems the release did not have.
  try {
    await withSnapshot(sha, async (root) => {
      try {
        const { out, problems } = buildTracePage({ sha, previousSha: liveSha, root });
        console.log(`  Traceability page: ${relative(process.cwd(), out)} (publish it to the RetireWise Requirements & Feature Traceability artifact)`);
        if (problems.length) console.warn(`  ⚠ ${problems.length} trace problem(s) at this commit; run pnpm trace:check.`);
      } catch (e) {
        console.warn(`  ⚠ Released, but the traceability page was not built: ${e instanceof Error ? e.message : String(e)}`);
      }
      for (const [name, artifact, build] of [
        ["Architecture", "RetireWise Technical Architecture", buildArchPage],
        ["Data model", "RetireWise Data Model", buildModelPage],
        ["How it works", "How RetireWise Works", buildHowPage],
      ] as const) {
        try {
          const { out, problems } = await build({ sha, previousSha: liveSha, root });
          console.log(`  ${name} page: ${relative(process.cwd(), out)} (publish it to the ${artifact} artifact)`);
          if (problems.length) console.warn(`  ⚠ ${problems.length} ${name.toLowerCase()} problem(s) at this commit.`);
        } catch (e) {
          console.warn(`  ⚠ Released, but the ${name.toLowerCase()} page was not built: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    });
  } catch (e) {
    console.warn(`  ⚠ Released, but the pages read from the code were not built: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
