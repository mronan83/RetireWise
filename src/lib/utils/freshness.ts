/**
 * How old a figure is, and whether that is a problem yet.
 *
 * Staleness is this app's most dangerous failure because it does not look
 * like one. A balance from eight months ago renders identically to one from
 * this morning — same typeface, same alignment, same confident number — and
 * every projection built on it inherits the error silently.
 *
 * Two things are tracked separately, because they fail separately:
 *
 *   - the CONNECTION, meaning when the institution was last reached;
 *   - the VALUE, meaning when the number itself last changed.
 *
 * They come apart in both directions. A connection can be syncing happily
 * while the price feed behind a holding has not moved in a week. A manual
 * account has no connection at all, yet its value still ages.
 */

import { sessionOf, sessionsBetween } from "./market-session";

export type Freshness = "fresh" | "aging" | "stale" | "unknown";

/**
 * What kind of figure this is. Thresholds differ by an order of magnitude
 * between them, and one shared threshold would either cry wolf about a
 * property valuation or stay silent about a two-week-old share price.
 */
export type FreshnessKind =
  /**
   * Market prices, timed by the session they were struck in, not by when
   * they were fetched: see PRICE_SESSIONS.
   */
  | "price"
  /** Balances pulled from an institution. Daily refresh. */
  | "linked_balance"
  /** A figure someone typed. Ages at whatever pace they revisit it. */
  | "manual_balance"
  /** Property and vehicle valuations, which genuinely move slowly. */
  | "valuation"
  /** When an institution was last reached at all. */
  | "connection";

/**
 * How many market sessions a price may fall behind before it is aging, then
 * stale.
 *
 * Counted in sessions, not hours. A mutual fund posts one price a day, after
 * the close, so at Tuesday noon its newest possible price is Monday's: one
 * session behind is as current as it can be. A weekend adds no sessions, so a
 * Friday close is still current on Monday morning, where a count of hours
 * called it aging.
 */
export const PRICE_SESSIONS = { aging: 2, stale: 3 } as const;

/** Hours after which a figure is aging, then stale. Prices use PRICE_SESSIONS. */
const THRESHOLDS: Record<Exclude<FreshnessKind, "price">, { aging: number; stale: number }> = {
  linked_balance: { aging: 48, stale: 120 },
  // Nobody updates a manual balance daily, and pretending otherwise would
  // make the whole signal noise. A quarter is where it stops being current.
  manual_balance: { aging: 45 * 24, stale: 120 * 24 },
  valuation: { aging: 180 * 24, stale: 365 * 24 },
  connection: { aging: 48, stale: 120 },
};

export function hoursSince(at: Date | string | null | undefined, now = Date.now()): number | null {
  if (!at) return null;
  const then = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (Number.isNaN(then)) return null;
  return (now - then) / 3_600_000;
}

export function freshnessOf(
  at: Date | string | null | undefined,
  kind: FreshnessKind,
  now = Date.now()
): Freshness {
  const hours = hoursSince(at, now);
  // Never updated is its own state. Calling it "stale" would imply it was
  // once current, and calling it fresh would be a lie.
  if (hours === null) return "unknown";
  if (kind === "price") {
    const behind = sessionsBetween(sessionOf(new Date(now - hours * 3_600_000)), sessionOf(new Date(now)));
    if (behind >= PRICE_SESSIONS.stale) return "stale";
    if (behind >= PRICE_SESSIONS.aging) return "aging";
    return "fresh";
  }
  const t = THRESHOLDS[kind];
  if (hours >= t.stale) return "stale";
  if (hours >= t.aging) return "aging";
  return "fresh";
}

/**
 * A short human phrase. Deliberately coarse above a day: the difference
 * between 26 and 31 hours changes no decision, and false precision invites
 * more trust than the number deserves.
 */
export function relativeAge(
  at: Date | string | null | undefined,
  now = Date.now()
): string {
  const hours = hoursSince(at, now);
  if (hours === null) return "never";
  if (hours < 0) return "just now";
  if (hours < 1) {
    const minutes = Math.floor(hours * 60);
    return minutes <= 1 ? "just now" : `${minutes} min ago`;
  }
  if (hours < 24) {
    const h = Math.floor(hours);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "over a year ago" : `over ${years} years ago`;
}

/** The full timestamp, for a tooltip — where precision is actually wanted. */
export function absoluteTimestamp(at: Date | string | null | undefined): string {
  if (!at) return "Never updated";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The freshest of several timestamps.
 *
 * An account's data is as current as its most recently updated holding — but
 * see `oldestOf` for the question that usually matters more.
 */
export function newestOf(dates: (Date | string | null | undefined)[]): Date | null {
  let best: number | null = null;
  for (const d of dates) {
    if (!d) continue;
    const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) best = t;
  }
  return best === null ? null : new Date(best);
}

/**
 * The stalest of several timestamps, ignoring ones that were never set.
 *
 * For a total, this is the honest figure. An account holding nine positions
 * priced this morning and one priced last month is not a fresh account — the
 * total it reports is wrong by whatever that position has done since, and
 * reporting the newest timestamp would hide exactly that.
 */
export function oldestOf(dates: (Date | string | null | undefined)[]): Date | null {
  let worst: number | null = null;
  for (const d of dates) {
    if (!d) continue;
    const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
    if (Number.isNaN(t)) continue;
    if (worst === null || t < worst) worst = t;
  }
  return worst === null ? null : new Date(worst);
}
