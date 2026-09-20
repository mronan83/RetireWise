import { getApiUserId } from "@/lib/auth-helpers";
import { getEntitlements } from "@/lib/billing/entitlements";
import {
  FEATURE_LABELS,
  PLANS,
  PLAN_IDS,
  formatPrice,
  isPurchasable,
} from "@/lib/billing/plans";
import { billingDisabledReason, billingEnabled } from "@/lib/billing/stripe";

/** Everything the Settings plan card needs, in one call. */
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ent = await getEntitlements(userId);

  return Response.json({
    billingEnabled: billingEnabled(),
    billingDisabledReason: billingDisabledReason(),
    current: {
      planId: ent.planId,
      planName: ent.plan.name,
      status: ent.status,
      source: ent.source,
      currentPeriodEnd: ent.currentPeriodEnd,
      cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
      paymentNeedsAttention: ent.paymentNeedsAttention,
    },
    features: ent.features.map((f) => ({ id: f, label: FEATURE_LABELS[f] })),
    limits: ent.limits,
    plans: PLAN_IDS.map((id) => {
      const plan = PLANS[id];
      return {
        id: plan.id,
        name: plan.name,
        blurb: plan.blurb,
        price: formatPrice(plan.priceCents),
        purchasable: billingEnabled() && isPurchasable(plan),
        featureCount: plan.features.length,
      };
    }),
  });
}
