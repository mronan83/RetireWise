/**
 * Push notification delivery against a real database: each event once, to
 * the right household's devices, of the kinds they chose, and a device the
 * push service has dropped removed. The push service itself is replaced by
 * a recorder, so nothing leaves the machine.
 */
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getBaseDb } from "../src/lib/db";
import { notificationLog, pushSubscriptions } from "../src/lib/db/schema";
import { OPERATOR, notify, type Deliver } from "../src/lib/notifications/send";
import { findDevice, removeDevice, saveDevice, setDeviceKinds } from "../src/lib/notifications/devices";
import { messages } from "../src/lib/notifications/kinds";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const A = `notify_a_${randomUUID()}`;
const B = `notify_b_${randomUUID()}`;
const PERSON_A = `${A}_person`;
const PARTNER_A = `${A}_partner`;
const PERSON_B = `${B}_person`;
const ep = (name: string) => `https://push.example.com/${name}-${randomUUID()}`;
const keys = { p256dh: "p", auth: "a" };

async function main() {
  const db = getBaseDb();
  const phoneA = ep("phoneA");
  const partnerA = ep("partnerA");
  const phoneB = ep("phoneB");
  const goneA = ep("goneA");
  await saveDevice({ clerkId: A, accountId: PERSON_A, sub: { endpoint: phoneA, keys }, kinds: ["goals", "household", "jobs"], device: "iPhone" });
  await saveDevice({ clerkId: A, accountId: PARTNER_A, sub: { endpoint: partnerA, keys }, kinds: ["household"], device: "Pixel" });
  await saveDevice({ clerkId: A, accountId: PERSON_A, sub: { endpoint: goneA, keys }, kinds: ["goals"], device: "old iPad" });
  await saveDevice({ clerkId: B, accountId: PERSON_B, sub: { endpoint: phoneB, keys }, kinds: ["goals", "household"], device: "iPhone" });

  const sent: string[] = [];
  const deliver: Deliver = async (sub) => {
    if (sub.endpoint === goneA) throw Object.assign(new Error("gone"), { statusCode: 410 });
    sent.push(sub.endpoint);
  };

  // ---- the right devices, once --------------------------------------------
  const goal = await notify({ clerkId: A, kind: "goals", eventKey: "goal-1", message: messages.goal("Emergency fund") }, deliver);
  check("a goal reaches the household's device that chose goals", goal.sent === 1 && sent.join() === phoneA, sent.join());
  check("and not the partner who did not choose it, nor the other household", !sent.includes(partnerA) && !sent.includes(phoneB));
  check("a device the push service dropped is removed", (await findDevice(A, PERSON_A, goneA)) === null);

  sent.length = 0;
  const again = await notify({ clerkId: A, kind: "goals", eventKey: "goal-1", message: messages.goal("Emergency fund") }, deliver);
  check("the same event a second time sends nothing", again.skipped === "already_sent" && sent.length === 0);

  sent.length = 0;
  await notify({ clerkId: A, kind: "household", eventKey: "invite-1", message: messages.household() }, deliver);
  check("someone joining reaches every member who chose it", sent.length === 2 && sent.includes(phoneA) && sent.includes(partnerA));

  // ---- the operator's notice crosses households ---------------------------
  sent.length = 0;
  await notify({ clerkId: OPERATOR, kind: "jobs", eventKey: `snapshot:${randomUUID()}`, message: messages.job("weekday snapshot") }, deliver);
  check("a failed job reaches the operator's device, in whatever household", sent.join() === phoneA, sent.join());

  // ---- a person's own devices ---------------------------------------------
  check("a person cannot change another's device", !(await setDeviceKinds(A, PARTNER_A, phoneA, [])));
  check("but can change their own", await setDeviceKinds(A, PERSON_A, phoneA, ["goals"]));
  await saveDevice({ clerkId: B, accountId: PERSON_B, sub: { endpoint: phoneA, keys }, kinds: ["goals"], device: "iPhone" });
  check(
    "a phone signed in to another household moves there, and leaves the first",
    (await findDevice(A, PERSON_A, phoneA)) === null && (await findDevice(B, PERSON_B, phoneA)) !== null
  );
  await removeDevice(B, PERSON_B, phoneA);
  check("turning it off removes it", (await findDevice(B, PERSON_B, phoneA)) === null);

  // ---- nothing sent without keys ------------------------------------------
  const saved = { pub: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  const unconfigured = await notify({ clerkId: A, kind: "goals", eventKey: "goal-2", message: messages.goal("Car") });
  check("with no key pair nothing is sent or logged", unconfigured.skipped === "not_configured");
  const [logged] = await db.select().from(notificationLog).where(eq(notificationLog.eventKey, "goal-2"));
  check("so the event can still notify once keys are added", logged === undefined);
  if (saved.pub) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = saved.pub;
  if (saved.priv) process.env.VAPID_PRIVATE_KEY = saved.priv;

  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.clerkId, [A, B]));
  await db.delete(notificationLog).where(inArray(notificationLog.clerkId, [A, B, OPERATOR]));
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

main()
  .then((f) => process.exit(f === 0 ? 0 : 1))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
