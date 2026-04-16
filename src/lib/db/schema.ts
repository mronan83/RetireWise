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
  costBasisPerShare: decimal("cost_basis_per_share", {
    precision: 20,
    scale: 4,
  }).notNull(),
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

  // Income
  annualSalary: decimal("annual_salary", { precision: 20, scale: 2 }),
  spouseAnnualSalary: decimal("spouse_annual_salary", {
    precision: 20,
    scale: 2,
  }),

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

  // What this contribution is for
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

  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Net Worth: Real Estate
export const realEstate = pgTable("real_estate", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull(),
  owner: accountOwnerEnum("owner").notNull().default("self"),
  name: text("name").notNull(),
  estimatedValue: decimal("estimated_value", { precision: 20, scale: 2 }).notNull(),
  mortgageBalance: decimal("mortgage_balance", { precision: 20, scale: 2 }).default("0"),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
