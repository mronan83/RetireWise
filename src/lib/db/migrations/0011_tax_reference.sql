-- Federal brackets, IRMAA tiers, and Medicare base costs move out of source.
--
-- These sat as `const` arrays in financial-analytics.ts, which meant the
-- app's tax answers changed only when someone remembered to edit code each
-- January. They were wrong once already — commented "2025" while carrying
-- 2024 figures — and nothing in the product could say so, because nothing
-- in the product knew which year it was computing.
--
-- Shared reference data, like irs_limits: the same figures for every
-- household, owned by none of them. A separate table because irs_limits is
-- shaped around contribution caps (limit_under_50 / limit_over_50 /
-- limit_age_60_to_63 keyed by account type), which fits a 401(k) and fits
-- nothing here.

CREATE TABLE "tax_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tax_year" integer NOT NULL,
	"kind" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"threshold" numeric(14, 2),
	"value" numeric(14, 4) NOT NULL,
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- The upsert key. Without it a re-run of the refresh endpoint could double
-- the brackets, and a seven-bracket schedule read as fourteen still returns
-- a plausible-looking number.
CREATE UNIQUE INDEX "tax_reference_year_kind_ordinal_idx"
  ON "tax_reference" USING btree ("tax_year","kind","ordinal");
--> statement-breakpoint

-- Same posture as irs_limits in 0009: readable by every tenant, writable
-- only by the refresh job, which runs with the owner's role.
ALTER TABLE "tax_reference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT ON "tax_reference" TO app_user;--> statement-breakpoint
CREATE POLICY "tax_reference_read" ON "tax_reference" FOR SELECT TO app_user
  USING (true);
