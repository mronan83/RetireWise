import webpush from "web-push";
import { getAuthContext, withApiWriteHousehold } from "@/lib/auth-helpers";
import { findDevice, removeDevice } from "@/lib/notifications/devices";
import { configurePush, pushConfigured } from "@/lib/notifications/send";

/** Send a test notification to this device only, so a person can see it works. */
export async function POST(request: Request) {
  return withApiWriteHousehold(async (clerkId) => {
    if (!pushConfigured()) return Response.json({ error: "Notifications are not set up yet." }, { status: 503 });
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint !== "string") return Response.json({ error: "Invalid request" }, { status: 400 });
    const { userId } = await getAuthContext();
    const device = await findDevice(clerkId, userId, body.endpoint);
    if (!device) return Response.json({ error: "This device has not turned notifications on." }, { status: 404 });
    configurePush();
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify({ title: "RetireWise notifications are on", body: "This is how they will look on this device.", url: "/settings" }),
        { TTL: 300 }
      );
      return Response.json({ ok: true });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await removeDevice(clerkId, userId, device.endpoint);
        return Response.json({ error: "This device's subscription has expired. Turn notifications on again." }, { status: 410 });
      }
      return Response.json({ error: "The push service did not accept the test." }, { status: 502 });
    }
  });
}
