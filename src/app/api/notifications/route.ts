import { getAuthContext, withApiHousehold, withApiWriteHousehold } from "@/lib/auth-helpers";
import { currentUser } from "@/lib/auth";
import { NOTIFICATION_KINDS, isOperator, kindsFor } from "@/lib/notifications/kinds";
import { pushConfigured } from "@/lib/notifications/send";
import {
  allowedKinds,
  findDevice,
  parseSubscription,
  removeDevice,
  saveDevice,
  setDeviceKinds,
} from "@/lib/notifications/devices";

/**
 * This device's push notifications: whether they are available, which kinds
 * this person may choose, and what this device has chosen. The device is
 * named by its push address, which only the browser holding it knows.
 */

async function person() {
  const ctx = await getAuthContext();
  const user = ctx.isDemo ? null : await currentUser();
  return { accountId: ctx.userId, operator: isOperator(user?.email) };
}

export async function GET(request: Request) {
  return withApiHousehold(async (clerkId) => {
    const { accountId, operator } = await person();
    const endpoint = new URL(request.url).searchParams.get("endpoint");
    const device = endpoint ? await findDevice(clerkId, accountId, endpoint) : null;
    const allowed = new Set(kindsFor(operator));
    return Response.json({
      configured: pushConfigured(),
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
      kinds: NOTIFICATION_KINDS.filter((k) => allowed.has(k.key)).map(({ key, label }) => ({ key, label })),
      device: device ? { kinds: device.kinds } : null,
    });
  });
}

/** Turn notifications on for this device, or change which kinds it gets. */
export async function POST(request: Request) {
  return withApiWriteHousehold(async (clerkId) => {
    if (!pushConfigured()) return Response.json({ error: "Notifications are not set up yet." }, { status: 503 });
    const body = (await request.json().catch(() => null)) as { subscription?: unknown; kinds?: unknown } | null;
    const sub = parseSubscription(body?.subscription);
    if (!sub) return Response.json({ error: "Invalid subscription" }, { status: 400 });
    const { accountId, operator } = await person();
    const kinds = allowedKinds(body?.kinds, operator);
    const existing = await findDevice(clerkId, accountId, sub.endpoint);
    if (existing && body?.kinds !== undefined) {
      await setDeviceKinds(clerkId, accountId, sub.endpoint, kinds);
    } else {
      await saveDevice({ clerkId, accountId, sub, kinds, device: request.headers.get("user-agent") });
    }
    return Response.json({ kinds });
  });
}

/** Turn notifications off for this device. */
export async function DELETE(request: Request) {
  return withApiWriteHousehold(async (clerkId) => {
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint !== "string") return Response.json({ error: "Invalid request" }, { status: 400 });
    const { accountId } = await person();
    await removeDevice(clerkId, accountId, body.endpoint);
    return Response.json({ ok: true });
  });
}
