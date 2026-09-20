import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * The Stripe client, or null when Stripe is not configured.
 *
 * Returning null rather than throwing is deliberate: billing ships dormant, so
 * "no Stripe" is the normal state, not an error. Callers that need Stripe
 * check for null and answer 503; callers that only need to know whether
 * billing is on ask `billingEnabled()` instead.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

/**
 * Whether billing is switched on.
 *
 * Both halves are required. A secret key without a webhook secret would take
 * payments and then never hear that they succeeded, leaving paying customers
 * on the free plan — a failure that looks like a working checkout, which is
 * exactly the kind this codebase has been bitten by before.
 */
export function billingEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
}

/** Why billing is off, for the settings screen. Null when it is on. */
export function billingDisabledReason(): string | null {
  const hasKey = !!process.env.STRIPE_SECRET_KEY;
  const hasWebhook = !!process.env.STRIPE_WEBHOOK_SECRET;
  if (hasKey && hasWebhook) return null;
  if (!hasKey && !hasWebhook) return "Stripe is not configured.";
  if (!hasKey) return "STRIPE_SECRET_KEY is not set.";
  return "STRIPE_WEBHOOK_SECRET is not set, so subscription changes could not be recorded.";
}

/** The absolute URL Stripe should return the browser to. */
export function billingReturnUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return new URL(path, base).toString();
}
