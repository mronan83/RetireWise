export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  "401k": "401(k)",
  "403b": "403(b)",
  ira_traditional: "Traditional IRA",
  ira_roth: "Roth IRA",
  brokerage: "Brokerage",
  hsa: "HSA",
  "529": "529 Plan",
  pension: "Pension",
  annuity: "Annuity",
  social_security: "Social Security",
  other: "Other",
};

export const ACCOUNT_OWNER_LABELS: Record<string, string> = {
  self: "Mine",
  spouse: "Spouse",
};

export const FILING_STATUS_LABELS: Record<string, string> = {
  married_filing_jointly: "Married Filing Jointly",
  married_filing_separately: "Married Filing Separately",
  single: "Single",
};

export const TAX_TREATMENT_LABELS: Record<string, string> = {
  tax_deferred: "Tax-Deferred (pay taxes on withdrawal)",
  tax_free: "Tax-Free (already taxed or exempt)",
  taxable: "Taxable (pay taxes yearly on gains)",
};

// Auto-suggest tax treatment based on account type
export const ACCOUNT_TYPE_DEFAULT_TAX: Record<string, string> = {
  "401k": "tax_deferred",
  "403b": "tax_deferred",
  ira_traditional: "tax_deferred",
  ira_roth: "tax_free",
  brokerage: "taxable",
  hsa: "tax_free",
  "529": "tax_free",
  pension: "tax_deferred",
  annuity: "tax_deferred",
  social_security: "taxable",
  other: "taxable",
};

export const ASSET_CLASS_LABELS: Record<string, string> = {
  us_stock: "US Stocks",
  intl_stock: "International Stocks",
  bond: "Bonds",
  reit: "REITs",
  commodity: "Commodities",
  crypto: "Crypto",
  cash: "Cash",
  other: "Other",
};

export const ASSET_CLASS_COLORS: Record<string, string> = {
  us_stock: "#6366f1",
  intl_stock: "#22c55e",
  bond: "#f59e0b",
  reit: "#a855f7",
  commodity: "#f97316",
  crypto: "#ec4899",
  cash: "#64748b",
  other: "#94a3b8",
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  contribution: "Contribution",
  withdrawal: "Withdrawal",
  fee: "Fee",
  transfer: "Transfer",
  split: "Stock Split",
};

export const DEFAULT_TARGET_ALLOCATION = {
  us_stock: 50,
  intl_stock: 20,
  bond: 20,
  reit: 5,
  cash: 5,
};

// 2025 IRS contribution limits (employee portion only)
// under50: standard limit; over50: standard + catch-up ($7,500 for 401k/403b, $1,000 for IRA/HSA)
// age60to63: SECURE 2.0 enhanced catch-up ($11,250 for 401k/403b instead of $7,500)
export const IRS_LIMITS: Record<string, { under50: number; over50: number; age60to63: number; label: string }> = {
  "401k": { under50: 23500, over50: 31000, age60to63: 34750, label: "401(k) limit" },
  "403b": { under50: 23500, over50: 31000, age60to63: 34750, label: "403(b) limit" },
  ira_traditional: { under50: 7000, over50: 8000, age60to63: 8000, label: "Traditional IRA limit" },
  ira_roth: { under50: 7000, over50: 8000, age60to63: 8000, label: "Roth IRA limit" },
  hsa: { under50: 4300, over50: 5550, age60to63: 5550, label: "HSA limit (family)" },
};

/**
 * Get the IRS contribution limit for a given account type and owner age.
 */
export function getIrsLimitForAge(accountType: string, age: number): number {
  const limits = IRS_LIMITS[accountType];
  if (!limits) return 0;
  if (age >= 60 && age <= 63) return limits.age60to63;
  if (age >= 50) return limits.over50;
  return limits.under50;
}

export const AI_MODEL = "anthropic/claude-sonnet-4.6";

export const AI_DISCLAIMER =
  "This analysis is for informational purposes only and does not constitute financial advice. Please consult a qualified financial advisor before making investment decisions.";
