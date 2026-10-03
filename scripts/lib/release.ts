/**
 * The parts of a release that can be proved without a network: how a passing
 * failure is retried, and which build a second run follows instead of
 * starting another.
 *
 * Twice on 2 Oct 2026 a release stopped on a single bad response — a 502 from
 * Vercel's API, then a dropped connection while polling — after the build it
 * was watching had already started. Production was never at risk, but the
 * script could not finish, and running it again would have started a second
 * build of the same commit.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Waits between attempts: four retries over about half a minute. */
export const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000];

/**
 * fetch, retried when the failure is the network's or the server's rather
 * than the request's: a thrown error (a reset connection, "fetch failed"),
 * 429, or any 5xx. A 4xx is the request's own fault and comes back at once.
 *
 * Only for requests that are safe to repeat. Starting a build is not: a
 * request that failed on the way back may still have started one.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: {
    fetch?: FetchLike;
    delaysMs?: number[];
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, reason: string) => void;
  } = {}
): Promise<Response> {
  const doFetch = opts.fetch ?? fetch;
  const delays = opts.delaysMs ?? RETRY_DELAYS_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 0; ; attempt++) {
    const last = attempt >= delays.length;
    let reason = "";
    try {
      const res = await doFetch(url, init);
      if (res.status !== 429 && res.status < 500) return res;
      if (last) return res;
      reason = `HTTP ${res.status}`;
    } catch (e) {
      if (last) throw e;
      reason = e instanceof Error ? e.message : String(e);
    }
    opts.onRetry?.(attempt + 1, reason);
    await sleep(delays[attempt]);
  }
}

/** A production deployment as Vercel's list endpoint returns it. */
export type ListedDeployment = {
  uid: string;
  state?: string;
  readyState?: string;
  createdAt?: number;
  meta?: { githubCommitSha?: string };
};

/**
 * A production build of this commit that is queued, running or finished: the
 * one a second run should follow rather than start another beside it.
 */
export function findResumable(deployments: ListedDeployment[], sha: string): ListedDeployment | undefined {
  const alive = ["QUEUED", "INITIALIZING", "BUILDING", "READY"];
  return deployments
    .filter((d) => d.meta?.githubCommitSha === sha && alive.includes(d.state ?? d.readyState ?? ""))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

/**
 * Check `condition` until it holds or `timeoutMs` passes; true if it held.
 *
 * Vercel moves the production address to a new build a few seconds after the
 * build reports READY. On 3 Oct 2026 the release checked once, in that gap,
 * and reported a failure for a release that had in fact gone live.
 */
export async function waitUntil(
  condition: () => Promise<boolean>,
  opts: {
    timeoutMs: number;
    intervalMs: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  }
): Promise<boolean> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const deadline = now() + opts.timeoutMs;
  for (;;) {
    if (await condition()) return true;
    if (now() + opts.intervalMs > deadline) return false;
    await sleep(opts.intervalMs);
  }
}
