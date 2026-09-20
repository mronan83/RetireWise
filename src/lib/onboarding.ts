import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { accounts, contributions, holdings, userPreferences } from "./db/schema";

/**
 * How far a household has got with setting RetireWise up.
 *
 * Every setup decision currently lives in the head of the person who built
 * this. A projection needs an age, a retirement target, a balance and a
 * contribution before it means anything — and until it has them it still
 * renders, with a number on it, which is worse than rendering nothing. The
 * steps below are the inputs that make the output trustworthy, in the order
 * that each one unblocks the next.
 */

export type StepId =
  | "profile"
  | "income"
  | "accounts"
  | "balances"
  | "contributions"
  | "projection";

export type Step = {
  id: StepId;
  title: string;
  /** Why this step changes what the app can tell you. */
  why: string;
  href: string;
  action: string;
  done: boolean;
  /** Shown when done, so the checklist reflects reality rather than ticks. */
  detail?: string;
  /** A step the projection is wrong without, as opposed to poorer without. */
  required: boolean;
};

export type OnboardingState = {
  steps: Step[];
  completed: number;
  total: number;
  /**
   * What to do next: the first unfinished step that a trustworthy projection
   * requires, and only then the first optional one. Ordering by position
   * alone would point someone at their salary while their contributions are
   * still missing — steering them toward the step that does not block.
   */
  next: Step | null;
  /** True when the household has done nothing at all. */
  empty: boolean;
  /** True when a projection would be built on enough to be worth believing. */
  projectionTrustworthy: boolean;
};

export async function getOnboardingState(clerkId: string): Promise<OnboardingState> {
  const db = getDb();

  const [prefsRows, accountRows, holdingCount, contributionRows] = await Promise.all([
    db.select().from(userPreferences).where(eq(userPreferences.clerkId, clerkId)).limit(1),
    db.select().from(accounts).where(eq(accounts.clerkId, clerkId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(holdings)
      .innerJoin(accounts, eq(holdings.accountId, accounts.id))
      .where(eq(accounts.clerkId, clerkId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(contributions)
      .where(and(eq(contributions.clerkId, clerkId), isNotNull(contributions.isActive))),
  ]);

  const prefs = prefsRows[0];
  const accountCount = accountRows.length;
  const holdings_ = holdingCount[0]?.n ?? 0;
  const contributionCount = contributionRows[0]?.n ?? 0;

  const hasProfile = Boolean(prefs?.currentAge && prefs?.retirementAge);
  const hasIncome = Boolean(prefs?.annualSalary);
  const hasAccounts = accountCount > 0;
  const hasBalances = holdings_ > 0;
  const hasContributions = contributionCount > 0;

  const steps: Step[] = [
    {
      id: "profile",
      title: "Your age and retirement target",
      why: "Everything is measured in years from now to then. Without both, there is no timeline to project along.",
      href: "/settings",
      action: "Open Settings",
      done: hasProfile,
      detail: hasProfile
        ? `Age ${prefs?.currentAge}, retiring at ${prefs?.retirementAge}`
        : undefined,
      required: true,
    },
    {
      id: "income",
      title: "Your salary",
      why: "Contributions set as a percentage need it, and so does anything about what you can afford to save.",
      href: "/settings",
      action: "Open Settings",
      done: hasIncome,
      detail: hasIncome
        ? `$${Math.round(Number(prefs?.annualSalary)).toLocaleString()}`
        : undefined,
      required: false,
    },
    {
      id: "accounts",
      title: "Add your first account",
      why: "Link a bank or brokerage for balances that update themselves, or add one by hand. Both work the same everywhere else.",
      href: "/accounts",
      action: "Add an account",
      done: hasAccounts,
      detail: hasAccounts
        ? `${accountCount} account${accountCount === 1 ? "" : "s"}`
        : undefined,
      required: true,
    },
    {
      id: "balances",
      title: "Get what is in them",
      why: "A linked account fills itself. A manual one needs holdings entered or a CSV imported, or the projection starts from zero.",
      href: "/import",
      action: "Import holdings",
      done: hasBalances,
      detail: hasBalances
        ? `${holdings_} holding${holdings_ === 1 ? "" : "s"}`
        : undefined,
      required: true,
    },
    {
      id: "contributions",
      title: "What you contribute",
      why: "The single biggest lever on the outcome. Without it the projection assumes you never save another dollar.",
      href: "/settings",
      action: "Add contributions",
      done: hasContributions,
      detail: hasContributions
        ? `${contributionCount} record${contributionCount === 1 ? "" : "s"}`
        : undefined,
      required: true,
    },
    {
      id: "projection",
      title: "See where it lands",
      why: "Run it, change one assumption, and watch what moves. That is the whole point of the thing.",
      href: "/projections",
      action: "Open Projections",
      // Not something to tick off — it is done when the inputs it needs exist.
      done: hasProfile && hasAccounts && hasBalances && hasContributions,
      required: false,
    },
  ];

  const completed = steps.filter((s) => s.done).length;

  return {
    steps,
    completed,
    total: steps.length,
    next:
      steps.find((s) => !s.done && s.required) ??
      steps.find((s) => !s.done) ??
      null,
    empty: !hasProfile && !hasAccounts && !hasBalances,
    projectionTrustworthy: steps.filter((s) => s.required).every((s) => s.done),
  };
}
