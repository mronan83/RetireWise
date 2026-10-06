/**
 * The dashboard's daily change: the market's move in what the household
 * holds now, at the latest prices, since the previous weekday's close.
 *
 * It used to be read from the evening snapshot, as that snapshot's total less
 * the one before, so it moved once each weekday evening and not when prices
 * were refreshed, and money paid in counted as gain. Brokerages show the
 * day's change as each position's shares times the change in its price since
 * the last close, and so does this: refreshing prices moves it, and a deposit
 * does not.
 *
 * The previous close is the price each position was recorded at in the last
 * weekday-evening snapshot before the market day, so no price history needs
 * to be fetched to work it out.
 */

/** A position as it stands, at its latest price. */
export type PositionNow = { accountId: string; ticker: string; shares: number; price: number };
/** A position's price at the previous close. */
export type PositionAtClose = { accountId: string; ticker: string; price: number };

export type DailyChange = {
  /** Shares now times the change in price since the previous close, summed. */
  change: number;
  /** As a share of the same positions' value at the previous close; null when that is nothing. */
  changePct: number | null;
  /** What the positions held now were worth at the previous close. */
  valueAtClose: number;
  /** Positions with no price at the previous close, bought since: they add nothing to the change. */
  newSinceClose: number;
};

const key = (p: { accountId: string; ticker: string }) => `${p.accountId}|${p.ticker}`;

/** The day's change in what is held now, since the previous close. */
export function dailyChange(now: PositionNow[], atClose: PositionAtClose[]): DailyChange {
  const closing = new Map(atClose.map((p) => [key(p), p.price]));
  let change = 0;
  let valueAtClose = 0;
  let newSinceClose = 0;
  for (const p of now) {
    if (!(p.shares > 0) || !Number.isFinite(p.price) || p.price <= 0) continue;
    const before = closing.get(key(p));
    if (before === undefined || !Number.isFinite(before) || before <= 0) {
      newSinceClose++;
      continue;
    }
    change += p.shares * (p.price - before);
    valueAtClose += p.shares * before;
  }
  return {
    change,
    changePct: valueAtClose > 0 ? (change / valueAtClose) * 100 : null,
    valueAtClose,
    newSinceClose,
  };
}

/**
 * The market day a moment belongs to, as YYYY-MM-DD: the date in New York,
 * or the Friday before on a weekend, so a Saturday shows Friday's move
 * rather than nothing. Market holidays are not known here; on one, the
 * change reads as nothing.
 */
export function marketDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const back = part("weekday") === "Sat" ? 1 : part("weekday") === "Sun" ? 2 : 0;
  const day = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day")) - back));
  return day.toISOString().slice(0, 10);
}
