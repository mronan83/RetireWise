import { and, eq } from "drizzle-orm";
import { getBaseDb } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { isNotificationKind, kindsFor, type NotificationKind } from "./kinds";

/**
 * A person's devices. Each call names the household and the person, and
 * touches only that person's rows: a partner never sees or changes another's.
 *
 * Runs as the database owner for one reason: a device's push address is
 * unique, and the same phone can later be signed in to another household.
 * Registering it there has to take the address over, and the earlier row is
 * invisible under the new household's row-level security.
 */

export type DeviceSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export function parseSubscription(body: unknown): DeviceSubscription | null {
  const b = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!b || typeof b.endpoint !== "string" || !b.endpoint.startsWith("https://")) return null;
  if (typeof b.keys?.p256dh !== "string" || typeof b.keys?.auth !== "string") return null;
  return { endpoint: b.endpoint, keys: { p256dh: b.keys.p256dh, auth: b.keys.auth } };
}

/** Only kinds this person may have; anything else is dropped. */
export function allowedKinds(requested: unknown, operator: boolean): NotificationKind[] {
  const allowed = new Set(kindsFor(operator));
  if (!Array.isArray(requested)) return [...allowed];
  return [...new Set(requested.filter((k): k is NotificationKind => typeof k === "string" && isNotificationKind(k) && allowed.has(k)))];
}

export async function saveDevice(args: {
  clerkId: string;
  accountId: string;
  sub: DeviceSubscription;
  kinds: NotificationKind[];
  device: string | null;
}) {
  const db = getBaseDb();
  const values = {
    clerkId: args.clerkId,
    accountId: args.accountId,
    endpoint: args.sub.endpoint,
    p256dh: args.sub.keys.p256dh,
    auth: args.sub.keys.auth,
    kinds: args.kinds,
    device: args.device?.slice(0, 200) ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
}

function mine(clerkId: string, accountId: string, endpoint: string) {
  return and(
    eq(pushSubscriptions.clerkId, clerkId),
    eq(pushSubscriptions.accountId, accountId),
    eq(pushSubscriptions.endpoint, endpoint)
  );
}

export async function findDevice(clerkId: string, accountId: string, endpoint: string) {
  const [row] = await getBaseDb().select().from(pushSubscriptions).where(mine(clerkId, accountId, endpoint)).limit(1);
  return row ?? null;
}

export async function setDeviceKinds(clerkId: string, accountId: string, endpoint: string, kinds: NotificationKind[]) {
  const rows = await getBaseDb()
    .update(pushSubscriptions)
    .set({ kinds, updatedAt: new Date() })
    .where(mine(clerkId, accountId, endpoint))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

export async function removeDevice(clerkId: string, accountId: string, endpoint: string) {
  await getBaseDb().delete(pushSubscriptions).where(mine(clerkId, accountId, endpoint));
}
