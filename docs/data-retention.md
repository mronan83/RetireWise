# Data retention

What RetireWise keeps, for how long, and what removes it. Written against the
schema rather than from a template — if a table is missing here, that is a bug
in this document.

## Kept until the household deletes it

Everything keyed to a household: accounts, holdings, transactions, balances,
contributions, goals, debts, property, vehicles, cash, Social Security
estimates, preferences, and the household and membership rows themselves.

Historical snapshots (`portfolio_snapshots`, `account_snapshots`,
`net_worth_snapshots`, `net_worth_item_history`) are kept indefinitely and
never pruned. They are the entire basis for long-run comparison, so an
automatic retention window would quietly destroy the thing the app is for.
They go when the household's data goes.

## Kept until superseded or revoked

| Table | Lifetime |
| --- | --- |
| `household_invites` | Seven days from issue, or until redeemed or revoked. Only a SHA-256 of the code is ever stored. |
| `plaid_items` | Until the institution is disconnected. Access tokens are encrypted at rest and never exported. |
| `subscriptions` | For the life of the household. |

## Operational records

| Table | Lifetime | Why |
| --- | --- | --- |
| `audit_log` | Life of the household | Records actions that change who can reach the data. Deleted with the household — keeping a dated record of someone who asked to be erased is the opposite of what they asked for. |
| `cron_runs` | Indefinite, no household key | Job history behind `/api/health/freshness`. Holds counts and timestamps, no personal data. |
| `household_join_attempts` | Life of the household | Backs the rate limit on invitation redemption. |
| `billing_events` | Indefinite | Stripe event ids for idempotency. Dormant while billing is off. |

### A gap worth naming

`cron_runs` and `billing_events` grow without bound. At this scale that is
nothing — a few rows a day — but neither has a pruning job, and "it never
mattered until it did" is how these things go. Prune them when either exceeds
roughly a hundred thousand rows.

## What deletion actually does

`DELETE`, not a hidden flag. A flag is the version of this that looks finished
and is not: the rows are still there, still in every backup, and still readable
by anything that forgets to check it.

The order is children before parents, because the foreign keys are only partly
cascading, and it runs as one unit so a failure leaves the household whole
rather than half-erased with no way to tell which half.

**Not covered by deletion:**

- The sign-in itself, which lives with Supabase Auth and is removed separately.
  The response says so rather than implying the account is gone when the email
  can still sign in.
- Database backups, until they age out on Supabase's own schedule.
- Vercel runtime logs, which hold request paths and error text, on Vercel's
  retention.
- Anything already sent to Plaid or to the household's own AI provider, which
  is governed by that provider's terms.
