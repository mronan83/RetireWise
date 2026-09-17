-- Catches the schema up with src/lib/db/schema.ts. Written idempotently: the
-- live database was partly updated out of band, so some of this may already
-- exist and this must be safe to re-apply.
CREATE TABLE IF NOT EXISTS "account_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"value" numeric(20, 2) NOT NULL,
	"cost_basis" numeric(20, 2) NOT NULL,
	"gain_loss" numeric(20, 2),
	"gain_loss_pct" numeric(10, 4),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "net_worth_item_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"recorded_date" date NOT NULL,
	"value" numeric(20, 2) NOT NULL,
	"secondary_value" numeric(20, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "net_worth_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"net_worth" numeric(20, 2) NOT NULL,
	"total_assets" numeric(20, 2) NOT NULL,
	"investment_value" numeric(20, 2) DEFAULT '0' NOT NULL,
	"real_estate_equity" numeric(20, 2) DEFAULT '0' NOT NULL,
	"cash_total" numeric(20, 2) DEFAULT '0' NOT NULL,
	"vehicle_equity" numeric(20, 2) DEFAULT '0' NOT NULL,
	"total_debts" numeric(20, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "anthropic_api_key" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "google_api_key" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "openai_api_key" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "catch_up_enabled" boolean DEFAULT true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_snapshots_account_date_idx" ON "account_snapshots" USING btree ("account_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_snapshots_clerk_date_idx" ON "account_snapshots" USING btree ("clerk_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nw_item_history_item_date_idx" ON "net_worth_item_history" USING btree ("item_id","recorded_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nw_item_history_clerk_idx" ON "net_worth_item_history" USING btree ("clerk_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "net_worth_snapshots_clerk_date_idx" ON "net_worth_snapshots" USING btree ("clerk_id","snapshot_date");
