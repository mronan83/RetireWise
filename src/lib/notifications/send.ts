import webpush from "web-push";
import { and, arrayContains, eq, inArray, sql } from "drizzle-orm";
import { getBaseDb } from "@/lib/db";
import { notificationLog, pushSubscriptions } from "@/lib/db/schema";
import type { Message, NotificationKind } from "./kinds";

/**
 * Send one notification for one event, to every device in the household that
 * has turned that kind on.
 *
 * Runs as the database owner, with explicit household filters, because the
 * events are found by scheduled jobs and by an invite being redeemed, none of
 * which has the household's session.
 *
 * The event is logged before anything is sent, under a unique key, so an
 * event notifies at most once however often the job that finds it runs.
 * A delivery that fails is not retried: a late notification about a market
 * move is worse than none.
 */

/** The household key the operator's notifications are logged under. */
export const OPERATOR = "operator";

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
/** Give web-push the key pair; once per process. */
export function configurePush() {
  if (configured) return;
  const subject = process.env.OPERATOR_EMAIL ? `mailto:${process.env.OPERATOR_EMAIL}` : "https://retirewise-iota.vercel.app";
  webpush.setVapidDetails(subject, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

type Subscription = typeof pushSubscriptions.$inferSelect;
export type Deliver = (sub: Subscription, payload: string) => Promise<void>;

const deliverWithWebPush: Deliver = async (sub, payload) => {
  configurePush();
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payload,
    { TTL: 60 * 60 * 24, urgency: "normal" }
  );
};

export type NotifyResult = { sent: number; skipped?: "not_configured" | "already_sent" };

export async function notify(
  event: { clerkId: string; kind: NotificationKind; eventKey: string; message: Message },
  deliver: Deliver = deliverWithWebPush
): Promise<NotifyResult> {
  if (deliver === deliverWithWebPush && !pushConfigured()) return { sent: 0, skipped: "not_configured" };
  const db = getBaseDb();

  const [logged] = await db
    .insert(notificationLog)
    .values({ clerkId: event.clerkId, kind: event.kind, eventKey: event.eventKey })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  if (!logged) return { sent: 0, skipped: "already_sent" };

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        // The operator's notifications go to whoever turned them on, in any household.
        event.clerkId === OPERATOR ? sql`true` : eq(pushSubscriptions.clerkId, event.clerkId),
        arrayContains(pushSubscriptions.kinds, [event.kind])
      )
    );

  const payload = JSON.stringify(event.message);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await deliver(sub, payload);
        sent++;
      } catch (e) {
        // 404 and 410: the browser dropped the subscription (the app was
        // removed, or permission withdrawn). It will never work again.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(sub.id);
        else console.error(`Push to ${sub.id} failed:`, status ?? e);
      }
    })
  );

  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  const delivered = subs.filter((s) => !gone.includes(s.id)).map((s) => s.id);
  if (sent > 0) {
    await db
      .update(pushSubscriptions)
      .set({ lastSentAt: new Date() })
      .where(inArray(pushSubscriptions.id, delivered));
  }
  await db.update(notificationLog).set({ delivered: sent }).where(eq(notificationLog.id, logged.id));
  return { sent };
}

/** notify(), never throwing: a notification must not break the job that found the event. */
export async function notifySafely(event: Parameters<typeof notify>[0]): Promise<void> {
  try {
    await notify(event);
  } catch (e) {
    console.error(`Notification ${event.kind}:${event.eventKey} failed:`, e);
  }
}
