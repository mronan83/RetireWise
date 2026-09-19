-- Employer contributions that do not depend on the employee deferring, plus
-- vesting and an end date so a contribution can be retired instead of deleted.
DO $$ BEGIN
  CREATE TYPE "public"."vesting_schedule" AS ENUM('immediate', 'cliff', 'graded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "has_employer_non_elective" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "employer_non_elective_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "employer_non_elective_amount" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "vesting_schedule" "public"."vesting_schedule" DEFAULT 'immediate' NOT NULL;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "vesting_years" integer;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "service_start_date" date;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "ended_on" date;
