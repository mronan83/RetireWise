-- Billing: subscriptions and the webhook event log.
--
-- Trimmed by hand from drizzle's generated diff. The generator had no
-- snapshots for 0004-0006 (they were written by hand), so it re-emitted every
-- column those three added on top of the billing tables. Against Supabase,
-- where 0004-0006 are already applied, that SQL would have failed on the first
-- duplicate column. 0007_snapshot.json is the generated one and does describe
-- the real schema, so from here the drift is repaired and future diffs are
-- correct.

CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"comped" boolean DEFAULT false NOT NULL,
	"comp_reason" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"last_event_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint

-- Same reasoning as 0002: Supabase exposes the public schema over PostgREST to
-- anyone holding the publishable key, so a new table without RLS is readable
-- from the browser. These two hold Stripe customer ids and event history.
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;
