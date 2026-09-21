import {
  pgTable,
  uuid,
  text,
  timestamp,
  decimal,
  integer,
  boolean,
  date,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

// Enums
export const accountOwnerEnum = pgEnum("account_owner", ["self", "spouse"]);

export const accountTypeEnum = pgEnum("account_type", [
  "401k",
  "403b",
  "ira_traditional",
  "ira_roth",
  "brokerage",
  "hsa",
  "529",
  "pension",
  "annuity",
  "social_security",
  "other",
]);

export const taxTreatmentEnum = pgEnum("tax_treatment", [
  "tax_deferred",
  "tax_free",
  "taxable",
]);

export const dataSourceEnum = pgEnum("data_source", [
  "manual",
  "csv_import",
  "plaid",
]);

export const assetClassEnum = pgEnum("asset_class", [
  "us_stock",
  "intl_stock",
  "bond",
  "reit",
  "commodity",
  "crypto",
  "cash",
  "other",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "buy",
  "sell",
  "dividend",
  "contribution",
  "withdrawal",
  "fee",
  "transfer",
  "split",
]);

export const riskToleranceEnum = pgEnum("risk_tolerance", [
  "conservative",
  "moderate",
  "aggressive",
]);

export const analysisTypeEnum = pgEnum("analysis_type", [
  "portfolio_review",
  "rebalance_suggestion",
  "tax_harvest",
  "retirement_projection",
  "social_security_analysis",
  "custom",
]);

export const plaidItemStatusEnum = pgEnum("plaid_item_status", [
  "active",
  "error",
  "requires_reauth",
]);

export const contributionMethodEnum = pgEnum("contribution_method", [
  "percent_of_salary",
  "fixed_amount",
]);

// How employer money becomes the employee's to keep. Vesting never changes
// what lands in the account, only what survives leaving the job, so it is
// reported separately from every contribution figure.
export const vestingScheduleEnum = pgEnum("vesting_schedule", [
  "immediate",
  "cliff",
  "graded",
]);

export const contributionFrequencyEnum = pgEnum("contribution_frequency", [
  "per_paycheck_biweekly",
  "per_paycheck_semimonthly",
  "monthly",
  "quarterly",
  "annually",
]);

export const debtTypeEnum = pgEnum("debt_type", [
  "mortgage",
  "auto_loan",
  "student_loan",
  "heloc",
  "personal_loan",
  "credit_card",
  "other_debt",
]);

export const vehicleTypeEnum = pgEnum("vehicle_type", [
  "car",
  "truck",
  "suv",
  "motorcycle",
  "boat",
  "rv",
  "camper",
  "atv",
  "other_vehicle",
]);

export const cashAccountTypeEnum = pgEnum("cash_account_type", [
  "checking",
  "savings",
  "high_yield_savings",
  "money_market",
  "cd",
  "ibonds",
  "emergency_fund",
  "other_cash",
]);

export const filingStatusEnum = pgEnum("filing_status", [
  "married_filing_jointly",
  "married_filing_separately",
  "single",
]);

// Households — links multiple auth users to one shared dataset
export const households = pgTable("households", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().default("My Household"),
  primaryClerkId: text("primary_clerk_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * One row per invitation issued, holding a hash rather than the code.
 *
 * This replaced a single `invite_code` column on the household that was
 * generated with Math.random(), never expired, could be redeemed any number of
 * times, and was the only thing standing between a stranger and a family's
 * complete financial position. Math.random() is not a cryptographic generator:
 * its internal state is recoverable from a handful of outputs, so codes from
 * one household could be used to predict another's.
 *
 * Storing the hash means a copy of this table is not a set of working
 * invitations. The plaintext is shown once, at creation, and never again.
 */
export const householdInvites = pgTable(
  "household_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .references(() => households.id, { onDelete: "cascade" })
      .notNull(),
    /** SHA-256 of the normalised code. */
    codeHash: text("code_hash").unique().notNull(),
    /** Last four characters, so two pending invites can be told apart. */
    codeHint: text("code_hint").notNull(),
    createdBy: text("created_by").notNull(),
    /** Free-text note from the issuer, e.g. who it is for. */
    label: text("label"),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    usedBy: text("used_by"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("household_invites_household_idx").on(table.householdId)]
);

/**
 * Every attempt to redeem an invite, successful or not.
 *
 * Backs a rate limit that does not depend on Redis being configured. Redis is
 * optional in this app, and a limiter that silently disappears when its
 * backing store is absent is not a limit — it is a comment.
 */
export const householdJoinAttempts = pgTable(
  "household_join_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkId: text("clerk_id").notNull(),
    succeeded: boolean("succeeded").notNull().default(false),
    attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  },
  (table) => [
    index("household_join_attempts_clerk_idx").on(table.clerkId, table.attemptedAt),
  ]
);

export const householdMembers = pgTable("household_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .references(() => households.id, { onDelete: "cascade" })
    .notNull(),
  clerkId: text("clerk_id").notNull(),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

// Tables
export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  owner: accountOwnerEnum("owner").notNull().default("self"),
  name: text("name").notNull(),
  institution: text("institution").notNull(),
  accountType: accountTypeEnum("account_type").notNull(),
  taxTreatment: taxTreatmentEnum("tax_treatment").notNull(),
  plaidItemId: text("plaid_item_id"),
  plaidAccountId: text("plaid_account_id"),
  dataSource: dataSourceEnum("data_source").notNull().default("manual"),
  isActive: boolean("is_active").notNull().default(true),
  isActivelyContributing: boolean("is_actively_contributing").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const holdings = pgTable("holdings", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .references(() => accounts.id, { onDelete: "cascade" })
    .notNull(),
  ticker: text("ticker").notNull(),
  name: text("name").notNull(),
  assetClass: assetClassEnum("asset_class").notNull(),
  shares: decimal("shares", { precision: 20, scale: 8 }).notNull(),
  /**
   * NULL means the provider did not report one, not that it is zero.
   *
   * It was NOT NULL, and the Plaid sync filled the gap with
   * `shares * currentPrice`. That is a number the app invented and then
   * stored as fact: every 401(k) position came back showing exactly $0.00
   * of gain, and a later sync that lacked cost basis overwrote a real one
   * that an earlier sync had recorded. Three accounts lost their true
   * basis that way. There is no value in this column that can mean
   * "unknown" — so the column has to allow none at all.
   */
  costBasisPerShare: decimal("cost_basis_per_share", {
    precision: 20,
    scale: 4,
  }),
  currentPrice: decimal("current_price", {
    precision: 20,
    scale: 4,
  }).notNull(),
  currentValue: decimal("current_value", {
    precision: 20,
    scale: 2,
  }).notNull(),
  lastPriceUpdate: timestamp("last_price_update"),
  dataSource: dataSourceEnum("data_source").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    holdingId: uuid("holding_id").references(() => holdings.id, {
      onDelete: "set null",
    }),
    type: transactionTypeEnum("type").notNull(),
    ticker: text("ticker"),
    shares: decimal("shares", { precision: 20, scale: 8 }),
    pricePerShare: decimal("price_per_share", { precision: 20, scale: 4 }),
    amount: decimal("amount", { precision: 20, scale: 2 }).notNull(),
    date: date("date").notNull(),
    description: text("description"),
    dataSource: dataSourceEnum("data_source").notNull().default("manual"),
    plaidTransactionId: text("plaid_transaction_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("transactions_account_date_idx").on(table.accountId, table.date),
  ]
);

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkId: text("clerk_id").notNull(),
    snapshotDate: date("snapshot_date").notNull(),
    totalValue: decimal("total_value", { precision: 20, scale: 2 }).notNull(),
    selfValue: decimal("self_value", { precision: 20, scale: 2 }),
    spouseValue: decimal("spouse_value", { precision: 20, scale: 2 }),
    allocation: jsonb("allocation"),
    topHoldings: jsonb("top_holdings"),
    dailyChange: decimal("daily_change", { precision: 20, scale: 2 }),
    dailyChangePct: decimal("daily_change_pct", { precision: 10, scale: 4 }),
    ytdReturnPct: decimal("ytd_return_pct", { precision: 10, scale: 4 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("snapshots_clerk_date_idx").on(table.clerkId, table.snapshotDate),
  ]
);

export const aiAnalyses = pgTable("ai_analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  type: analysisTypeEnum("type").notNull(),
  promptSummary: text("prompt_summary"),
  result: jsonb("result"),
  modelUsed: text("model_used"),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const plaidItems = pgTable("plaid_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  itemId: text("item_id").unique().notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  institutionName: text("institution_name").notNull(),
  status: plaidItemStatusEnum("status").notNull().default("active"),
  lastSync: timestamp("last_sync"),

  /**
   * Retry state.
   *
   * The refresh job used to set status to "error" on any failure and then
   * select only "active" items — so one transient network blip stopped an
   * account refreshing permanently, and the dashboard went on showing the
   * stale figure as though it were current. Failures are now counted and
   * retried with a widening gap; only repeated failure moves an item to
   * requires_reauth, which is the one state that genuinely needs a person.
   */
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at"),
  nextAttemptAt: timestamp("next_attempt_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").unique().notNull(),

  // Self details
  currentAge: integer("current_age"),
  retirementAge: integer("retirement_age"),
  firstName: text("first_name"),

  // Spouse details
  spouseName: text("spouse_name"),
  spouseCurrentAge: integer("spouse_current_age"),
  spouseRetirementAge: integer("spouse_retirement_age"),
  spouseIsRetired: boolean("spouse_is_retired").default(false),

  // AI provider preference
  aiProvider: text("ai_provider").default("anthropic"),
  anthropicModel: text("anthropic_model"),
  // Encrypted API keys (user-provided, optional — falls back to env vars)
  anthropicApiKey: text("anthropic_api_key"),
  googleApiKey: text("google_api_key"),
  openaiApiKey: text("openai_api_key"),

  // Income
  annualSalary: decimal("annual_salary", { precision: 20, scale: 2 }),
  spouseAnnualSalary: decimal("spouse_annual_salary", {
    precision: 20,
    scale: 2,
  }),

  // Salary growth projections (JSONB for flexibility)
  // Format: { method: "pct_per_year" | "target_by_year" | "pct_for_years",
  //           value: number, years: number, targetAmount?: number }
  salaryGrowth: jsonb("salary_growth"),
  spouseSalaryGrowth: jsonb("spouse_salary_growth"),

  // Persisted projection controls
  projectionSSClaimAgeSelf: integer("projection_ss_claim_age_self"),
  projectionSSClaimAgeSpouse: integer("projection_ss_claim_age_spouse"),
  projectionMonthlySpending: decimal("projection_monthly_spending", { precision: 10, scale: 2 }),
  projectionWithdrawalRate: decimal("projection_withdrawal_rate", { precision: 5, scale: 2 }),
  projectionMaxWithdrawalAmount: decimal("projection_max_withdrawal_amount", { precision: 20, scale: 2 }),
  projectionRetirementYears: integer("projection_retirement_years"),
  projectionMarketScenario: text("projection_market_scenario"),
  projectionWithdrawalMethod: text("projection_withdrawal_method"),

  // Glide path rebalancing
  glidePathEnabled: boolean("glide_path_enabled").default(false),
  glidePathStartProfile: text("glide_path_start_profile"), // risk profile id
  glidePathEndProfile: text("glide_path_end_profile"),
  glidePathTransitionStartAge: integer("glide_path_transition_start_age"),
  glidePathTransitionEndAge: integer("glide_path_transition_end_age"),
  glidePathCurve: text("glide_path_curve"), // "linear" | "accelerated"

  // Catch-up contributions
  catchUpEnabled: boolean("catch_up_enabled").default(true),

  // Household
  filingStatus: filingStatusEnum("filing_status").default(
    "married_filing_jointly"
  ),
  riskTolerance: riskToleranceEnum("risk_tolerance").default("moderate"),
  targetAllocation: jsonb("target_allocation"),
  annualContribution: decimal("annual_contribution", {
    precision: 20,
    scale: 2,
  }),
  spouseAnnualContribution: decimal("spouse_annual_contribution", {
    precision: 20,
    scale: 2,
  }),
  monthlyExpensesRetirement: decimal("monthly_expenses_retirement", {
    precision: 20,
    scale: 2,
  }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const socialSecurityBenefits = pgTable("social_security_benefits", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  owner: accountOwnerEnum("owner").notNull(),

  // Estimated monthly benefits at key claiming ages
  benefitAtAge62: decimal("benefit_at_age_62", {
    precision: 10,
    scale: 2,
  }),
  benefitAtFRA: decimal("benefit_at_fra", {
    precision: 10,
    scale: 2,
  }),
  benefitAtAge70: decimal("benefit_at_age_70", {
    precision: 10,
    scale: 2,
  }),

  // Full Retirement Age (FRA) — varies by birth year
  fullRetirementAge: integer("full_retirement_age"),

  // Planned claiming age
  plannedClaimingAge: integer("planned_claiming_age"),

  // If already claiming
  isClaiming: boolean("is_claiming").default(false),
  currentMonthlyBenefit: decimal("current_monthly_benefit", {
    precision: 10,
    scale: 2,
  }),
  claimingStartDate: date("claiming_start_date"),

  // Spousal benefit eligibility (50% of spouse's FRA benefit)
  eligibleForSpousalBenefit: boolean("eligible_for_spousal_benefit").default(
    false
  ),
  spousalBenefitAmount: decimal("spousal_benefit_amount", {
    precision: 10,
    scale: 2,
  }),

  // COLA (Cost of Living Adjustment) assumption
  assumedCOLAPct: decimal("assumed_cola_pct", {
    precision: 5,
    scale: 2,
  }).default("2.5"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const alertTypeEnum = pgEnum("alert_type", [
  "allocation_drift",
  "large_daily_move",
  "concentration_risk",
  "milestone_reached",
  "rebalance_needed",
  "goal_progress",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "info",
  "warning",
  "critical",
]);

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  type: alertTypeEnum("type").notNull(),
  severity: alertSeverityEnum("severity").notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"),
  isDismissed: boolean("is_dismissed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const goals = pgTable("goals", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  name: text("name").notNull(),
  targetAmount: decimal("target_amount", { precision: 20, scale: 2 }).notNull(),
  currentAmount: decimal("current_amount", { precision: 20, scale: 2 }).default("0"),
  targetDate: date("target_date"),
  category: text("category").default("retirement"),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contributions = pgTable("contributions", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  owner: accountOwnerEnum("owner").notNull(),

  // What this contribution is for — linked to a specific account
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  label: text("label").notNull(),
  accountType: accountTypeEnum("account_type").notNull(),

  // Your contribution
  contributionMethod: contributionMethodEnum("contribution_method").notNull(),
  // If percent_of_salary: the percentage (e.g., 6 for 6%)
  contributionPercent: decimal("contribution_percent", {
    precision: 5,
    scale: 2,
  }),
  // If fixed_amount: the dollar amount per frequency period
  contributionAmount: decimal("contribution_amount", {
    precision: 20,
    scale: 2,
  }),
  frequency: contributionFrequencyEnum("frequency")
    .notNull()
    .default("per_paycheck_biweekly"),

  // Annual escalation (auto-increase)
  hasAnnualEscalation: boolean("has_annual_escalation").default(false),
  // How much to increase per year (e.g., 1 = +1% of salary per year for percent method, or +$500/yr for fixed)
  annualEscalationAmount: decimal("annual_escalation_amount", {
    precision: 10,
    scale: 2,
  }),
  // Max annual contribution cap (e.g., IRS 401k limit $23,500 for 2025)
  maxAnnualContribution: decimal("max_annual_contribution", {
    precision: 20,
    scale: 2,
  }),

  // Employer match (optional — only applies to employer-sponsored plans)
  hasEmployerMatch: boolean("has_employer_match").default(false),
  // Match formula: employer matches at this rate (e.g., 1.0 = dollar for dollar, 0.5 = 50 cents per dollar)
  employerMatchRate: decimal("employer_match_rate", {
    precision: 5,
    scale: 2,
  }),
  // Max % of salary the employer will match (e.g., 5 means they match up to 5% of salary)
  employerMatchMaxPercent: decimal("employer_match_max_percent", {
    precision: 5,
    scale: 2,
  }),

  // Employer money that does not depend on the employee deferring anything —
  // a safe-harbor non-elective or profit-sharing contribution. Separate from
  // the match because it is paid at 0% deferral, so folding it into the match
  // fields would make it disappear the moment someone stops contributing.
  hasEmployerNonElective: boolean("has_employer_non_elective").default(false),
  // Percent of salary (e.g., 2 for "2% no matter what")
  employerNonElectivePercent: decimal("employer_non_elective_percent", {
    precision: 5,
    scale: 2,
  }),
  // Flat dollars per year, for plans that state it that way instead
  employerNonElectiveAmount: decimal("employer_non_elective_amount", {
    precision: 20,
    scale: 2,
  }),

  // Vesting of employer money
  vestingSchedule: vestingScheduleEnum("vesting_schedule")
    .notNull()
    .default("immediate"),
  // Years to 100% — the cliff year, or the length of the graded ramp
  vestingYears: integer("vesting_years"),
  // Date service began, which is what years-of-service is counted from
  serviceStartDate: date("service_start_date"),

  isActive: boolean("is_active").notNull().default(true),
  // When this stopped applying — a job left or a plan changed. Kept rather
  // than deleted so past years still explain themselves.
  endedOn: date("ended_on"),

  // A pause is not an ending. Cash flow tightens, contributions stop for a
  // while, and they start again — the entry is still true, it is just not
  // funding anything this month. Expressing that as "ended" loses the intent
  // and expressing it as active overstates every projection that follows.
  pausedFrom: date("paused_from"),
  // When contributions resume. Null means "paused, no date yet", which
  // projects as paused for good until a date is set — the cautious reading.
  resumesOn: date("resumes_on"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Per-account daily snapshots (for time-period performance tracking)
/**
 * Per-position shares and price, daily.
 *
 * The piece that makes real performance possible. An account's value can
 * rise because the market rose or because money was paid in, and the two
 * are indistinguishable from the value alone — which is why the period
 * figures on the cards were balance change rather than return.
 *
 * Share counts separate them without any transaction feed: shares that
 * increase between two days are a purchase, and the cash that bought them
 * is an external flow to be excluded from return. That is all a
 * time-weighted return needs.
 */
export const holdingSnapshots = pgTable(
  "holding_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkId: text("clerk_id").notNull(),
    accountId: uuid("account_id").notNull(),
    snapshotDate: date("snapshot_date").notNull(),
    ticker: text("ticker").notNull(),
    shares: decimal("shares", { precision: 20, scale: 8 }).notNull(),
    price: decimal("price", { precision: 20, scale: 4 }).notNull(),
    value: decimal("value", { precision: 20, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("holding_snapshots_unique_idx").on(
      table.accountId,
      table.snapshotDate,
      table.ticker
    ),
    index("holding_snapshots_account_date_idx").on(table.accountId, table.snapshotDate),
    index("holding_snapshots_clerk_date_idx").on(table.clerkId, table.snapshotDate),
  ]
);

export const accountSnapshots = pgTable("account_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  accountId: uuid("account_id").notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  value: decimal("value", { precision: 20, scale: 2 }).notNull(),
  // NULL when any holding in the account had no reported basis. A partial
  // sum understates cost and overstates gain, which reads as a good day.
  costBasis: decimal("cost_basis", { precision: 20, scale: 2 }),
  gainLoss: decimal("gain_loss", { precision: 20, scale: 2 }),
  gainLossPct: decimal("gain_loss_pct", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("account_snapshots_account_date_idx").on(table.accountId, table.snapshotDate),
  index("account_snapshots_clerk_date_idx").on(table.clerkId, table.snapshotDate),
]);

// IRS Contribution Limits (updated annually)
export const irsLimits = pgTable("irs_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  taxYear: integer("tax_year").notNull(),
  accountType: text("account_type").notNull(), // "401k", "ira", "hsa", etc.
  limitUnder50: decimal("limit_under_50", { precision: 10, scale: 2 }).notNull(),
  limitOver50: decimal("limit_over_50", { precision: 10, scale: 2 }).notNull(),
  limitAge60to63: decimal("limit_age_60_to_63", { precision: 10, scale: 2 }),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Federal tax brackets, IRMAA tiers, and the Medicare/healthcare base costs.
 *
 * Shared reference data like irs_limits: the same figures for every
 * household, owned by none of them. Kept out of irs_limits because that
 * table is shaped around contribution limits — limit_under_50 /
 * limit_over_50 / limit_age_60_to_63 keyed by account type — which fits a
 * 401(k) cap and fits nothing here.
 *
 * Tiered kinds (bracket_mfj, irmaa_part_b_mfj, irmaa_part_d_mfj) use
 * `ordinal` for position and `threshold` for the top of the tier, where
 * NULL means unbounded. Scalar kinds (standard_deduction_mfj, the monthly
 * premiums) use ordinal 0 and leave `threshold` NULL, where it means
 * nothing. See src/lib/tax/table.ts.
 */
export const taxReference = pgTable(
  "tax_reference",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taxYear: integer("tax_year").notNull(),
    kind: text("kind").notNull(),
    ordinal: integer("ordinal").default(0).notNull(),
    // NULL = unbounded for a tiered kind, meaningless for a scalar kind.
    threshold: decimal("threshold", { precision: 14, scale: 2 }),
    // A rate as a fraction (0.22) or an amount in dollars, per `kind`.
    value: decimal("value", { precision: 14, scale: 4 }).notNull(),
    notes: text("notes"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tax_reference_year_kind_ordinal_idx").on(
      table.taxYear,
      table.kind,
      table.ordinal
    ),
  ]
);

// Net Worth: Real Estate
export const realEstate = pgTable("real_estate", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  owner: accountOwnerEnum("owner").notNull().default("self"),
  name: text("name").notNull(),
  address: text("address"),
  estimatedValue: decimal("estimated_value", { precision: 20, scale: 2 }).notNull(),
  mortgageBalance: decimal("mortgage_balance", { precision: 20, scale: 2 }).default("0"),
  mortgageRate: decimal("mortgage_rate", { precision: 5, scale: 3 }),
  monthlyPayment: decimal("monthly_payment", { precision: 10, scale: 2 }),
  isPrimaryResidence: boolean("is_primary_residence").default(true),
  lastValuationDate: date("last_valuation_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Net Worth: Cash Reserves
export const cashReserves = pgTable("cash_reserves", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  owner: accountOwnerEnum("owner").notNull().default("self"),
  name: text("name").notNull(),
  accountType: cashAccountTypeEnum("account_type").notNull(),
  institution: text("institution"),
  balance: decimal("balance", { precision: 20, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }),
  notes: text("notes"),
  // Filled when the balance comes from a linked institution rather than by
  // hand. Kept on the row rather than a join table so a manually entered
  // account and a linked one are the same kind of thing.
  plaidItemId: text("plaid_item_id"),
  plaidAccountId: text("plaid_account_id"),
  dataSource: dataSourceEnum("data_source").notNull().default("manual"),
  lastSyncedAt: timestamp("last_synced_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Net Worth: Debts
export const debts = pgTable("debts", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  owner: accountOwnerEnum("owner").notNull().default("self"),
  name: text("name").notNull(),
  debtType: debtTypeEnum("debt_type").notNull(),
  originalBalance: decimal("original_balance", { precision: 20, scale: 2 }),
  currentBalance: decimal("current_balance", { precision: 20, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  monthlyPayment: decimal("monthly_payment", { precision: 10, scale: 2 }).notNull(),
  payoffDate: date("payoff_date"),
  notes: text("notes"),
  // Filled when the balance comes from a linked institution rather than by
  // hand. Kept on the row rather than a join table so a manually entered
  // account and a linked one are the same kind of thing.
  plaidItemId: text("plaid_item_id"),
  plaidAccountId: text("plaid_account_id"),
  dataSource: dataSourceEnum("data_source").notNull().default("manual"),
  lastSyncedAt: timestamp("last_synced_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Net Worth: Vehicles (cars, trucks, boats, RVs, motorcycles, etc.)
export const vehicles = pgTable("vehicles", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  owner: accountOwnerEnum("owner").notNull().default("self"),
  name: text("name").notNull(), // e.g., "2022 Toyota Tacoma"
  vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
  year: integer("year"),
  make: text("make"),
  model: text("model"),
  trim: text("trim"),
  vin: text("vin"),
  mileage: integer("mileage"),
  condition: text("condition"), // excellent, good, fair, poor
  estimatedValue: decimal("estimated_value", { precision: 20, scale: 2 }).notNull(),
  lastValuationDate: date("last_valuation_date"),
  // Loan fields (null = no loan / paid off)
  hasLoan: boolean("has_loan").default(false),
  loanBalance: decimal("loan_balance", { precision: 20, scale: 2 }).default("0"),
  loanRate: decimal("loan_rate", { precision: 5, scale: 3 }),
  loanMonthlyPayment: decimal("loan_monthly_payment", { precision: 10, scale: 2 }),
  loanRemainingMonths: integer("loan_remaining_months"),
  purchasePrice: decimal("purchase_price", { precision: 20, scale: 2 }),
  purchaseDate: date("purchase_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Per-item value history (recorded on every create/update — one row per item per day)
export const netWorthItemHistory = pgTable(
  "net_worth_item_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkId: text("clerk_id").notNull(),
    itemType: text("item_type").notNull(), // "real_estate" | "cash_reserve" | "vehicle" | "debt"
    itemId: text("item_id").notNull(),
    itemName: text("item_name").notNull(),
    recordedDate: date("recorded_date").notNull(),
    // Primary value: estimatedValue (RE/vehicle), balance (cash), currentBalance (debt)
    value: decimal("value", { precision: 20, scale: 2 }).notNull(),
    // Secondary value: mortgageBalance (RE), loanBalance (vehicle), null otherwise
    secondaryValue: decimal("secondary_value", { precision: 20, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("nw_item_history_item_date_idx").on(table.itemId, table.recordedDate),
    index("nw_item_history_clerk_idx").on(table.clerkId),
  ]
);

// Daily snapshots of full household net worth (investments + real estate + cash + vehicles - debts)
export const netWorthSnapshots = pgTable(
  "net_worth_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkId: text("clerk_id").notNull(),
    snapshotDate: date("snapshot_date").notNull(),
    netWorth: decimal("net_worth", { precision: 20, scale: 2 }).notNull(),
    totalAssets: decimal("total_assets", { precision: 20, scale: 2 }).notNull(),
    investmentValue: decimal("investment_value", { precision: 20, scale: 2 }).notNull().default("0"),
    realEstateEquity: decimal("real_estate_equity", { precision: 20, scale: 2 }).notNull().default("0"),
    cashTotal: decimal("cash_total", { precision: 20, scale: 2 }).notNull().default("0"),
    vehicleEquity: decimal("vehicle_equity", { precision: 20, scale: 2 }).notNull().default("0"),
    totalDebts: decimal("total_debts", { precision: 20, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("net_worth_snapshots_clerk_date_idx").on(table.clerkId, table.snapshotDate),
  ]
);

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

/**
 * One row per household, holding whatever the billing provider last told us.
 *
 * The row is not the source of truth about what a household may do — that is
 * resolved in src/lib/billing/entitlements.ts, which can answer without this
 * row existing at all. Absent Stripe configuration the table stays empty and
 * every household resolves to the full free tier, which is the point: the
 * billing machinery ships dormant and turning it on is configuration, not a
 * migration.
 */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").unique().notNull(),

  planId: text("plan_id").notNull().default("free"),
  // Mirrors Stripe's subscription status vocabulary: active, trialing,
  // past_due, canceled, incomplete, incomplete_expired, unpaid, paused.
  status: text("status").notNull().default("active"),

  /**
   * Granted access that ignores billing entirely.
   *
   * Friends and family are comped. A comped household keeps full access on the
   * day Stripe is switched on, so enabling billing can never silently downgrade
   * someone who was already using the app.
   */
  comped: boolean("comped").notNull().default(false),
  compReason: text("comp_reason"),

  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

  /**
   * Stripe's `created` timestamp for the last event applied to this row.
   *
   * Webhooks arrive out of order often enough to matter: a cancellation
   * delivered before the update that preceded it would otherwise leave the row
   * describing a state the customer has already left. An older event is
   * ignored rather than applied.
   */
  lastEventAt: timestamp("last_event_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Every webhook Stripe has delivered, by its event id.
 *
 * Stripe retries on any non-2xx and can deliver the same event more than once
 * even on success. The unique constraint is the idempotency guard: a duplicate
 * insert fails, and the handler returns 200 without replaying the effect.
 */
export const billingEvents = pgTable("billing_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  stripeEventId: text("stripe_event_id").unique().notNull(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
});


// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Who did what, to whose data.
 *
 * Scoped to the household like everything else, so a member can see their own
 * household's history and nobody else's. The rows worth keeping are the ones
 * that change access or move money-shaped data: invitations, linked
 * institutions, stored API keys, deletions.
 *
 * Deliberately not a log of every read. A record nobody will ever read is a
 * storage bill, not an audit trail.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** The household the action affected. */
    clerkId: text("clerk_id").notNull(),
    /** The signed-in account that performed it, which differs for a spouse. */
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    detail: jsonb("detail"),
    at: timestamp("at").defaultNow().notNull(),
  },
  (table) => [index("audit_log_clerk_at_idx").on(table.clerkId, table.at)]
);

/**
 * One row per scheduled job run.
 *
 * Exists so /api/health/freshness can answer "is this data still being
 * refreshed" rather than only "is the server up". This app was down for 92
 * days without anyone noticing; a cron that quietly stops is the same failure
 * wearing different clothes, and nothing in the system would have shown it.
 */
export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    job: text("job").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    ok: boolean("ok"),
    processed: integer("processed").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    /** True when a time budget stopped the run before it ran out of work. */
    truncated: boolean("truncated").notNull().default(false),
    detail: jsonb("detail"),
  },
  (table) => [index("cron_runs_job_started_idx").on(table.job, table.startedAt)]
);
