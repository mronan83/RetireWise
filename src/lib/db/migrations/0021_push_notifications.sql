-- Push notifications (FR-ONB-06, Q11).
--
-- push_subscriptions: one row per person per device that turned them on.
-- Keyed to the household (clerk_id) like every other table, so a household's
-- erasure removes its partner's devices too, and to the person (account_id),
-- which the application filters on so a partner never sees or changes
-- another's.
--
-- notification_log: one row per event notified. Its unique key is what makes
-- each event notify once, however often the job that finds it runs.
--
-- Both are new, so applying this ahead of the release is safe: the code
-- already live never names them.
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"account_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"kinds" text[] NOT NULL,
	"device" text,
	"last_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_clerk_idx" ON "push_subscriptions" USING btree ("clerk_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"kind" text NOT NULL,
	"event_key" text NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_log_event_idx" ON "notification_log" USING btree ("clerk_id","kind","event_key");--> statement-breakpoint

-- Tenant-scoped like every other per-household table (see 0009).
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "push_subscriptions" TO app_user;--> statement-breakpoint
DROP POLICY IF EXISTS "push_subscriptions_tenant" ON "push_subscriptions";--> statement-breakpoint
CREATE POLICY "push_subscriptions_tenant" ON "push_subscriptions" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint

ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_log" TO app_user;--> statement-breakpoint
DROP POLICY IF EXISTS "notification_log_tenant" ON "notification_log";--> statement-breakpoint
CREATE POLICY "notification_log_tenant" ON "notification_log" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));
