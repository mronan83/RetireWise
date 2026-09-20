import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { billingEvents, subscriptions } from "@/lib/db/schema";
import { DEFAULT_PLAN_ID, isPlanId, planIdForStripePrice } from "@/lib/billing/plans";
import { getStripe } from "@/lib/billing/stripe";
import { withSystemRole } from "@/lib/db/tenant";

/**
 * Stripe's period end moved off the subscription and onto its items in the
 * 2025-03-31 API version. Read whichever one this account's version sends so
 * the row is right on both, rather than silently storing null and showing a
 * renewal date that never arrives.
 */
function periodEnd(sub: Stripe.Subscription): Date | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const raw =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000) : null;
}

function clerkIdFor(sub: Stripe.Subscription): string | null {
  const fromMetadata = sub.metadata?.clerkId;
  return typeof fromMetadata === "string" && fromMetadata ? fromMetadata : null;
}

function planIdFor(sub: Stripe.Subscription): string {
  const fromMetadata = sub.metadata?.planId;
  if (isPlanId(fromMetadata)) return fromMetadata;
  const priceId = sub.items?.data?.[0]?.price?.id;
  return planIdForStripePrice(priceId) ?? DEFAULT_PLAN_ID;
}

/**
 * Write what Stripe just told us about a subscription onto the household row.
 *
 * Two guards matter more than the write itself:
 *
 *  - Webhooks arrive out of order. An update delivered after the cancellation
 *    that superseded it would otherwise resurrect a dead subscription, so an
 *    event older than the one already applied is dropped.
 *  - A comped household is never touched. Friends and family keep full access
 *    whatever Stripe thinks, and that must not depend on nobody accidentally
 *    creating a customer record for them.
 */
async function applySubscription(sub: Stripe.Subscription, eventAt: Date) {
  const clerkId = clerkIdFor(sub);
  if (!clerkId) {
    console.warn(`Stripe subscription ${sub.id} has no clerkId in metadata; ignoring.`);
    return;
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clerkId, clerkId))
    .limit(1);
  const row = existing[0];

  if (row?.comped) return;
  if (row?.lastEventAt && row.lastEventAt > eventAt) return;

  const values = {
    clerkId,
    planId: planIdFor(sub),
    status: sub.status,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    stripePriceId: sub.items?.data?.[0]?.price?.id ?? null,
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    lastEventAt: eventAt,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.clerkId, set: values });
}

export async function POST(request: Request) {
  return withSystemRole(
    "signature-authenticated; acts on whichever household Stripe names",
    () => handlePost(request)
  );
}

async function handlePost(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return Response.json({ error: "Billing is not enabled." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature." }, { status: 400 });
  }

  // The raw body, not the parsed one: the signature covers the exact bytes.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch (e) {
    console.warn("Rejected Stripe webhook:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Idempotency. Stripe retries on any non-2xx and can deliver the same event
  // twice even after a 200, so the unique constraint — not the handler — is
  // what guarantees an effect happens once.
  const db = getDb();
  const inserted = await db
    .insert(billingEvents)
    .values({ stripeEventId: event.id, type: event.type })
    .onConflictDoNothing({ target: billingEvents.stripeEventId })
    .returning({ id: billingEvents.id });

  if (inserted.length === 0) {
    return Response.json({ received: true, duplicate: true });
  }

  const eventAt = new Date(event.created * 1000);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subId) {
          // Re-fetch rather than trusting the session's embedded copy: by the
          // time this arrives the subscription may already have moved on.
          const sub = await stripe.subscriptions.retrieve(subId);
          if (!sub.metadata?.clerkId && session.metadata?.clerkId) {
            sub.metadata = { ...sub.metadata, ...session.metadata };
          }
          await applySubscription(sub, eventAt);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object, eventAt);
        break;

      default:
        // Everything else is recorded in billing_events and ignored.
        break;
    }
  } catch (e) {
    // Undo the idempotency marker so Stripe's retry is allowed to do the work
    // that this delivery did not. Without this, a transient database error
    // would permanently consume the only delivery that mattered.
    await db.delete(billingEvents).where(eq(billingEvents.stripeEventId, event.id));
    console.error(`Stripe webhook ${event.type} (${event.id}) failed:`, e);
    return Response.json({ error: "Handler failed." }, { status: 500 });
  }

  return Response.json({ received: true });
}
