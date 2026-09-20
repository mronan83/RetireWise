-- Audit trail, cron run history, and Plaid retry state.
--
-- The plaid_items columns undo a dead end: any failure set status to "error"
-- and the refresh job selected only "active" items, so one timeout removed an
-- account from the rotation permanently. The dashboard went on showing the
-- last figure it had, which looks exactly like a figure that has not changed.

CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"detail" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"ok" boolean,
	"processed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "last_error_at" timestamp;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "next_attempt_at" timestamp;--> statement-breakpoint
CREATE INDEX "audit_log_clerk_at_idx" ON "audit_log" USING btree ("clerk_id","at");--> statement-breakpoint
CREATE INDEX "cron_runs_job_started_idx" ON "cron_runs" USING btree ("job","started_at");
--> statement-breakpoint
-- Policies, matching 0009. Anything without them is unreachable by app_user,
-- which is the right default for a table it has no business reading.
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cron_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Readable and appendable by its own household, and nothing more. No UPDATE
-- and no DELETE on purpose: an audit trail the application can edit is not
-- one. Corrections happen by appending, or by the owner's role.
GRANT SELECT, INSERT ON "audit_log" TO app_user;--> statement-breakpoint
CREATE POLICY "audit_log_tenant" ON "audit_log" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint

-- cron_runs gets no grant at all. It belongs to no household, and the two
-- readers — the jobs themselves and the freshness probe — run with the
-- owner's role.
