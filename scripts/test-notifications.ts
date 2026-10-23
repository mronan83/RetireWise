/**
 * What RetireWise notifies about, and when (Q11). Pure rules; delivery
 * against a database is scripts/test-notification-delivery.ts.
 */
import {
  NOTIFICATION_KINDS,
  WITHDRAWAL_NOTIFY_AT,
  deadlinesDue,
  isOperator,
  kindsFor,
  messages,
  withdrawalsToNotify,
} from "../src/lib/notifications/kinds";
import { allowedKinds, parseSubscription } from "../src/lib/notifications/devices";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

// ---- who may choose what ----------------------------------------------------
check("seven kinds, as the owner answered Q11", NOTIFICATION_KINDS.length === 7);
check("a household member gets six; a failed job is the operator's alone", kindsFor(false).length === 6 && !kindsFor(false).includes("jobs"));
check("the operator gets all seven", kindsFor(true).length === 7);
check("the operator is named by email, in any case", isOperator(" Owner@Example.com", "owner@example.com"));
check("nobody is the operator when none is named", !isOperator("owner@example.com", undefined) && !isOperator(null, "a@b.c"));
check("turning on with no choice takes every allowed kind", allowedKinds(undefined, false).length === 6);
check("a kind someone may not have is dropped", allowedKinds(["jobs", "goals", "nonsense"], false).join() === "goals");
check("an empty choice is kept as nothing, not everything", allowedKinds([], true).length === 0);
check("a subscription without an https push address is refused", parseSubscription({ endpoint: "http://x", keys: { p256dh: "a", auth: "b" } }) === null);
check("one with its keys is accepted", parseSubscription({ endpoint: "https://web.push.apple.com/x", keys: { p256dh: "a", auth: "b" } }) !== null);

// ---- withdrawals ------------------------------------------------------------
const today = "2026-10-23";
const rows = [
  { id: "big", type: "withdrawal", amount: 1_000, date: "2026-10-22" },
  { id: "negative-sign", type: "withdrawal", amount: -2_500, date: "2026-10-23" },
  { id: "small", type: "withdrawal", amount: 999.99, date: "2026-10-22" },
  { id: "old", type: "withdrawal", amount: 50_000, date: "2025-01-02" },
  { id: "contribution", type: "contribution", amount: 5_000, date: "2026-10-22" },
  { id: "future", type: "withdrawal", amount: 5_000, date: "2026-10-30" },
];
const picked = withdrawalsToNotify(rows, today).map((r) => r.id).join();
check("withdrawals at or above the threshold, recent, of either sign, notify", picked === "big,negative-sign", picked);
check("the threshold is the owner's $1,000", WITHDRAWAL_NOTIFY_AT === 1_000);

// ---- yearly deadlines -------------------------------------------------------
const keys = (d: string, ages: (number | null)[]) => deadlinesDue(d, ages).map((x) => x.key).join();
check("nothing due in midsummer", keys("2026-07-01", [60]) === "");
check("the IRA reminder runs from 1 April to the 15th", keys("2026-04-01", [60]) === "ira:2026" && keys("2026-04-15", [60]) === "ira:2026" && keys("2026-04-16", [60]) === "");
check("the 401(k) reminder in December", keys("2026-12-02", [60]) === "401k:2026");
check("required distributions only once someone is 73", keys("2026-11-20", [60, 70]) === "" && keys("2026-11-20", [60, 73]) === "rmd:2026");
check("both in December for a household with someone 73 or older", keys("2026-12-10", [74, null]) === "401k:2026,rmd:2026");

// ---- messages: safe on a lock screen ----------------------------------------
const all = [
  messages.reconnect("Fidelity"),
  messages.alert("large_daily_move"),
  messages.alert("allocation_drift"),
  messages.goal("Emergency fund"),
  messages.household(),
  messages.withdrawal("Joint Brokerage"),
  messages.job("weekday snapshot"),
  ...deadlinesDue("2026-12-10", [74]).map((d) => d.message),
];
const amounts = all.flatMap((m) => [m.title, m.body]).filter((t) => /\$\d/.test(t.replace("$1,000", "")) || /\d+(\.\d+)?%/.test(t.replace("25%", "")));
check("no message carries an amount or a percentage move", amounts.length === 0, amounts.join(" | "));
check("every message opens a page in the app", all.every((m) => m.url.startsWith("/")));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
