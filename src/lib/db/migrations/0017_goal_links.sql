-- Goals measured over the accounts linked to them, rather than over the
-- household's portfolio value.
--
-- Every goal's progress was `portfolioValue / targetAmount` — the same number
-- for all of them, written nightly into every row by the snapshot cron. A goal
-- to clear $31,200 of debt therefore completed itself the moment the portfolio
-- passed $31,200, and a household carrying $78,116.19 of debt was shown a
-- trophy that said otherwise.

CREATE TYPE "goal_direction" AS ENUM('accumulate', 'reduce');--> statement-breakpoint
CREATE TYPE "goal_item_type" AS ENUM('account', 'debt', 'cash_reserve', 'real_estate', 'vehicle');--> statement-breakpoint

ALTER TABLE "goals" ADD COLUMN "direction" "goal_direction" DEFAULT 'accumulate' NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "baseline_date" date;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint

-- current_amount held the portfolio value. Left in place but made nullable so
-- nothing inherits a default of zero, and emptied below so no stale figure can
-- be read as current by something written later.
ALTER TABLE "goals" ALTER COLUMN "current_amount" DROP DEFAULT;--> statement-breakpoint

CREATE TABLE "goal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"goal_id" uuid NOT NULL,
	"item_type" "goal_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"baseline_amount" numeric(20, 2) NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "goal_links" ADD CONSTRAINT "goal_links_goal_id_goals_id_fk"
  FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "goal_links_unique_idx" ON "goal_links" USING btree ("goal_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "goal_links_goal_idx" ON "goal_links" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_links_clerk_idx" ON "goal_links" USING btree ("clerk_id");--> statement-breakpoint

-- Tenant-scoped like every other per-household table (see 0009).
ALTER TABLE "goal_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "goal_links" TO app_user;--> statement-breakpoint
CREATE POLICY "goal_links_tenant" ON "goal_links" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint

-- Backfill.
--
-- Every stored current_amount and is_completed came from the bug, so both are
-- cleared rather than migrated. Completion is re-established from real linked
-- balances on the next run.
UPDATE "goals" SET "current_amount" = NULL, "is_completed" = false;--> statement-breakpoint

-- Existing goals keep working by being linked to the investment accounts they
-- were already, in effect, measured over — but only where the target is still
-- ahead of the portfolio. A goal whose target the portfolio has already passed
-- was not measuring what its name claims (the debt goal here targets $31,200
-- against a $312,798.75 portfolio); linking it to those same accounts would
-- carry the wrong reading forward under a new name. Those are left unlinked,
-- and the panel asks for accounts instead of showing a figure.
--
-- baseline_amount is 0 for an accumulate goal: progress is measured up from
-- nothing toward the target, which is what the panel displayed before.
INSERT INTO "goal_links" ("clerk_id", "goal_id", "item_type", "item_id", "baseline_amount", "linked_at")
SELECT g."clerk_id", g."id", 'account', a."id", 0, now()
FROM "goals" g
JOIN "accounts" a ON a."clerk_id" = g."clerk_id" AND a."is_active" = true
WHERE g."direction" = 'accumulate'
  AND g."target_amount" > (
    SELECT COALESCE(SUM(h."current_value"), 0)
    FROM "holdings" h
    JOIN "accounts" a2 ON a2."id" = h."account_id"
    WHERE a2."clerk_id" = g."clerk_id"
  );--> statement-breakpoint

UPDATE "goals" SET "baseline_date" = COALESCE("created_at"::date, CURRENT_DATE)
WHERE EXISTS (SELECT 1 FROM "goal_links" l WHERE l."goal_id" = "goals"."id");
