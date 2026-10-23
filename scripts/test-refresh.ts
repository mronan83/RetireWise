/**
 * Pull to refresh, as numbers. The gesture itself is driven in a browser by
 * e2e/refresh.spec.ts; this pins the thresholds it relies on.
 */
import { PULL_MAX, PULL_THRESHOLD, pullState } from "../src/lib/utils/pull-to-refresh";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

check("no pull, nothing shown", pullState(0).offset === 0 && !pullState(0).ready);
check("an upward move is no pull", pullState(-50).offset === 0 && !pullState(-50).ready);
check("the indicator moves at half the finger's speed", pullState(60).offset === 30);
check("a short pull does not refresh", !pullState(PULL_THRESHOLD * 2 - 1).ready);
check("a pull past the threshold refreshes on release", pullState(PULL_THRESHOLD * 2).ready);
check("progress fills as the threshold nears", pullState(PULL_THRESHOLD).progress === 0.5 && pullState(PULL_THRESHOLD * 2).progress === 1);
check("the indicator stops at its limit however far the finger goes", pullState(10_000).offset === PULL_MAX);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
