import { eq } from "drizzle-orm";
import { requireWriteClerkId, withApiHousehold } from "@/lib/auth-helpers";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { getPlan, isPlanId, isPurchasable, stripePriceIdFor } from "@/lib/billing/plans";
import { billingEnabled, billingReturnUrl, getStripe } from "@/lib/billing/stripe";

/**
 * Start a Stripe Checkout session.
 *
 * Answers 503 while billing is dormant, which is the normal state today. The
 * route exists and is exercised by the settings screen so that turning Stripe
 * on is a configuration change rather than a code change.
 */
export async function POST(request: Request) {
  // Deployment configuration, checked before the caller: whether this
  // deployment sells anything is not a property of who is asking, and a
  // dormant billing system should say so plainly rather than answering 401
  // and leaving the reason ambiguous. It sits outside withApiHousehold for
  // that reason — a session check first would turn "billing is off" into
  // "who are you", which is the less useful of the two answers.
  if (!billingEnabled() || !getStripe()) {
    return Response.json(
      { error: "Billing is not enabled on this deployment.", code: "billing_disabled" },
      { status: 503 }
    );
  }

  return withApiHousehold(() => handlePost(request));
}

async function handlePost(request: Request) {
  const stripe = getStripe()!;

  let clerkId: string;
  try {
    clerkId = await requireWriteClerkId();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId } = await request.json().catch(() => ({ planId: null }));
  if (!isPlanId(planId)) {
    return Response.json({ error: "Unknown plan." }, { status: 400 });
  }

  const plan = getPlan(planId);
  const priceId = stripePriceIdFor(plan);
  if (!isPurchasable(plan) || !priceId) {
    return Response.json({ error: `${plan.name} is not for sale.` }, { status: 400 });
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clerkId, clerkId))
    .limit(1);

  // Reuse the household's Stripe customer so a second subscription attempt
  // does not create a duplicate customer with a divergent payment history.
  let customerId = existing[0]?.stripeCustomerId ?? null;
  if (!customerId) {
    const user = await currentUser();
    const customer = await stripe.customers.create({
      email: user?.email ?? undefined,
      metadata: { clerkId },
    });
    customerId = customer.id;
    await db
      .insert(subscriptions)
      .values({ clerkId, stripeCustomerId: customerId })
      .onConflictDoUpdate({
        target: subscriptions.clerkId,
        set: { stripeCustomerId: customerId, updatedAt: new Date() },
      });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: billingReturnUrl("/settings?billing=success"),
    cancel_url: billingReturnUrl("/settings?billing=cancelled"),
    // Repeated on both the session and the subscription: the webhook reads
    // whichever object the event carries, and a missing clerkId there would
    // leave a paid subscription attached to no household.
    metadata: { clerkId, planId },
    subscription_data: { metadata: { clerkId, planId } },
  });

  return Response.json({ url: session.url });
}
