import { RMD_START_AGE } from "@/lib/utils/financial-analytics";

/**
 * What RetireWise notifies about, and the rules for when (Q11, answered by
 * the owner on 23 Oct 2026).
 *
 * Every message is written so it is safe on a lock screen: it says what
 * happened and where to look, never an amount or a balance. Pure functions
 * only, so each rule can be tested without a database or a browser.
 */

export const NOTIFICATION_KINDS = [
  { key: "reconnect", label: "A linked account needs reconnecting", operatorOnly: false },
  { key: "alerts", label: "Critical alerts: a large daily move or allocation drift", operatorOnly: false },
  { key: "goals", label: "A goal is reached", operatorOnly: false },
  { key: "household", label: "Someone joins your household", operatorOnly: false },
  { key: "withdrawals", label: "Money leaves a linked account", operatorOnly: false },
  { key: "deadlines", label: "Yearly deadlines: IRA, 401(k) and required distributions", operatorOnly: false },
  { key: "jobs", label: "A scheduled job failed", operatorOnly: true },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]["key"];

export function isNotificationKind(k: string): k is NotificationKind {
  return NOTIFICATION_KINDS.some((n) => n.key === k);
}

/** The kinds a person may turn on: the operator's only for the operator. */
export function kindsFor(isOperator: boolean): NotificationKind[] {
  return NOTIFICATION_KINDS.filter((n) => isOperator || !n.operatorOnly).map((n) => n.key);
}

/**
 * Whether the signed-in person runs this RetireWise, and so may hear that a
 * scheduled job failed. Named by OPERATOR_EMAIL; with it unset, nobody is.
 */
export function isOperator(email: string | null | undefined, operatorEmail = process.env.OPERATOR_EMAIL): boolean {
  if (!email || !operatorEmail) return false;
  return email.trim().toLowerCase() === operatorEmail.trim().toLowerCase();
}

/** The message a notification carries. */
export type Message = { title: string; body: string; url: string };

/** A withdrawal at or above this sends a notification. Set by the owner. */
export const WITHDRAWAL_NOTIFY_AT = 1_000;
/** Only withdrawals this recent: a newly linked account brings up to two years of history. */
export const WITHDRAWAL_RECENT_DAYS = 7;

/**
 * The withdrawals worth a notification, from transactions a sync has just
 * stored: type withdrawal, at or above the threshold, and dated within the
 * last week. Plaid's amount is positive for money out; its absolute value is
 * used so a sign convention cannot hide one.
 */
export function withdrawalsToNotify<T extends { type: string; amount: number; date: string }>(
  rows: T[],
  today: string
): T[] {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - WITHDRAWAL_RECENT_DAYS);
  const earliest = cutoff.toISOString().slice(0, 10);
  return rows.filter(
    (r) => r.type === "withdrawal" && Math.abs(r.amount) >= WITHDRAWAL_NOTIFY_AT && r.date >= earliest && r.date <= today
  );
}


/** A yearly deadline: the day to remind from, the deadline itself, and what to say. */
type Deadline = { key: string; remindFrom: string; due: string; applies: (ages: (number | null)[]) => boolean; message: Message };

function deadlines(year: number): Deadline[] {
  return [
    {
      key: `ira:${year}`,
      remindFrom: `${year}-04-01`,
      due: `${year}-04-15`,
      applies: () => true,
      message: {
        title: "IRA contributions for last year close on 15 April",
        body: "Contributions to an IRA or HSA for last year can still be made until the tax deadline.",
        url: "/accounts",
      },
    },
    {
      key: `401k:${year}`,
      remindFrom: `${year}-12-01`,
      due: `${year}-12-31`,
      applies: () => true,
      message: {
        title: "401(k) contributions for this year end on 31 December",
        body: "Payroll deferrals count only for the year they are paid. Check this year's contributions.",
        url: "/accounts",
      },
    },
    {
      key: `rmd:${year}`,
      remindFrom: `${year}-11-15`,
      due: `${year}-12-31`,
      applies: (ages) => ages.some((a) => a !== null && a >= RMD_START_AGE),
      message: {
        title: "Required minimum distributions are due by 31 December",
        body: "A distribution missed or short is taxed at 25%. Check this year's from each tax-deferred account.",
        url: "/projections",
      },
    },
  ];
}

/**
 * The yearly reminders due on a day: from the reminder date until the
 * deadline itself, so a missed run is caught by the next one, and the
 * notification log makes each fire once a year.
 */
export function deadlinesDue(today: string, ages: (number | null)[]): { key: string; message: Message }[] {
  const year = Number(today.slice(0, 4));
  return deadlines(year)
    .filter((d) => today >= d.remindFrom && today <= d.due && d.applies(ages))
    .map(({ key, message }) => ({ key, message }));
}

/** The message for each event. None carries an amount. */
export const messages = {
  reconnect: (institution: string): Message => ({
    title: `${institution} needs reconnecting`,
    body: "RetireWise can no longer refresh this connection until you sign in to it again.",
    url: "/accounts",
  }),
  alert: (type: string): Message => ({
    title:
      type === "large_daily_move"
        ? "Your portfolio moved sharply today"
        : type === "allocation_drift"
          ? "Your allocation has drifted past its limit"
          : type === "concentration_risk"
            ? "One holding is now a large share of your portfolio"
            : "A critical alert needs a look",
    body: "Open RetireWise to see the details.",
    url: "/dashboard",
  }),
  goal: (name: string): Message => ({
    title: "Goal reached",
    body: `${name} has reached its target.`,
    url: "/dashboard",
  }),
  household: (): Message => ({
    title: "Someone joined your household",
    body: "A new member can now see your household's finances. If you did not invite them, check Settings.",
    url: "/settings",
  }),
  withdrawal: (account: string): Message => ({
    title: `Money left ${account}`,
    body: `A withdrawal of ${WITHDRAWAL_NOTIFY_AT.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} or more was recorded. If you did not expect it, contact the institution.`,
    url: "/transactions",
  }),
  job: (job: string): Message => ({
    title: `RetireWise: the ${job} failed`,
    body: "A scheduled job did not finish. /api/health/freshness has the detail.",
    url: "/settings",
  }),
};
