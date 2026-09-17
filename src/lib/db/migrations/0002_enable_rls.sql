-- Enable row level security on every table.
--
-- This matters specifically because of Supabase, not Postgres. Supabase auto-
-- exposes the `public` schema over PostgREST, reachable by anyone holding the
-- publishable (anon) key — which ships to the browser by design. With RLS off,
-- that key can read and write every row in this database. The previous host
-- had no such surface, so this risk arrives with the migration and has to be
-- closed in it.
--
-- No policies are defined, which is deliberate: it denies PostgREST entirely.
-- The app reaches the database through Drizzle as the table owner, and owners
-- bypass RLS, so application queries are unaffected. If the REST API is ever
-- wanted, add explicit policies then — do not disable this.
ALTER TABLE "account_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_analyses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cash_reserves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contributions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "debts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "holdings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "household_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "households" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "irs_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "net_worth_item_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plaid_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "real_estate" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "social_security_benefits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
