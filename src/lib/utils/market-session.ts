/**
 * Market sessions: which trading day a price belongs to, and how many have
 * passed since.
 *
 * A price describes one session's trading, not the moment it was fetched.
 * An exchange-traded fund fetched at 11 am is today's; a mutual fund fetched
 * at the same moment is yesterday's, because a fund posts one price a day,
 * after the close. Reading both as "now" is what made the daily change add a
 * fund's move to the wrong day and made a price days old look current.
 *
 * Weekdays only, in New York time. Exchange holidays are not known here, so a
 * holiday counts as a session in which nothing moved.
 */

const NEW_YORK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 09:30 and 16:00, as minutes after midnight in New York. */
const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;

function inNewYork(at: Date): { date: string; minutes: number } {
  const parts = NEW_YORK.formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * The session a moment belongs to, as YYYY-MM-DD: the latest weekday whose
 * 09:30 New York open came at or before it.
 *
 * So a price stamped during trading or after the close belongs to that day,
 * one stamped before the open belongs to the day before (a mutual fund's
 * price, stamped the next morning, lands on the day it was struck), and a
 * weekend belongs to Friday. Read of the clock, it is the session whose move
 * the dashboard is showing: before Tuesday's open, that is still Monday's.
 */
export function sessionOf(at: Date | string): string {
  const { date, minutes } = inNewYork(at instanceof Date ? at : new Date(at));
  let day = minutes >= OPEN ? date : addDays(date, -1);
  while (!isWeekday(day)) day = addDays(day, -1);
  return day;
}

/** Sessions after `from` up to and including `to`: 0 when `to` is not later. */
export function sessionsBetween(from: string, to: string): number {
  let count = 0;
  for (let day = addDays(from, 1); day <= to; day = addDays(day, 1)) {
    if (isWeekday(day)) count++;
  }
  return count;
}

/** The session before a session. */
export function sessionBefore(session: string): string {
  let day = addDays(session, -1);
  while (!isWeekday(day)) day = addDays(day, -1);
  return day;
}

/**
 * 4 pm in New York on a date, as an instant: the time to give a price that
 * arrives with a date and no time, which is that day's closing price.
 */
export function closeOn(date: string): Date {
  // Eastern time is four or five hours behind UTC; try both.
  for (const hour of [20, 21]) {
    const at = new Date(`${date}T${hour}:00:00Z`);
    if (inNewYork(at).minutes === CLOSE) return at;
  }
  return new Date(`${date}T20:00:00Z`);
}

/** A holding's price as stored: the price, when it was struck, and the close before that session. */
export type StoredPrice = { price: number; at: Date | null; previousClose: number | null };

/**
 * What to store when a new price arrives for a holding, or null to keep what
 * is stored. Prices reach a holding from two places, Refresh Prices (Yahoo)
 * and the bank's sync (Plaid), and they disagree about which day it is.
 *
 *  1. A price from an earlier session never replaces one from a later
 *     session. The bank's morning sync reports the day before's close; when
 *     Refresh Prices has already stored today's, the bank's is history.
 *     The exception is a stored price with no previous close, which cannot
 *     be credited to any day and may be dated when it was written rather
 *     than struck, as every price stored before 6 Oct 2026 is: a quote that
 *     brings its own previous close replaces it.
 *  2. Within one session the later price wins. An earlier one can still
 *     supply the previous close the stored price lacks.
 *  3. A source that knows the previous close, as Yahoo does, supplies it.
 *     One that does not, as the bank does not, gets it from the stored
 *     price, but only when that price is from the session just before.
 *     Across a gap it is left unknown: one move spanning several sessions
 *     is not a day's move.
 */
export function resolvePriceUpdate(
  incoming: { price: number; at: Date; previousClose?: number | null },
  stored: StoredPrice | null
): (StoredPrice & { at: Date }) | null {
  const known = incoming.previousClose;
  if (!stored || !stored.at || !(stored.price > 0)) {
    return { price: incoming.price, at: incoming.at, previousClose: known ?? null };
  }
  if (stored.previousClose === null && known != null) {
    return { price: incoming.price, at: incoming.at, previousClose: known };
  }
  const was = sessionOf(stored.at);
  const now = sessionOf(incoming.at);
  if (now < was) return null;
  if (now === was) {
    if (incoming.at.getTime() < stored.at.getTime()) {
      return stored.previousClose === null && known != null
        ? { price: stored.price, at: stored.at, previousClose: known }
        : null;
    }
    return { price: incoming.price, at: incoming.at, previousClose: known ?? stored.previousClose };
  }
  if (known !== undefined) return { price: incoming.price, at: incoming.at, previousClose: known };
  return {
    price: incoming.price,
    at: incoming.at,
    previousClose: sessionsBetween(was, now) === 1 ? stored.price : null,
  };
}

/**
 * The price fields to write when a person saves a holding by hand.
 *
 * A price typed in is dated now and has no previous close, since nothing
 * says what the position was worth at the last close. Saving with the price
 * unchanged, to correct the shares say, leaves its date and previous close
 * alone: that used to stamp an old price as current.
 */
export function typedPriceUpdate(
  typed: number,
  stored: string | number | null
): Record<string, never> | { lastPriceUpdate: Date; previousClose: null } {
  if (stored !== null && Number(stored) === typed) return {};
  return { lastPriceUpdate: new Date(), previousClose: null };
}
