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
  tax_deferred: "Tax-Deferred",
  tax_free: "Tax-Free",
  taxable: "Taxable",
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
  us_stock: "hsl(221, 83%, 53%)",
  intl_stock: "hsl(142, 71%, 45%)",
  bond: "hsl(47, 96%, 53%)",
  reit: "hsl(262, 83%, 58%)",
  commodity: "hsl(24, 95%, 53%)",
  crypto: "hsl(330, 81%, 60%)",
  cash: "hsl(210, 40%, 70%)",
  other: "hsl(0, 0%, 55%)",
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

export const AI_MODEL = "anthropic/claude-sonnet-4.6";

export const AI_DISCLAIMER =
  "This analysis is for informational purposes only and does not constitute financial advice. Please consult a qualified financial advisor before making investment decisions.";
