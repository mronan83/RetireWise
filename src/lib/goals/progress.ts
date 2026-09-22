/**
 * Goal progress, measured against the accounts linked to the goal.
 *
 * A goal is defined by its links. Nothing else in the household counts — a
 * credit-card payoff goal is blind to the mortgage unless the mortgage is
 * linked to it.
 *
 * What this replaces: every goal's progress was `portfolioValue / target`,
 * the same number for all of them, written nightly into every row by the
 * snapshot cron. A goal to clear $31,200 of debt therefore completed itself
 * the moment the portfolio passed $31,200 — and a household carrying
 * $78,116.19 of debt was shown a trophy.
 */

export type GoalDirection = "accumulate" | "reduce";

/** What a link contributed to the basis on the day the goal was created. */
export type LinkBaseline = {
  itemType: string;
  itemId: string;
  baselineAmount: string | number;
};

/**
 * What the linked item is worth today.
 *
 * `current: null` means the item no longer exists — the debt or account was
 * deleted while the link survived it.
 */
export type LinkCurrent = {
  itemType: string;
  itemId: string;
  current: number | null;
};

export type GoalProgress = {
  /** Σ of the surviving links' baselines. Fixed at creation, never recomputed. */
  baseline: number;
  /** Σ of those same items today. */
  current: number;
  target: number;
  /**
   * Percent complete, uncapped and signed.
   *
   * Null when the denominator is zero, which is the only case where no
   * percentage exists. It is never 0 as a stand-in: a goal with no basis
   * has no fraction, the same way a position with no cost basis has no
   * gain percentage.
   */
  pct: number | null;
  /** Ground covered, in dollars. Negative when the goal has moved backwards. */
  moved: number;
  /** Distance still to travel, in dollars. */
  remaining: number;
  satisfied: boolean;
  linkedCount: number;
  /** Links whose item has been deleted; excluded from both sides. */
  orphanedCount: number;
};

const num = (v: string | number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Roll a goal up from its links.
 *
 * Orphaned links are dropped from BOTH the basis and the current sum rather
 * than being read as a balance of zero. Reading a deleted debt as zero would
 * report it as paid off, which is the one thing the deletion cannot tell us —
 * so the goal shrinks to what it can still see, and says how many links it
 * lost.
 */
export function computeGoalProgress(args: {
  direction: GoalDirection;
  target: number;
  links: LinkBaseline[];
  currents: LinkCurrent[];
}): GoalProgress {
  const { direction, target, links, currents } = args;

  const key = (l: { itemType: string; itemId: string }) => `${l.itemType}|${l.itemId}`;
  const currentBy = new Map(currents.map((c) => [key(c), c.current]));

  let baseline = 0;
  let current = 0;
  let linkedCount = 0;
  let orphanedCount = 0;

  for (const link of links) {
    const today = currentBy.get(key(link));
    if (today === undefined || today === null) {
      orphanedCount++;
      continue;
    }
    baseline += num(link.baselineAmount);
    current += today;
    linkedCount++;
  }

  // Signed so that "moved" is always progress in the goal's own direction:
  // paying debt down and building a balance up both read positive.
  const moved = direction === "reduce" ? baseline - current : current - baseline;
  const span = direction === "reduce" ? baseline - target : target - baseline;
  const remaining = direction === "reduce" ? current - target : target - current;

  const satisfied =
    linkedCount > 0 && (direction === "reduce" ? current <= target : current >= target);

  return {
    baseline,
    current,
    target,
    // Uncapped in both directions. A clamp at 100% is exactly what let the
    // old goal declare victory at 1002%, and a floor at 0% would hide the
    // month you borrowed more than you repaid.
    pct: span === 0 ? null : (moved / span) * 100,
    moved,
    remaining,
    satisfied,
    linkedCount,
    orphanedCount,
  };
}

/**
 * Whether a goal may be created from this basis.
 *
 * A reduction goal needs somewhere to reduce from. Linking only accounts that
 * are already at zero gives a span of zero, and every later reading would
 * divide by it. Refused at creation rather than handled at read time: the
 * state simply should not exist.
 *
 * Dormant accounts are welcome in the goal — a card sitting at zero is a
 * commitment that it stays there, and charging it is real backwards movement.
 * What is refused is a goal where EVERY link is at zero.
 */
export function validateBasis(args: {
  direction: GoalDirection;
  target: number;
  links: LinkBaseline[];
}): { ok: true } | { ok: false; reason: string } {
  if (args.links.length === 0) {
    return { ok: false, reason: "Link at least one account to track this goal." };
  }
  const baseline = args.links.reduce((s, l) => s + num(l.baselineAmount), 0);
  const span = args.direction === "reduce" ? baseline - args.target : args.target - baseline;

  if (span === 0) {
    return {
      ok: false,
      reason:
        args.direction === "reduce"
          ? "Every linked account is already at the target, so there is no progress to measure. Link an account that carries a balance."
          : "The target equals the starting balance, so there is no progress to measure.",
    };
  }
  if (span < 0) {
    return {
      ok: false,
      reason:
        args.direction === "reduce"
          ? "The target is higher than the current balance — nothing to pay down."
          : "The target is below the starting balance — it is already met.",
    };
  }
  return { ok: true };
}

/**
 * Whether a goal should be latched closed now.
 *
 * Closure is a fact about a moment, not about today's balances, so it is
 * stored rather than derived. Derived, a closed goal would silently re-open
 * the first time a charge landed on one of its cards — and the rule is that
 * new debt needs a new goal.
 */
export function shouldClose(progress: GoalProgress, closedAt: Date | null): boolean {
  return closedAt === null && progress.satisfied;
}

/**
 * How long a closing goal may sit at the target before it is latched.
 *
 * Zero today: the goal closes on the first sync that reports it satisfied,
 * which is what was asked for. It is a named constant because closure cannot
 * be undone and a reported balance can flicker — a payment posts, the card
 * reads zero, a pending charge appears the next morning. If that proves too
 * eager, this becomes a number of days rather than a redesign.
 */
export const CLOSE_CONFIRMATION_DAYS = 0;
