/**
 * The dashboard's daily change: the market's move in what the household
 * holds now, credited to the session it happened in.
 *
 * Each position moves by its shares times the change in its price since the
 * close before that price's session. Refreshing prices moves it, and money
 * paid in does not.
 *
 * Prices do not all belong to the same day. An exchange-traded fund refreshed
 * at noon is today's; a mutual fund posts one price a day, after the close,
 * so at noon its newest price is yesterday's, and an employer-plan fund the
 * bank prices arrives the next morning. Measuring every position against one
 * evening snapshot added a fund's move to the day after it happened. So each
 * position is placed in the session its price belongs to (sessionOf), and the
 * dashboard shows the latest session's move with the session before it, from
 * positions a day behind, beside it rather than inside it.
 */
import { sessionBefore, sessionOf } from "../utils/market-session";

/** A position at its newest price, with the close before that price's session. */
export type PricedPosition = {
  shares: number;
  price: number;
  /** The close of the session before the price's; null when not known. */
  previousClose: number | null;
  /** When the price was struck. */
  priceAsOf: Date | string | null;
};

/** One session's move, in the positions priced in it. */
export type SessionMove = {
  /** The session, YYYY-MM-DD. */
  session: string;
  /** Shares times the change in price since the close before, summed. */
  change: number;
  /** As a share of those positions' value at that close; null when that is nothing. */
  changePct: number | null;
  valueAtClose: number;
  positions: number;
};

export type DailyChange = {
  /** The newest session any position is priced in: the dashboard's figure. Null when nothing can be measured. */
  latest: SessionMove | null;
  /** The session before it, in positions a day behind (mutual funds, until they post). Null when there are none. */
  dayBehind: SessionMove | null;
  /** Positions priced longer ago than that, left out rather than shown on a day they did not move. */
  older: number;
  /** Positions with no previous close: priced by hand, never refreshed since, or across a gap. */
  unmeasured: number;
};

function move(session: string, positions: { shares: number; price: number; previousClose: number }[]): SessionMove {
  let change = 0;
  let valueAtClose = 0;
  for (const p of positions) {
    change += p.shares * (p.price - p.previousClose);
    valueAtClose += p.shares * p.previousClose;
  }
  return {
    session,
    change,
    changePct: valueAtClose > 0 ? (change / valueAtClose) * 100 : null,
    valueAtClose,
    positions: positions.length,
  };
}

/** The market's move in what is held now, by the session each price belongs to. */
export function dailyChange(positions: PricedPosition[]): DailyChange {
  const bySession = new Map<string, { shares: number; price: number; previousClose: number }[]>();
  let unmeasured = 0;
  for (const p of positions) {
    if (!(p.shares > 0) || !Number.isFinite(p.price) || p.price <= 0) continue;
    const at = p.priceAsOf ? new Date(p.priceAsOf) : null;
    if (
      !at ||
      Number.isNaN(at.getTime()) ||
      p.previousClose === null ||
      !Number.isFinite(p.previousClose) ||
      p.previousClose <= 0
    ) {
      unmeasured++;
      continue;
    }
    const session = sessionOf(at);
    const list = bySession.get(session) ?? [];
    list.push({ shares: p.shares, price: p.price, previousClose: p.previousClose });
    bySession.set(session, list);
  }

  const sessions = [...bySession.keys()].sort();
  const newest = sessions.at(-1);
  if (!newest) return { latest: null, dayBehind: null, older: 0, unmeasured };
  const before = sessionBefore(newest);
  const behind = bySession.get(before);
  const older = sessions
    .filter((s) => s < before)
    .reduce((n, s) => n + bySession.get(s)!.length, 0);
  return {
    latest: move(newest, bySession.get(newest)!),
    dayBehind: behind ? move(before, behind) : null,
    older,
    unmeasured,
  };
}
