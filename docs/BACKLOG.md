# RetireWise backlog

Last reviewed: 2026-10-02

Items from the [delivery review](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk) (G1–G7) the Plaid investigation of 29 Sep, and the requirements traceability review of 2 Oct (#28–#52, one per gap). The page is published from this file after each successful `pnpm deploy:prod`, so it always describes what is live.

<!--
How to edit
- One "### N. Title" heading per item, then the fields below as a list, then a description.
- Numbers are permanent. A closed item moves to Done and keeps its number.
- Edit this file in the same PR as the work that opens or closes an item.
- `pnpm backlog:check` (also run in CI) fails if an item is malformed.

Open item fields
- Type: Defect | Gap | Security | Tech Debt | Ops | Decision | Verify | Data
- Priority: P1 (next) | P2 (this month) | P3 (this quarter)
- Effort: S (hours) | M (about a day) | L (days)
- Severity: High | Medium | Low
- Blocker: None (ready for Claude), "Your …" (only the owner can unblock it; listed under Waiting on you), or another item
- Source: where it was found (optional)

Done item fields
- Type, Closed (YYYY-MM-DD), In (commit or action)
-->

## Open items

### 1. Preview builds can reach the production database

- Type: Security
- Priority: P1
- Effort: S
- Severity: High
- Blocker: Your go-ahead, or ten minutes in Vercel
- Source: [Delivery review G1](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

`SUPABASE_DATABASE_URL`, `DATABASE_URL` and `POSTGRES_URL` are set for Preview as well as Production, so every branch push builds unreviewed code that holds the credentials for real households' data. Previews sit behind Vercel sign-in and cannot sign users in, which limits the damage. Untick Preview on those variables and on the other `POSTGRES_*` and `PG*` entries. Previews then have no database until #7 gives them their own.

### 2. Nothing outside the app notices when production breaks

- Type: Ops
- Priority: P1
- Effort: S
- Severity: High
- Blocker: Your action: sign up for any uptime monitor
- Source: [Delivery review G3](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

`/api/health` was written for an external monitor, after the app was down for 92 days without anyone noticing, and nothing calls it. Point a monitor at `https://retirewise-iota.vercel.app/api/health` and alert your phone after two failed checks.

### 3. The store-card fix is live but not confirmed

- Type: Verify
- Priority: P1
- Effort: S
- Severity: High
- Blocker: Your test: connect the Home Depot card through Net Worth → Connect bank or loan

Commit `70fa40e` moved Liabilities from `required_if_supported_products` to `additional_consented_products`, so a failed Liabilities read can no longer block a connection. It has not been tried against real Plaid. If it still fails, the line under the button now gives the institution and error code. If a Citi card reports a registration error, the fix is in the Plaid Dashboard (Compliance Center → OAuth institutions → Citi), not in code.

### 4. Nothing shows which commit is live

- Type: Ops
- Priority: P1
- Effort: S
- Severity: Medium
- Blocker: None
- Source: [Delivery review G3](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

`/api/health` does not report a version, and production sat a week behind `main` (22–29 Sep) with nothing showing it. Add the commit to `/api/health`, and add `pnpm deploy:prod --status` to list commits that are merged but not live.

### 5. Rollback rebuilds instead of promoting

- Type: Ops
- Priority: P1
- Effort: S
- Severity: Medium
- Blocker: None
- Source: [Delivery review G5](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

`pnpm deploy:prod <older sha>` builds the old commit again, which takes about two minutes. Vercel can point production back at the previous build in seconds. Add `pnpm deploy:prod --rollback`.

### 6. Schema changes are applied by hand, outside the release

- Type: Gap
- Priority: P2
- Effort: M
- Severity: High
- Blocker: Your decision: where the production database credential lives for the release (see #15)
- Source: [Delivery review G2](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

`pnpm db:migrate` runs against whatever database a machine's `.env.local` names. It is not gated, not ordered with the code it serves, and has no down migrations. Production is in sync today: 20 of 20, the last applied on 21 Sep. The dry run should list pending migrations and the release should apply them before switching traffic, under one rule: a migration must work with the code already live.

### 7. Previews have no data of their own

- Type: Gap
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: #1, then a second Supabase project from you
- Source: [Delivery review G1](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

Previews have neither `NEXT_PUBLIC_SUPABASE_URL` nor Plaid keys, so they cannot be used to test anything. A second Supabase project and Plaid Sandbox keys, scoped to Preview only, would have let the store-card fix be tried before it reached real accounts.

### 8. Errors go nowhere anyone looks

- Type: Ops
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: Your choice of service and an account (Sentry's free tier would do)
- Source: [Delivery review G3](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

Server errors are only in Vercel's short-lived runtime logs. A failed Plaid connection is logged to the browser console and nowhere else. Report both to one place that alerts.

### 9. Stored AI keys are sealed with a key derived from CRON_SECRET

- Type: Security
- Priority: P2
- Effort: S
- Severity: High
- Blocker: Your go-ahead: it re-seals production data

`ENCRYPTION_KEY` is not set in Vercel, so `src/lib/utils/encryption.ts` derives the key that seals each household's AI provider key from `CRON_SECRET`. Rotating the cron secret would make every stored key unreadable, and a leak of it would expose them. Set a dedicated `ENCRYPTION_KEY` and re-seal with the rotation the code already supports (`scripts/rotate-keys.ts`).

### 10. Dead configuration in Vercel, including a silent fallback database

- Type: Tech Debt
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: Your go-ahead: production settings
- Source: [Delivery review G6](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

`DATABASE_URL`, `POSTGRES_*` and `PG*` still point at the original Neon database. The code falls back to `DATABASE_URL` when `SUPABASE_DATABASE_URL` is missing, so a deleted or misspelled variable would move production onto Neon without an error. Also unused: the `NEXT_PUBLIC_CLERK_*` pair, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `AI_PROVIDER`, and the misspelled `NEXT_PUBLISHED_SUPABASE_PUBLISHABLE_KEY`.

### 11. "Connect Account" lists investment firms only

- Type: Defect
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None

The button on the Accounts page asks Plaid for investment data only, and Plaid hides every institution that cannot supply it. Nothing on screen says so, and banks and cards can only be connected from Net Worth → Connect bank or loan. Relabel the buttons, or replace them with one that asks what kind of account it is.

### 12. Mortgage and student-loan servicers cannot be connected

- Type: Gap
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None

"Connect bank or loan" requires Transactions, and Plaid filters out servicers that only offer Liabilities, which covers most mortgage and student-loan servicers. Add a loan option that asks for Liabilities as its product.

### 13. Reconnecting an account creates a second connection

- Type: Gap
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: None. Existing connections stay as they are (your instruction, 29 Sep).

There is no Plaid update mode, so reconnecting runs a new link and creates a new item. The comment at `src/app/api/plaid/exchange-token/route.ts:35` says relinking keeps the item id, which is only true in update mode. A new Chase or Schwab connection also invalidates the older one. Build update mode for connections marked `requires_reauth`.

### 14. Plaid webhooks never arrive

- Type: Gap
- Priority: P2
- Effort: S
- Severity: Low
- Blocker: None for new connections; your go-ahead before touching existing ones

`/api/plaid/webhook` exists, but no link token names it, so Plaid sends nothing and every update waits for the 10:00 UTC refresh. Set the webhook on new links. Existing connections would need `/item/webhook/update`, which waits on your go-ahead.

### 15. Releases run from a Claude session

- Type: Tech Debt
- Priority: P3
- Effort: M
- Severity: Medium
- Blocker: None
- Source: [Delivery review G2, G6](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

`pnpm deploy:prod` runs wherever it is started, with a Vercel token that covers all six projects in the team. A GitHub Actions release workflow, started by name on your word, would keep secrets in GitHub and leave a log of every release. It is also the natural home for the production database credential that #6 needs.

### 16. main is unprotected

- Type: Decision
- Priority: P3
- Effort: S
- Severity: Medium
- Blocker: Your decision: GitHub Pro, which a private repo needs for branch protection
- Source: [Delivery review G4](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

A direct push to `main` would skip review and CI. `deploy:prod` still refuses a commit whose CI is not green, so the exposure is to review, not to release. Requiring a PR and green checks, plus an automated reviewer, would give a second reader on sign-in, tenant and encryption changes.

### 17. A database restore has never been rehearsed

- Type: Ops
- Priority: P3
- Effort: M
- Severity: Medium
- Blocker: Your time, once a quarter
- Source: [Delivery review G7](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

Backups are daily, so up to 24 hours of data can be lost, and `docs/disaster-recovery.md` records that a restore has never been tried. Restore last night's backup into a scratch project and time it. If losing a day is too much, turn on point-in-time recovery.

### 18. Claude sessions can reach more than RetireWise

- Type: Security
- Priority: P3
- Effort: S
- Severity: Medium
- Blocker: Your action: account settings
- Source: [Delivery review G6](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)

The Supabase connector on your Claude account is signed in to the MOO org, with write access to the WayPoint production database. The Vercel token covers all six projects in the team. Disconnect the connector, and consider a RetireWise-only Vercel team.

### 19. The Plaid libraries are six major versions behind

- Type: Tech Debt
- Priority: P3
- Effort: M
- Severity: Low
- Blocker: None

`plaid` is at 41.4.0 (latest 47.0.0) and `react-plaid-link` at 4.1.1 (latest 5.0.0). The Link window loads from Plaid's CDN, so connections are not affected today. Upgrade in its own change.

### 20. The health check calls sign-in configured when the keys merely exist

- Type: Defect
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None

`authConfigured` checks that the Supabase URL and key are present, not that they work. An expired or wrong key, the cause of the 92-day outage, would still report healthy. Make one cheap authenticated call to Supabase instead.

### 21. Chase needs Plaid's security questionnaire

- Type: Decision
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: Your decision: only needed if you bank with Chase

Plaid enables Chase in production only after the Security Questionnaire in the Plaid Dashboard is complete. No Chase account is linked today.

### 22. Duplicate connections at Fidelity, American Express and Bank of America

- Type: Data
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: Deferred by you (29 Sep): leave connections as they are

Each appears twice among the 14 linked institutions, most likely from reconnecting (#13). On a paid Plaid plan each connection is billed.

### 28. Erasing a household leaves its holding snapshots behind

- Type: Security
- Priority: P1
- Effort: S
- Severity: High
- Blocker: None
- Source: Requirements traceability, GAP-01

`src/lib/account/delete.ts` never deletes `holding_snapshots`, and `src/lib/account/export.ts` exports neither them nor `goal_links`, while the privacy page promises both. The deletion check measures what is left through the export, so it cannot see the omission. Add both tables to erasure and export, and make the check count rows in the database directly.

### 29. Three engines give three answers to the same retirement question

- Type: Defect
- Priority: P1
- Effort: L
- Severity: High
- Blocker: Your decision on Q9 in the requirements: one tested engine everywhere
- Source: Requirements traceability, GAP-02

The AI assistant's projection tool runs an older engine with 2024 tax brackets. The Projections page's Monte Carlo inflates spending from the year retirement starts, the error the tested engine was fixed for. The scenario Monte Carlo ignores required minimum distributions. Only `runDetailedProjection` is tested. Route every surface through it, and drop "estimate dividend income" from the assistant's prompt. The assistant's figures will change, which is why it needs your word.

### 30. Social Security is cut differently on Projections and Analytics

- Type: Defect
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: #29
- Source: Requirements traceability, GAP-03

Projections cuts the benefit a flat 6.67% per early year (66.65% at 62); Analytics uses the tiered SSA rule (70% at 62). Only the tiered rule is tested. Use it in both, as part of #29.

### 31. Contribution limits are hard-coded for 2025 and ignore the IRS limits table

- Type: Defect
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-04

Three copies of the 2025 limits cap projected contributions, while Settings shows and refreshes a table the engine never reads. The HSA catch-up applies from 50 instead of 55. The check meant to prove the cap uses a deferral under it, so it passes even if capping is broken. Read limits from the table by year, and test a deferral over the cap.

### 32. "Sync now" writes the database's ID where Plaid's item ID belongs

- Type: Defect
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-05

`src/app/api/plaid/sync/route.ts` passes `item.id` where the daily refresh passes Plaid's `item_id`, and stores it on the synced accounts. A disconnect before the next daily refresh would leave that connection's credentials in place. On 2 Oct no record carried a wrong ID (0 of 24), so this is a fix with no data repair.

### 33. Chat, prices, billing status and household routes skip the restricted database role

- Type: Security
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-06

These routes query as the table owner, so row-level security does not apply and only their own household filters isolate one household from another. The tenant-scope check cannot see them, and the privacy page says every request runs under the restricted role. Wrap them in `withTenant` and extend the check to catch the pattern.

### 34. The membership policy lets an account insert itself into any household

- Type: Security
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-07

The `WITH CHECK` on memberships does not tie the household to an accepted invite, and nothing makes an account's membership unique, so a second one would make which household loads unpredictable. No code path does either today. Needs a migration, so it ships with or after #6.

### 35. A member cannot leave a household, and an owner cannot remove one

- Type: Gap
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: Your decision on Q3 in the requirements: what happens to what a leaving member added
- Source: Requirements traceability, GAP-08

The erase-data screen tells a member they "can leave the household instead", and there is no such action. The only way to revoke a partner's access today is to erase everything.

### 36. Demo visitors and any signed-in user can trigger shared writes

- Type: Security
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-09

The price refresh rewrites the demo household's prices and returns a stack trace on failure. The IRS limits refresh lets any signed-in user rewrite the shared tables, though only to values fixed in code. Refuse both in demo mode, restrict the limits refresh to the cron, and return a plain error.

### 37. Cron routes would accept anyone if CRON_SECRET were unset

- Type: Security
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-10

The expected header becomes `Bearer undefined`, and the comparison is not constant-time. The secret is set in production. Fail closed when it is missing and compare with `timingSafeEqual`.

### 38. A holdings file import wipes the account's holdings first

- Type: Defect
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: Your decision on Q5 in the requirements: replace or merge
- Source: Requirements traceability, GAP-11

`src/lib/actions/import.ts` deletes every holding before inserting the file, so a cost basis entered by hand is lost on re-import. Fidelity quick import merges by ticker instead.

### 39. Holdings cannot be edited or deleted

- Type: Gap
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-12

The update and delete actions exist in `src/lib/actions/holdings.ts`, and no screen calls them. A wrong share count can only be fixed by re-importing.

### 40. The transactions page stops at 500 and totals only those

- Type: Defect
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-13

Page through results and compute totals in the query.

### 41. The setup checklist counts retired contributions as done

- Type: Defect
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-14

`src/lib/onboarding.ts` tests `is_active IS NOT NULL`, which is always true. It should test `is_active = true`.

### 42. Analytics and projections fill in age, spending and fees silently

- Type: Defect
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: Your decision on Q4 in the requirements: refuse, or show the default
- Source: Requirements traceability, GAP-15

Missing inputs become age 42, $7,000 a month and a 0.15% fund fee, with nothing on screen to say so. It is the guessed-figure pattern the dividend work removed.

### 43. Plan limits are mostly unenforced

- Type: Gap
- Priority: P3
- Effort: M
- Severity: Low
- Blocker: Your decision on Q6 in the requirements: who RetireWise is for
- Source: Requirements traceability, GAP-16

Three of eight plan features are checked, the daily AI message limit is never applied, the chat rate limit needs Redis, and only households made through "Create household" are comped. Harmless while every plan is free; not on the day billing goes on.

### 44. The README, user guide, help and architecture docs contradict the app

- Type: Tech Debt
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-17

The README is the create-next-app template. The user guide promises Clerk and Google sign-in, 11 analysis cards, 10 AI tools and dashboard alerts. Help gives the wrong price-update time and a reconnect button that does not exist. The architecture and data-flow docs describe Neon, Clerk and 14 tables.

### 45. The privacy page leaves out two recipients and overstates two protections

- Type: Gap
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-18

It does not name Yahoo Finance (tickers) or the NHTSA (vehicle VINs), and says there are no third-party scripts though Plaid Link loads from Plaid. Its claims of restricted access on every request and complete erasure are untrue until #33 and #28 land. Correct the page now and again when those ship.

### 46. The audit log misses actions it declares and loses who acted

- Type: Gap
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-19

Account deletion and billing changes are declared but never recorded. Plaid and AI-key events carry no actor. Revoked invites are filed under the wrong key.

### 47. The holdings CSV breaks on a name with a quote in it

- Type: Defect
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-20

Quote and escape every field.

### 48. No password reset, and sign-in drops where you were going

- Type: Gap
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-21

Someone who forgets their password cannot get back in. The auth callback also ignores `next`, so a deep link lands on the dashboard after sign-in. The reset email goes through Supabase Auth, which is already configured.

### 49. The weekday snapshot skips households and can double-count a day

- Type: Defect
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-22

A household with no investments gets no net-worth snapshot, because the loop continues before it. A second run on one day inserts duplicate rows, and every run is recorded as ok. Upsert by day and record real outcomes.

### 50. A release stops on a passing Vercel error before confirming itself

- Type: Ops
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-23

On 2 Oct one 502 from Vercel's API stopped `pnpm deploy:prod` after a good build, so the alias, health and backlog page were checked by hand. Retry read-only Vercel calls a few times before giving up.

### 51. Some checks prove less than their names say

- Type: Tech Debt
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-24

An IRS cap check that never reaches the cap, a coverage rule restated in the test instead of imported, and an "underwater" case that asserts positive equity. Several checks read source text instead of running code. Requirements that rely on them are marked Partial until they are fixed.

### 52. Components and actions that nothing uses

- Type: Tech Debt
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-25

`scenario-runner.tsx`, `projection-charts.tsx` and `alerts-panel.tsx` are imported nowhere, and several server actions have no caller. Delete them, or wire them up where a gap needs them (#39 needs the holdings actions).

## Notes on sequencing

- Do #1 before #7: previews should lose production's data before they get data of their own.
- #4 and #5 are small and make every later release safer. Ship them before #6 changes what a release does.
- #6 waits on where the production database credential lives. #15 answers that, so decide it early even though building it can wait.
- #3, #2 and #1 need you, not code. If #3 fails, send the error line under the button.
- #11–#14 touch the same Plaid flow and can ship as one PR. None of them changes an existing connection.
- #28 first among the traceability items: it is the one where the app breaks a promise to users today. Fix the privacy page (#45) in the same PR.
- #29 and #30 are one piece of work once you answer Q9. #31 touches the same engine, so it follows them.
- #32, #33, #34, #36 and #37 are small security fixes that can ship together; #34 needs a migration, so it rides with #6.
- Five items wait on a decision you can make in a sentence each: Q3 (#35), Q4 (#42), Q5 (#38), Q6 (#43) and Q9 (#29).

## Done

### 23. Store cards could not be connected

- Type: Defect
- Closed: 2026-09-29
- In: 70fa40e

Liabilities sat in `required_if_supported_products`, so a failed Liabilities read failed the whole connection. Synchrony (Amazon, Discount Tire) and Citi Retail Services (Home Depot, Best Buy) cards would not link while every general-purpose card did. Confirmation is #3.

### 24. A failed Plaid connection closed without a word

- Type: Defect
- Closed: 2026-09-29
- In: 70fa40e

The Link button ignored `onExit`. It now shows the institution, Plaid's message and the error code, and logs the `link_session_id`.

### 25. Liabilities was requested for every card and loan

- Type: Tech Debt
- Closed: 2026-09-29
- In: 70fa40e

`/liabilities/get` is now called only for a mortgage, the one account type the app reads it for, so cards and other loans no longer add the product to a connection.

### 26. Every merge went straight to production

- Type: Gap
- Closed: 2026-09-29
- In: e686deb

Merging no longer deploys. `pnpm deploy:prod`, run on your word, checks the commit and its CI, builds, and confirms the live site and its health.

### 27. The GitHub link to Vercel was broken for a week

- Type: Ops
- Closed: 2026-09-29
- In: You reconnected the repository in Vercel

Vercel created no deployments between 22 and 29 Sep and nothing reported it. The first release on command failed loudly with "repository can't be found", which is how it was found.
