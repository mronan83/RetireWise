-- Make row level security actually apply.
--
-- RLS has been enabled on every table since 0002, and has never once affected
-- a query. The application connects as `postgres`, which owns the tables AND
-- carries BYPASSRLS, so policies are skipped twice over. The only thing
-- separating one household's data from another's is a `where clerk_id = ...`
-- that a developer has to remember to write; twenty-four files once did not,
-- and the symptom was an empty page rather than an error.
--
-- `app_user` owns nothing and bypasses nothing. src/lib/db/tenant.ts runs
-- tenant-scoped work as this role inside a transaction that sets
-- app.clerk_id, so a query missing its filter returns no rows instead of
-- returning somebody else's money.
--
-- current_setting(..., true) yields NULL when unset, and `clerk_id = NULL` is
-- never true — so the failure mode of an unscoped query is nothing, loudly,
-- rather than everything, silently.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint

-- The owner must be a member to SET LOCAL ROLE to it.
GRANT app_user TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "account_snapshots" TO app_user;--> statement-breakpoint
CREATE POLICY "account_snapshots_tenant" ON "account_snapshots" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "accounts" TO app_user;--> statement-breakpoint
CREATE POLICY "accounts_tenant" ON "accounts" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_analyses" TO app_user;--> statement-breakpoint
CREATE POLICY "ai_analyses_tenant" ON "ai_analyses" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "alerts" TO app_user;--> statement-breakpoint
CREATE POLICY "alerts_tenant" ON "alerts" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "cash_reserves" TO app_user;--> statement-breakpoint
CREATE POLICY "cash_reserves_tenant" ON "cash_reserves" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "contributions" TO app_user;--> statement-breakpoint
CREATE POLICY "contributions_tenant" ON "contributions" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "debts" TO app_user;--> statement-breakpoint
CREATE POLICY "debts_tenant" ON "debts" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "goals" TO app_user;--> statement-breakpoint
CREATE POLICY "goals_tenant" ON "goals" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "net_worth_item_history" TO app_user;--> statement-breakpoint
CREATE POLICY "net_worth_item_history_tenant" ON "net_worth_item_history" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "net_worth_snapshots" TO app_user;--> statement-breakpoint
CREATE POLICY "net_worth_snapshots_tenant" ON "net_worth_snapshots" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "plaid_items" TO app_user;--> statement-breakpoint
CREATE POLICY "plaid_items_tenant" ON "plaid_items" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "portfolio_snapshots" TO app_user;--> statement-breakpoint
CREATE POLICY "portfolio_snapshots_tenant" ON "portfolio_snapshots" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "real_estate" TO app_user;--> statement-breakpoint
CREATE POLICY "real_estate_tenant" ON "real_estate" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "social_security_benefits" TO app_user;--> statement-breakpoint
CREATE POLICY "social_security_benefits_tenant" ON "social_security_benefits" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "subscriptions" TO app_user;--> statement-breakpoint
CREATE POLICY "subscriptions_tenant" ON "subscriptions" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_preferences" TO app_user;--> statement-breakpoint
CREATE POLICY "user_preferences_tenant" ON "user_preferences" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "vehicles" TO app_user;--> statement-breakpoint
CREATE POLICY "vehicles_tenant" ON "vehicles" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint

-- Rows reached through their account rather than carrying the key themselves.
GRANT SELECT, INSERT, UPDATE, DELETE ON "holdings" TO app_user;--> statement-breakpoint
CREATE POLICY "holdings_tenant" ON "holdings" FOR ALL TO app_user
  USING (account_id IN (SELECT id FROM accounts WHERE clerk_id = current_setting('app.clerk_id', true)))
  WITH CHECK (account_id IN (SELECT id FROM accounts WHERE clerk_id = current_setting('app.clerk_id', true)));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "transactions" TO app_user;--> statement-breakpoint
CREATE POLICY "transactions_tenant" ON "transactions" FOR ALL TO app_user
  USING (account_id IN (SELECT id FROM accounts WHERE clerk_id = current_setting('app.clerk_id', true)))
  WITH CHECK (account_id IN (SELECT id FROM accounts WHERE clerk_id = current_setting('app.clerk_id', true)));--> statement-breakpoint

-- Household membership is keyed by the individual account; everything else by
-- the household. Both ids are in scope, which is why there are two settings.
GRANT SELECT, INSERT, UPDATE, DELETE ON "households" TO app_user;--> statement-breakpoint
CREATE POLICY "households_tenant" ON "households" FOR ALL TO app_user
  USING (primary_clerk_id = current_setting('app.clerk_id', true))
  WITH CHECK (primary_clerk_id = current_setting('app.clerk_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "household_members" TO app_user;--> statement-breakpoint
CREATE POLICY "household_members_tenant" ON "household_members" FOR ALL TO app_user
  USING (
    clerk_id = current_setting('app.account_id', true)
    OR household_id IN (SELECT id FROM households WHERE primary_clerk_id = current_setting('app.clerk_id', true))
  )
  WITH CHECK (
    clerk_id = current_setting('app.account_id', true)
    OR household_id IN (SELECT id FROM households WHERE primary_clerk_id = current_setting('app.clerk_id', true))
  );--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "household_invites" TO app_user;--> statement-breakpoint
CREATE POLICY "household_invites_tenant" ON "household_invites" FOR ALL TO app_user
  USING (household_id IN (SELECT id FROM households WHERE primary_clerk_id = current_setting('app.clerk_id', true)))
  WITH CHECK (household_id IN (SELECT id FROM households WHERE primary_clerk_id = current_setting('app.clerk_id', true)));--> statement-breakpoint
GRANT SELECT, INSERT ON "household_join_attempts" TO app_user;--> statement-breakpoint
CREATE POLICY "household_join_attempts_tenant" ON "household_join_attempts" FOR ALL TO app_user
  USING (clerk_id = current_setting('app.account_id', true))
  WITH CHECK (clerk_id = current_setting('app.account_id', true));--> statement-breakpoint

-- Shared reference data: the same IRS figures for everyone, readable by all
-- and writable only by the refresh job, which runs with the owner's role.
GRANT SELECT ON "irs_limits" TO app_user;--> statement-breakpoint
CREATE POLICY "irs_limits_read" ON "irs_limits" FOR SELECT TO app_user
  USING (true);--> statement-breakpoint

-- billing_events gets no grant at all. It is written only by the Stripe
-- webhook, which is authenticated by signature rather than by session and
-- runs with the owner's role; no tenant has any business reading it.
