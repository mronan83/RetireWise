/**
 * The plan catalogue.
 *
 * ---------------------------------------------------------------------------
 * HOW TO START CHARGING
 * ---------------------------------------------------------------------------
 * Today RetireWise is free for friends and family, and `free` carries every
 * feature with no limits. Everything else — checkout, the customer portal, the
 * webhook, the entitlement checks at each call site — is already built and
 * already running; it simply never says no, because the free plan never
 * withholds anything.
 *
 * To monetise later, the only file that has to change is this one:
 *
 *   1. Remove features from `free.features`, or tighten `free.limits`.
 *   2. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_PLUS_MONTHLY.
 *
 * Existing households are unaffected: they are marked `comped` in the
 * subscriptions table, and a comped household always resolves to full access.
 * Switching billing on can therefore never downgrade someone already using the
 * app — which is the failure mode worth designing against, because it would
 * present as a working app that quietly stopped doing something.
 * ---------------------------------------------------------------------------
 */

export const FEATURES = [
  "plaid_linking",
  "ai_advisor",
  "ai_reports",
  "projections",
  "net_worth",
  "csv_import",
  "exports",
  "household_sharing",
] as const;

export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<Feature, string> = {
  plaid_linking: "Automatic account linking",
  ai_advisor: "AI advisor chat",
  ai_reports: "AI-written reports",
  projections: "Retirement projections",
  net_worth: "Net worth tracking",
  csv_import: "CSV import",
  exports: "Data export",
  household_sharing: "Household sharing",
};

/** `null` means no limit. */
export type Limits = {
  linkedInstitutions: number | null;
  householdMembers: number | null;
  aiMessagesPerDay: number | null;
};

export type LimitKey = keyof Limits;

export const LIMIT_LABELS: Record<LimitKey, string> = {
  linkedInstitutions: "linked institutions",
  householdMembers: "household members",
  aiMessagesPerDay: "AI messages per day",
};

export const PLAN_IDS = ["free", "plus"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type Plan = {
  id: PlanId;
  name: string;
  blurb: string;
  /** Monthly price in cents, for display only. Stripe holds the real price. */
  priceCents: number;
  /**
   * Env var holding this plan's Stripe Price id. Kept out of the catalogue so
   * the same code runs against test and live Stripe accounts unchanged.
   */
  priceEnvVar?: string;
  features: readonly Feature[];
  limits: Limits;
};

const UNLIMITED: Limits = {
  linkedInstitutions: null,
  householdMembers: null,
  aiMessagesPerDay: null,
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Friends & Family",
    blurb: "Every feature, no limits, no card. This is the plan everyone is on.",
    priceCents: 0,
    // Deliberately the full feature set — see the header comment.
    features: FEATURES,
    limits: UNLIMITED,
  },
  plus: {
    id: "plus",
    name: "Plus",
    blurb: "The paid tier, defined and wired but not for sale yet.",
    priceCents: 900,
    priceEnvVar: "STRIPE_PRICE_PLUS_MONTHLY",
    features: FEATURES,
    limits: UNLIMITED,
  },
};

export const DEFAULT_PLAN_ID: PlanId = "free";

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function getPlan(planId: string | null | undefined): Plan {
  return isPlanId(planId) ? PLANS[planId] : PLANS[DEFAULT_PLAN_ID];
}

/** The Stripe Price id for a plan, or null when it is not configured for sale. */
export function stripePriceIdFor(plan: Plan): string | null {
  if (!plan.priceEnvVar) return null;
  return process.env[plan.priceEnvVar] || null;
}

/** A plan can be bought only once Stripe knows a price for it. */
export function isPurchasable(plan: Plan): boolean {
  return plan.priceCents > 0 && !!stripePriceIdFor(plan);
}

/** Resolve the plan a Stripe Price id belongs to, for webhook handling. */
export function planIdForStripePrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const plan of Object.values(PLANS)) {
    if (stripePriceIdFor(plan) === priceId) return plan.id;
  }
  return null;
}

export function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/mo`;
}
