CREATE TABLE "holding_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"ticker" text NOT NULL,
	"shares" numeric(20, 8) NOT NULL,
	"price" numeric(20, 4) NOT NULL,
	"value" numeric(20, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "holding_snapshots_unique_idx" ON "holding_snapshots" USING btree ("account_id","snapshot_date","ticker");--> statement-breakpoint
CREATE INDEX "holding_snapshots_account_date_idx" ON "holding_snapshots" USING btree ("account_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "holding_snapshots_clerk_date_idx" ON "holding_snapshots" USING btree ("clerk_id","snapshot_date");
--> statement-breakpoint
-- Tenant-scoped like every other per-household table (see 0009).
ALTER TABLE "holding_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "holding_snapshots" TO app_user;--> statement-breakpoint
CREATE POLICY "holding_snapshots_tenant" ON "holding_snapshots" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));
