/**
 * A release survives a passing failure, and a second run follows the first
 * run's build instead of starting another.
 *
 * No network: the fetch below replays a scripted sequence of responses and
 * failures, and the sleep records the waits instead of taking them.
 */
import { fetchWithRetry, findResumable, RETRY_DELAYS_MS, type ListedDeployment } from "./lib/release";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

/** A fetch that plays back `script`: a number is a response status, a string is a thrown error. */
function scripted(script: (number | string)[]) {
  let calls = 0;
  const waits: number[] = [];
  const fetch = async () => {
    const step = script[Math.min(calls++, script.length - 1)];
    if (typeof step === "string") throw new TypeError(step);
    return new Response(null, { status: step });
  };
  const sleep = async (ms: number) => {
    waits.push(ms);
  };
  return { fetch, sleep, calls: () => calls, waits };
}

/** The response, or the error it raised, so a failure is reported as a failure rather than a crash. */
const attempt = (p: Promise<Response>) => p.catch((e: unknown) => e as Error);
const status = (r: Response | Error) => (r instanceof Response ? r.status : r.message);

async function main() {
  // ---- retries --------------------------------------------------------------
  {
    const s = scripted(["fetch failed", "fetch failed", 200]);
    const res = await attempt(fetchWithRetry("x", {}, s));
    check("a dropped connection is retried until the request gets through", status(res) === 200 && s.calls() === 3, `${status(res)} after ${s.calls()}`);
    check("waiting longer each time", s.waits.join(",") === "2000,4000", s.waits.join(","));
  }
  {
    const s = scripted([502, 200]);
    const res = await attempt(fetchWithRetry("x", {}, s));
    check("a 502 from the API is retried", status(res) === 200 && s.calls() === 2, `${status(res)} after ${s.calls()}`);
  }
  {
    const s = scripted([429, 200]);
    const res = await attempt(fetchWithRetry("x", {}, s));
    check("so is being rate limited", status(res) === 200 && s.calls() === 2);
  }
  {
    const s = scripted([404, 200]);
    const res = await attempt(fetchWithRetry("x", {}, s));
    check("a 4xx is the request's own fault and returns at once", status(res) === 404 && s.calls() === 1, `${status(res)} after ${s.calls()}`);
  }
  {
    const s = scripted([503]);
    const res = await attempt(fetchWithRetry("x", {}, s));
    check(
      "a server that stays down is tried five times, then its answer is returned",
      status(res) === 503 && s.calls() === RETRY_DELAYS_MS.length + 1,
      `${status(res)} after ${s.calls()}`
    );
  }
  {
    const s = scripted(["fetch failed"]);
    let thrown = "";
    try {
      await fetchWithRetry("x", {}, s);
    } catch (e) {
      thrown = (e as Error).message;
    }
    check("a network that stays down raises its error after the last try", thrown === "fetch failed" && s.calls() === 5, `${thrown} after ${s.calls()}`);
  }

  // ---- resuming -------------------------------------------------------------
  const sha = "5eac1e346300ad34ea4e0d56837242e11d43e8d5";
  const list: ListedDeployment[] = [
    { uid: "dpl_other", state: "BUILDING", createdAt: 300, meta: { githubCommitSha: "c1b0b0a" } },
    { uid: "dpl_failed", state: "ERROR", createdAt: 250, meta: { githubCommitSha: sha } },
    { uid: "dpl_older", state: "CANCELED", createdAt: 100, meta: { githubCommitSha: sha } },
    { uid: "dpl_running", state: "BUILDING", createdAt: 200, meta: { githubCommitSha: sha } },
  ];
  check("a second run follows the build of the same commit already running", findResumable(list, sha)?.uid === "dpl_running", findResumable(list, sha)?.uid);
  check(
    "never a build of another commit, or one that failed or was cancelled",
    findResumable(list.filter((d) => d.uid !== "dpl_running"), sha) === undefined
  );
  check(
    "and of two live builds, the newer",
    findResumable([...list, { uid: "dpl_newer", state: "QUEUED", createdAt: 400, meta: { githubCommitSha: sha } }], sha)?.uid === "dpl_newer"
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

main().then((f) => process.exit(f === 0 ? 0 : 1));
