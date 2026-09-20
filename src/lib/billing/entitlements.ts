import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { billingEnabled } from "./stripe";
import {
  DEFAULT_PLAN_ID,
  PLANS,
  getPlan,
  type Feature,
  type LimitKey,
  type Limits,
  type Plan,
  type PlanId,
  LIMIT_LABELS,
} from "./plans";

/**
 * Statuses that still grant access.
 *
 * `past_due` is included on purpose. Stripe retries a failed card for days;
 * locking someone out of their own retirement plan on the first decline is a
 * worse outcome than a few days of unpaid access, and the portal link in
 * Settings is how they fix it.
 */
const ACCESS_STATUSES = new Set(["active", "trialing", "past_due"]);

export type EntitlementSource =
  /** Stripe is not configured — the whole app is the free tier. */
  | "billing_disabled"
  /** Explicitly granted access that ignores billing. */
  | "comped"
  /** A live Stripe subscription. */
  | "subscription"
  /** No subscription row, or one that no longer grants access. */
  | "default";

export type Entitlements = {
  planId: PlanId;
  plan: Plan;
  status: string;
  source: EntitlementSource;
  features: readonly Feature[];
  limits: Limits;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** True when a card needs attention but access has not been withdrawn. */
  paymentNeedsAttention: boolean;
};

function entitle(
  planId: PlanId,
  source: EntitlementSource,
  extra: Partial<Entitlements> = {}
): Entitlements {
  const plan = PLANS[planId];
  return {
    planId,
    plan,
    status: "active",
    source,
    features: plan.features,
    limits: plan.limits,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    paymentNeedsAttention: false,
    ...extra,
  };
}

/**
 * What this household may do.
 *
 * Answers without a subscription row, without Stripe, and without a network
 * call, so no part of the app depends on billing being reachable. The order of
 * the checks is the guarantee: billing being switched on can only ever add
 * restrictions to households that were never comped.
 */
export async function getEntitlements(clerkId: string): Promise<Entitlements> {
  if (!billingEnabled()) {
    return entitle(DEFAULT_PLAN_ID, "billing_disabled");
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clerkId, clerkId))
    .limit(1);

  const row = rows[0];
  if (!row) return entitle(DEFAULT_PLAN_ID, "default");

  if (row.comped) {
    return entitle(DEFAULT_PLAN_ID, "comped", {
      // A comped household is on the full catalogue regardless of which plan
      // the row names, so read the features from the free plan deliberately.
      features: PLANS[DEFAULT_PLAN_ID].features,
      limits: PLANS[DEFAULT_PLAN_ID].limits,
    });
  }

  if (row.stripeSubscriptionId && ACCESS_STATUSES.has(row.status)) {
    const plan = getPlan(row.planId);
    return {
      planId: plan.id,
      plan,
      status: row.status,
      source: "subscription",
      features: plan.features,
      limits: plan.limits,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      paymentNeedsAttention: row.status === "past_due",
    };
  }

  return entitle(DEFAULT_PLAN_ID, "default", { status: row.status });
}

export async function hasFeature(clerkId: string, feature: Feature): Promise<boolean> {
  const ent = await getEntitlements(clerkId);
  return ent.features.includes(feature);
}

/**
 * Guard a route handler on a feature.
 *
 * Returns a ready-to-send 402 when the household may not use the feature, and
 * null when it may. Route handlers read as:
 *
 *   const denied = await guardFeature(userId, "ai_advisor");
 *   if (denied) return denied;
 *
 * On the free tier this always returns null, so today it is a no-op that is
 * nonetheless exercised on every request — which is the only way to know the
 * check still works on the day it starts saying no.
 */
export async function guardFeature(
  clerkId: string,
  feature: Feature
): Promise<Response | null> {
  const ent = await getEntitlements(clerkId);
  if (ent.features.includes(feature)) return null;
  return Response.json(
    {
      error: "Your plan does not include this feature.",
      code: "feature_not_in_plan",
      feature,
      planId: ent.planId,
    },
    { status: 402 }
  );
}

/**
 * Guard a route handler on a countable limit.
 *
 * `current` is the count before the thing being added, so the check is whether
 * one more would exceed the allowance.
 */
export async function guardLimit(
  clerkId: string,
  key: LimitKey,
  current: number
): Promise<Response | null> {
  const ent = await getEntitlements(clerkId);
  const max = ent.limits[key];
  if (max === null || current < max) return null;
  return Response.json(
    {
      error: `Your plan allows ${max} ${LIMIT_LABELS[key]}.`,
      code: "limit_reached",
      limit: key,
      max,
      planId: ent.planId,
    },
    { status: 402 }
  );
}

/**
 * Mark a household as comped.
 *
 * Used when a household is created, so that everyone who joins while the app
 * is free keeps full access if billing is ever switched on. Safe to call more
 * than once.
 */
export async function compHousehold(clerkId: string, reason: string): Promise<void> {
  const db = getDb();
  await db
    .insert(subscriptions)
    .values({ clerkId, comped: true, compReason: reason, planId: DEFAULT_PLAN_ID })
    .onConflictDoNothing({ target: subscriptions.clerkId });
}
