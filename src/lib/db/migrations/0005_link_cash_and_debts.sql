-- Balances that come from a linked institution instead of by hand.
ALTER TABLE "cash_reserves" ADD COLUMN IF NOT EXISTS "plaid_item_id" text;--> statement-breakpoint
ALTER TABLE "cash_reserves" ADD COLUMN IF NOT EXISTS "plaid_account_id" text;--> statement-breakpoint
ALTER TABLE "cash_reserves" ADD COLUMN IF NOT EXISTS "data_source" "public"."data_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_reserves" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "plaid_item_id" text;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "plaid_account_id" text;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "data_source" "public"."data_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp;
