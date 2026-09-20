import { eq } from "drizzle-orm";
import { requireWriteClerkId } from "@/lib/auth-helpers";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { billingEnabled, billingReturnUrl, getStripe } from "@/lib/billing/stripe";

/** Send the household to Stripe's customer portal to manage or cancel. */
export async function POST() {
  // Deployment configuration, checked before the caller: whether this
  // deployment sells anything is not a property of who is asking, and a
  // dormant billing system should say so plainly rather than answering 401
  // and leaving the reason ambiguous. Nothing here touches user data or
  // Stripe, so there is nothing to protect behind the session check.
  const stripe = getStripe();
  if (!billingEnabled() || !stripe) {
    return Response.json(
      { error: "Billing is not enabled on this deployment.", code: "billing_disabled" },
      { status: 503 }
    );
  }

  let clerkId: string;
  try {
    clerkId = await requireWriteClerkId();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const rows = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.clerkId, clerkId))
    .limit(1);

  const customerId = rows[0]?.stripeCustomerId;
  if (!customerId) {
    return Response.json({ error: "No billing account yet." }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: billingReturnUrl("/settings"),
  });

  return Response.json({ url: session.url });
}
