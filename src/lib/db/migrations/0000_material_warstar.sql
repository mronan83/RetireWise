CREATE TYPE "public"."account_owner" AS ENUM('self', 'spouse');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('401k', '403b', 'ira_traditional', 'ira_roth', 'brokerage', 'hsa', '529', 'pension', 'annuity', 'social_security', 'other');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('allocation_drift', 'large_daily_move', 'concentration_risk', 'milestone_reached', 'rebalance_needed', 'goal_progress');--> statement-breakpoint
CREATE TYPE "public"."analysis_type" AS ENUM('portfolio_review', 'rebalance_suggestion', 'tax_harvest', 'retirement_projection', 'social_security_analysis', 'custom');--> statement-breakpoint
CREATE TYPE "public"."asset_class" AS ENUM('us_stock', 'intl_stock', 'bond', 'reit', 'commodity', 'crypto', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."cash_account_type" AS ENUM('checking', 'savings', 'high_yield_savings', 'money_market', 'cd', 'ibonds', 'emergency_fund', 'other_cash');--> statement-breakpoint
CREATE TYPE "public"."contribution_frequency" AS ENUM('per_paycheck_biweekly', 'per_paycheck_semimonthly', 'monthly', 'quarterly', 'annually');--> statement-breakpoint
CREATE TYPE "public"."contribution_method" AS ENUM('percent_of_salary', 'fixed_amount');--> statement-breakpoint
CREATE TYPE "public"."data_source" AS ENUM('manual', 'csv_import', 'plaid');--> statement-breakpoint
CREATE TYPE "public"."debt_type" AS ENUM('mortgage', 'auto_loan', 'student_loan', 'heloc', 'personal_loan', 'credit_card', 'other_debt');--> statement-breakpoint
CREATE TYPE "public"."filing_status" AS ENUM('married_filing_jointly', 'married_filing_separately', 'single');--> statement-breakpoint
CREATE TYPE "public"."plaid_item_status" AS ENUM('active', 'error', 'requires_reauth');--> statement-breakpoint
CREATE TYPE "public"."risk_tolerance" AS ENUM('conservative', 'moderate', 'aggressive');--> statement-breakpoint
CREATE TYPE "public"."tax_treatment" AS ENUM('tax_deferred', 'tax_free', 'taxable');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('buy', 'sell', 'dividend', 'contribution', 'withdrawal', 'fee', 'transfer', 'split');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('car', 'truck', 'suv', 'motorcycle', 'boat', 'rv', 'camper', 'atv', 'other_vehicle');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"owner" "account_owner" DEFAULT 'self' NOT NULL,
	"name" text NOT NULL,
	"institution" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"tax_treatment" "tax_treatment" NOT NULL,
	"plaid_item_id" text,
	"plaid_account_id" text,
	"data_source" "data_source" DEFAULT 'manual' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_actively_contributing" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"type" "analysis_type" NOT NULL,
	"prompt_summary" text,
	"result" jsonb,
	"model_used" text,
	"tokens_used" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"type" "alert_type" NOT NULL,
	"severity" "alert_severity" DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"is_dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_reserves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"owner" "account_owner" DEFAULT 'self' NOT NULL,
	"name" text NOT NULL,
	"account_type" "cash_account_type" NOT NULL,
	"institution" text,
	"balance" numeric(20, 2) NOT NULL,
	"interest_rate" numeric(5, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"owner" "account_owner" NOT NULL,
	"account_id" uuid,
	"label" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"contribution_method" "contribution_method" NOT NULL,
	"contribution_percent" numeric(5, 2),
	"contribution_amount" numeric(20, 2),
	"frequency" "contribution_frequency" DEFAULT 'per_paycheck_biweekly' NOT NULL,
	"has_annual_escalation" boolean DEFAULT false,
	"annual_escalation_amount" numeric(10, 2),
	"max_annual_contribution" numeric(20, 2),
	"has_employer_match" boolean DEFAULT false,
	"employer_match_rate" numeric(5, 2),
	"employer_match_max_percent" numeric(5, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"owner" "account_owner" DEFAULT 'self' NOT NULL,
	"name" text NOT NULL,
	"debt_type" "debt_type" NOT NULL,
	"original_balance" numeric(20, 2),
	"current_balance" numeric(20, 2) NOT NULL,
	"interest_rate" numeric(5, 2) NOT NULL,
	"monthly_payment" numeric(10, 2) NOT NULL,
	"payoff_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"name" text NOT NULL,
	"target_amount" numeric(20, 2) NOT NULL,
	"current_amount" numeric(20, 2) DEFAULT '0',
	"target_date" date,
	"category" text DEFAULT 'retirement',
	"is_completed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"shares" numeric(20, 8) NOT NULL,
	"cost_basis_per_share" numeric(20, 4) NOT NULL,
	"current_price" numeric(20, 4) NOT NULL,
	"current_value" numeric(20, 2) NOT NULL,
	"last_price_update" timestamp,
	"data_source" "data_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"clerk_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'My Household' NOT NULL,
	"primary_clerk_id" text NOT NULL,
	"invite_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "households_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "irs_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tax_year" integer NOT NULL,
	"account_type" text NOT NULL,
	"limit_under_50" numeric(10, 2) NOT NULL,
	"limit_over_50" numeric(10, 2) NOT NULL,
	"limit_age_60_to_63" numeric(10, 2),
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"item_id" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"institution_name" text NOT NULL,
	"status" "plaid_item_status" DEFAULT 'active' NOT NULL,
	"last_sync" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plaid_items_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_value" numeric(20, 2) NOT NULL,
	"self_value" numeric(20, 2),
	"spouse_value" numeric(20, 2),
	"allocation" jsonb,
	"top_holdings" jsonb,
	"daily_change" numeric(20, 2),
	"daily_change_pct" numeric(10, 4),
	"ytd_return_pct" numeric(10, 4),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "real_estate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"owner" "account_owner" DEFAULT 'self' NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"estimated_value" numeric(20, 2) NOT NULL,
	"mortgage_balance" numeric(20, 2) DEFAULT '0',
	"mortgage_rate" numeric(5, 3),
	"monthly_payment" numeric(10, 2),
	"is_primary_residence" boolean DEFAULT true,
	"last_valuation_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_security_benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"owner" "account_owner" NOT NULL,
	"benefit_at_age_62" numeric(10, 2),
	"benefit_at_fra" numeric(10, 2),
	"benefit_at_age_70" numeric(10, 2),
	"full_retirement_age" integer,
	"planned_claiming_age" integer,
	"is_claiming" boolean DEFAULT false,
	"current_monthly_benefit" numeric(10, 2),
	"claiming_start_date" date,
	"eligible_for_spousal_benefit" boolean DEFAULT false,
	"spousal_benefit_amount" numeric(10, 2),
	"assumed_cola_pct" numeric(5, 2) DEFAULT '2.5',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"holding_id" uuid,
	"type" "transaction_type" NOT NULL,
	"ticker" text,
	"shares" numeric(20, 8),
	"price_per_share" numeric(20, 4),
	"amount" numeric(20, 2) NOT NULL,
	"date" date NOT NULL,
	"description" text,
	"data_source" "data_source" DEFAULT 'manual' NOT NULL,
	"plaid_transaction_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"current_age" integer,
	"retirement_age" integer,
	"first_name" text,
	"spouse_name" text,
	"spouse_current_age" integer,
	"spouse_retirement_age" integer,
	"spouse_is_retired" boolean DEFAULT false,
	"ai_provider" text DEFAULT 'anthropic',
	"annual_salary" numeric(20, 2),
	"spouse_annual_salary" numeric(20, 2),
	"salary_growth" jsonb,
	"spouse_salary_growth" jsonb,
	"projection_ss_claim_age_self" integer,
	"projection_ss_claim_age_spouse" integer,
	"projection_monthly_spending" numeric(10, 2),
	"projection_withdrawal_rate" numeric(5, 2),
	"projection_max_withdrawal_amount" numeric(20, 2),
	"projection_retirement_years" integer,
	"projection_market_scenario" text,
	"projection_withdrawal_method" text,
	"glide_path_enabled" boolean DEFAULT false,
	"glide_path_start_profile" text,
	"glide_path_end_profile" text,
	"glide_path_transition_start_age" integer,
	"glide_path_transition_end_age" integer,
	"glide_path_curve" text,
	"filing_status" "filing_status" DEFAULT 'married_filing_jointly',
	"risk_tolerance" "risk_tolerance" DEFAULT 'moderate',
	"target_allocation" jsonb,
	"annual_contribution" numeric(20, 2),
	"spouse_annual_contribution" numeric(20, 2),
	"monthly_expenses_retirement" numeric(20, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"owner" "account_owner" DEFAULT 'self' NOT NULL,
	"name" text NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"year" integer,
	"make" text,
	"model" text,
	"trim" text,
	"vin" text,
	"mileage" integer,
	"condition" text,
	"estimated_value" numeric(20, 2) NOT NULL,
	"last_valuation_date" date,
	"has_loan" boolean DEFAULT false,
	"loan_balance" numeric(20, 2) DEFAULT '0',
	"loan_rate" numeric(5, 3),
	"loan_monthly_payment" numeric(10, 2),
	"loan_remaining_months" integer,
	"purchase_price" numeric(20, 2),
	"purchase_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "snapshots_clerk_date_idx" ON "portfolio_snapshots" USING btree ("clerk_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "transactions" USING btree ("account_id","date");