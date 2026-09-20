import type { InferSelectModel } from "drizzle-orm";
import type {
  accounts,
  holdings,
  transactions,
  portfolioSnapshots,
  aiAnalyses,
  plaidItems,
  userPreferences,
  socialSecurityBenefits,
  contributions,
} from "./db/schema";

export type Account = InferSelectModel<typeof accounts>;
export type Holding = InferSelectModel<typeof holdings>;
export type Transaction = InferSelectModel<typeof transactions>;
export type PortfolioSnapshot = InferSelectModel<typeof portfolioSnapshots>;
export type AiAnalysis = InferSelectModel<typeof aiAnalyses>;
export type PlaidItem = InferSelectModel<typeof plaidItems>;
export type UserPreference = InferSelectModel<typeof userPreferences>;
export type SocialSecurityBenefit = InferSelectModel<
  typeof socialSecurityBenefits
>;
export type Contribution = InferSelectModel<typeof contributions>;

export type AccountOwner = "self" | "spouse";

export type AllocationMap = Record<string, number>;

export type TargetAllocation = Record<string, number>;

export type PortfolioSummary = {
  totalValue: number;
  selfValue: number;
  spouseValue: number;
  // Null when any position's basis is unknown — see lib/utils/cost-basis.
  totalCostBasis: number | null;
  totalGainLoss: number | null;
  totalGainLossPct: number | null;
  dailyChange: number;
  dailyChangePct: number;
  accountCount: number;
  holdingCount: number;
  allocation: Record<string, { value: number; pct: number }>;
};

export type HoldingWithAccount = Holding & {
  accountName: string;
  accountType: string;
  accountOwner: string;
  gainLoss: number;
  gainLossPct: number;
};

export type HouseholdSocialSecurity = {
  self: SocialSecurityBenefit | null;
  spouse: SocialSecurityBenefit | null;
  combinedMonthlyAtFRA: number;
  combinedAnnualAtFRA: number;
};
