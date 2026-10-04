# RetireWise backlog

Last reviewed: 2026-10-04

Items from the [delivery review](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk) (G1–G7), the Plaid investigation of 29 Sep, the requirements traceability review of 2 Oct (#28–#56, one per gap), the architecture and data model review of 3 Oct (#58–#64), and the calculations review of 4 Oct (#65 onwards). The page is published from this file after each successful `pnpm deploy:prod`, so it always describes what is live.

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

These routes query as the table owner, so row-level security does not apply and only their own household filters isolate one household from another. The tenant-scope check cannot see them, and the privacy page says every request runs under the restricted role. Wrap them in `withTenant` and extend the check to catch the pattern. Then update the privacy page, which names these routes as the ones not yet under the restricted role.

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
- Blocker: #54
- Source: Requirements traceability, GAP-08

The erase-data screen tells a member they "can leave the household instead", and there is no such action. The only way to revoke a partner's access today is to erase everything. You decided (Q3) that leaving deletes what the member added. So the leave and remove actions delete those rows, disconnect the member's bank connections at Plaid, and show the list before confirming. That needs #54 first.

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

### 38. Holdings imports overwrite without checking the file's date

- Type: Defect
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-11

`src/lib/actions/import.ts` deletes every holding before inserting the file, so a cost basis entered by hand is lost on re-import. Fidelity quick import merges by ticker, but removes positions missing from the file and replaces a hand-entered cost basis. You decided (Q5): review first, refuse a file older than what is recorded, merge a newer one. Both paths get the date rule the statement import already uses (`src/lib/actions/import-statement.ts`) and a review of what will be added, changed and removed. A hand-entered cost basis is kept unless the file has one, a file with no date asks for one, and Plaid-linked accounts are refused.

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

### 44. The README, user guide, help and architecture docs contradict the app

- Type: Tech Debt
- Priority: P2
- Effort: M
- Severity: Medium
- Blocker: None
- Source: Requirements traceability, GAP-17

The README is the create-next-app template. The user guide promises Clerk and Google sign-in, 11 analysis cards, 10 AI tools and dashboard alerts. Help gives the wrong price-update time and a reconnect button that does not exist. The architecture and data-flow docs were replaced on 3 Oct by `docs/ARCHITECTURE.md` and `docs/DATA-MODEL.md`, which CI now checks against the code; the README, user guide and help remain.

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

Someone who forgets their password cannot get back in. The redirect to sign-in carries the page you asked for in `next` (`src/proxy.ts`), but the sign-in form and action ignore it and always land on the dashboard. The email-link callback does honour `next`. The reset email goes through Supabase Auth, which is already configured.

### 49. The weekday snapshot skips households and can double-count a day

- Type: Defect
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-22

A household with no investments gets no net-worth snapshot, because the loop continues before it. A second run on one day inserts duplicate rows, and every run is recorded as ok. Upsert by day and record real outcomes.

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

`alerts-panel.tsx` is imported nowhere, and several server actions have no caller. Delete them, or wire them up where a gap needs them (#39 needs the holdings actions). `scenario-runner.tsx` and `projection-charts.tsx` were deleted with the older engine in #29. Four dependencies are unused too: `nuqs`, `react-rnd` and `re-resizable` are imported nowhere, and `cmdk` only by `src/components/ui/command.tsx`, which nothing imports. The `ai_analyses` table has no writer.
### 53. Anyone can create an account, and no email address is confirmed

- Type: Security
- Priority: P1
- Effort: S
- Severity: Medium
- Blocker: Your go-ahead for Claude to change two Supabase Auth settings, or two minutes in Supabase
- Source: Requirements traceability, GAP-26 (found applying your answer to Q6)

Supabase allows new sign-ups and confirms every new account automatically. Anyone who finds the address can open an account, in any email address's name, and link real bank accounts to your Plaid account. Households cannot see each other, so nobody's data is exposed. The fix is in Supabase → Authentication: turn off new sign-ups and turn on email confirmation. People you want in are then invited from Authentication → Users → Invite user. Before relying on that, test that an invite link lands signed in: the app's callback expects a `code`, which invite emails may not send.

### 54. Record which member added each row

- Type: Gap
- Priority: P2
- Effort: M
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-27

Your answer to Q3 deletes a leaving member's additions, but rows are keyed by household and nothing says who added them. Add the adding member's id to accounts, holdings, contributions, goals, the net-worth tables and Plaid connections, filled from the signed-in account on every insert. Rows from before then stay with the household. #35 depends on this.

### 56. The built-in 2025 tax figures predate the July 2025 tax law

- Type: Data
- Priority: P2
- Effort: S
- Severity: Low
- Blocker: None
- Source: Requirements traceability, GAP-29

The standard deduction for married couples is $30,000 in `src/lib/tax/table.ts`. The One Big Beautiful Bill Act made it $31,500 for 2025, and added a $6,000 deduction for each person aged 65 or over, for 2025 to 2028. Verify against the IRS, then update the table and model the senior deduction, phase-out included.

### 58. Erasure and export miss snapshots of accounts deleted earlier

- Type: Defect
- Priority: P1
- Effort: S
- Severity: High
- Blocker: None
- Source: Data model review, GAP-31

`src/lib/account/delete.ts` and `src/lib/account/export.ts` find `account_snapshots` through the household's current accounts. Deleting or merging an account leaves its snapshots behind with the household's id, so they survive "delete my data" and are missing from the export. Match on the household key as well, and have `scripts/test-account-data.ts` seed a snapshot of a deleted account. While there, the audit-log and join-attempt deletes run on their own connection and commit even if the rest of erasure fails; say so in the code or order them last on purpose.

### 59. A debt secured against a deleted property or vehicle drops out of net worth

- Type: Defect
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None
- Source: Data model review, GAP-32

`composeNetWorth()` in `src/lib/net-worth/compose.ts` leaves a secured debt out of the unsecured total and attaches it to its asset. When the asset has been deleted the debt is counted nowhere, and deleting an asset never clears `debts.secured_by_*`. Clear the link when the asset is deleted, and count a debt whose asset is missing as unsecured, with a test.

### 60. Generating the next migration would repeat three that already ran

- Type: Tech Debt
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None
- Source: Data model review

Drizzle keeps a snapshot of the schema after each migration it generates. Migrations 0017 to 0019 were written by hand, so the latest snapshot is 0016's, and `pnpm db:generate` today writes a migration that recreates `goal_links`, three enums and five columns that already exist; applying it would fail. Regenerate the snapshot from the current schema without keeping the SQL, and check the next generated migration contains only the intended change.

### 61. Projections ignore the yearly tax table

- Type: Defect
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None
- Source: Architecture review, GAP-33

The Projections page and the assistant's projection never pass a tax table to the engine, so it always uses the figures built into `src/lib/tax/table.ts`. Analytics reads `tax_reference`. Updating the table for a new year changes Analytics but not the projection. Load the table once and pass it through `projectionInputs()` in `src/lib/projections/settings.ts`, with a check that both paths use the same year.

### 62. Disconnecting or erasing leaves the connection open at Plaid

- Type: Gap
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None
- Source: Architecture review, GAP-34

Disconnecting the last account on a connection, and erasing a household, delete the stored access token but never call Plaid's `/item/remove`. Plaid keeps the person's consent and the connection, and bills for it. Call it before the token is deleted, and record the outcome in the audit log.

### 63. Joining a household strands the joiner's own data

- Type: Defect
- Priority: P3
- Effort: M
- Severity: Low
- Blocker: #54
- Source: Architecture review, GAP-35

Rows a person entered before redeeming an invite stay under their own id; once they join, every request resolves to the household's id and those rows can no longer be seen or erased by them. Refuse to join while holding data, or offer to move it into the household, which needs #54 to record who added it.

### 64. No security headers or Content-Security-Policy

- Type: Security
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: Architecture review

`next.config.ts` and `vercel.json` set no headers, so pages can be framed and nothing limits where scripts load from. Add a Content-Security-Policy that allows Plaid Link, and the standard framing, referrer and content-type headers, checked in the browser tests.

### 65. A couple's Social Security starts when the first partner claims

- Type: Defect
- Priority: P1
- Effort: S
- Severity: Medium
- Blocker: None
- Source: How RetireWise works review, GAP-36

`projectionInputs()` in `src/lib/projections/settings.ts` adds both partners' benefits into one figure and starts it in the year of the earlier claim. A couple claiming at 62 and 70 is paid the larger, delayed benefit eight years early, so every projection with staggered claims overstates income and the odds. Pass each benefit with its own start year to the engine, and check a staggered case in `scripts/test-one-engine.ts`.

### 66. The Projections page shows Social Security in today's dollars beside future dollars

- Type: Defect
- Priority: P2
- Effort: S
- Severity: Low
- Blocker: None
- Source: How RetireWise works review, GAP-37

The engine records Social Security in today's dollars and everything else in each year's dollars. The drawdown table on the Projections page prints it raw next to withdrawals and balances, so late in retirement it looks about half its real size. The "Monthly Spending vs Income" card mixes the two as well and is not the engine at all. The assistant already converts it. Record it in the year's dollars in the engine, or convert it on the page, and make the card read the engine.

### 67. Settings asks for Social Security details that no calculation uses

- Type: Gap
- Priority: P3
- Effort: S
- Severity: Low
- Blocker: None
- Source: How RetireWise works review, GAP-38

The Social Security form saves a cost-of-living assumption, a planned claiming age, spousal benefits and more, but the projection reads only the benefit at full retirement age and the full retirement age itself. The cost-of-living increase is the market scenario's inflation, and the claiming age is the Projections page's control. Either use the fields or stop asking for them, and say on the form which figures the projection uses.

### 68. Some contribution records are counted wrongly in the projection

- Type: Defect
- Priority: P1
- Effort: M
- Severity: Medium
- Blocker: None
- Source: How RetireWise works review, GAP-39

Found by running the engine. A fixed-amount contribution with employer money has that money counted twice and capped with the employee's deferral (a $20,000 year projected as $23,000). A fixed-amount contribution paused today never resumes, whatever its resume date, and an account whose only contribution is paused today drops out of the projection. An inactive record listed first can set an account's method and zero its contributions. The fixes are in `src/lib/projections/build-accounts.ts` and the fixed-amount branch of `runDetailedProjection`, each with a test.

### 69. Three what-if scenarios do not do what they say

- Type: Defect
- Priority: P2
- Effort: S
- Severity: Medium
- Blocker: None
- Source: How RetireWise works review, GAP-40

On the Projections page, "Boost Savings" changes nothing for a contribution set as a percentage of salary; "Retire Earlier" starts withdrawals five years sooner but keeps contributing and leaves Social Security where it was; "Lower Returns" changes nothing when the glide path is on. Apply each override through the engine's inputs so it reaches every account and age, and give the overrides a check of their own.

### 70. Required distributions: past 95, per person, and from 75 for people born from 1960

- Type: Gap
- Priority: P3
- Effort: M
- Severity: Low
- Blocker: None
- Source: How RetireWise works review, GAP-41

`calculateRMD()` follows the IRS Uniform Lifetime Table to 95 and then a formula that divides by less than the table does (5.0 at 100), which overstates distributions and their tax in the last years of a long horizon. The engine also takes one distribution on both partners' combined balance at the primary person's age, starting at 73 for everyone. Check the divisors past 95 against IRS Publication 590-B, model each person's own balance and start age, and extend `scripts/test-rmd.ts`.

## Notes on sequencing

- Do #1 before #7: previews should lose production's data before they get data of their own.
- #4 and #5 are small and make every later release safer. Ship them before #6 changes what a release does.
- #6 waits on where the production database credential lives. #15 answers that, so decide it early even though building it can wait.
- #3, #2 and #1 need you, not code. If #3 fails, send the error line under the button.
- #11–#14 touch the same Plaid flow and can ship as one PR. None of them changes an existing connection.
- #28 and #45 are done (2–3 Oct): erasure does what the privacy page says, and the page names every recipient. When #33 lands, the page's restricted-role sentence changes with it.
- #29 and #30 are one piece of work once you answer Q9. #31 touches the same engine, so it follows them.
- #32, #33, #34, #36 and #37 are small security fixes that can ship together; #34 needs a migration, so it rides with #6.
- #53 is the quickest real risk reduction on the list: two settings, no code.
- #54 before #35: the leave action cannot delete "what the member added" until that is recorded.
- #58 is the next privacy fix: small, and it makes the erasure promise true again. #59, #61 and #62 are small and independent.
- #60 before the next schema change, or that change's migration will fail.
- #65 and #68 change the answer to "will the money last?" for real households, so they come before anything cosmetic. #66 and #69 are on the same page and can ride along.
- Q3, Q4, Q5, Q6 and Q9 were answered on 2 Oct, so no traceability item waits on a decision from you; #53 waits on your go-ahead.
- #55, #29 and #30 are done (2–3 Oct): one tested engine answers everywhere. You answered Q10 on 3 Oct: the landing-page claim stays, and the withdrawal-order comparison stays as it is.

## Done

### 57. A release could report success for a build production never served

- Type: Ops
- Closed: 2026-10-03
- In: PR 7

Found in the 3 Oct release, and opened and closed in the same pull request. The release checked the production address once, seconds before Vercel moved it, and reported a failure for a release that had gone live. Worse, it took "live" to be the latest finished build, so a second run after a real failure would have said "Already live" while production still served the old build. Live is now read from the production address itself, and the release waits up to 90 seconds for the address to move. Proved by `scripts/test-release.ts`; a dry run afterwards read the live build from the address.

### 45. The privacy page leaves out two recipients and overstates two protections

- Type: Gap
- Closed: 2026-10-03
- In: PR 6

The privacy page now names Yahoo Finance (ticker symbols, for prices), the NHTSA (a VIN, when you look one up) and Stripe (dormant), says Plaid's is the one third-party script and why, and says which parts do not yet run under the restricted database role (#33). Its erasure claim became true with #28. `scripts/test-privacy-page.ts` fails whenever the code starts sending data somewhere the page does not name.

### 42. Analytics and projections fill in age, spending and fees silently

- Type: Defect
- Closed: 2026-10-03
- In: PR 6

A missing age, retirement age or retirement-spending figure is now asked for in place of whatever needs it, with a link straight to the field in Settings: on Projections, on Analytics (where only the Sequence tab needs spending) and by the assistant, whose analytics tool had the same defaults of 42, 65 and $7,000. Spending saved on the Projections page counts as given. A fund whose fee is unknown is left out of the fee figures and counted on screen, instead of being priced at 0.15%. Proved by `scripts/test-missing-inputs.ts`.

### 29. Four calculations give different answers to "will the money last?"

- Type: Defect
- Closed: 2026-10-03
- In: PR 6

The Projections page's odds, its scenarios and the AI assistant now all run the tested engine. The odds are the engine run against 500 simulated markets from a fixed seed, so the server and the browser agree and the hydration error is gone. The page and the assistant build their inputs with the same functions from the same saved controls, so the assistant reports the page's figures. The older engine, with its 2024 brackets, and the two dead components that used it are deleted. The withdrawal-order comparison stays, on today's tax and RMD rules, pending Q10. The assistant's prompt no longer asks it to estimate dividend income. The assistant's analytics tool also starts from the Analytics page's balances at retirement, from the engine, instead of a flat annuity of its own. The demo household's odds went from 100% to 76%. Proved by `scripts/test-one-engine.ts`.

### 30. Social Security is cut differently on Projections and Analytics

- Type: Defect
- Closed: 2026-10-03
- In: PR 6

Both pages now call one function with the SSA's tiered rule: 5/9 of 1% a month for the first 36 months early, 5/12 of 1% after, 8% a year delayed to 70. Claiming at 62 against 67 now gives 70% on Projections as on Analytics, not 66.65%. Proved by `scripts/test-one-engine.ts`, which compares the two at every claiming age.

### 50. A release stops on a passing Vercel error before confirming itself

- Type: Ops
- Closed: 2026-10-02
- In: PR 5

It stopped twice on 2 Oct: a 502 on the alias check in the morning, a dropped connection while polling the build in the evening. Every read from Vercel and GitHub, and the health check, is now retried four times over about half a minute on a dropped connection, a 429 or a 5xx; starting a build is not, because it may have started anyway. A second run follows a build of the same commit that is already under way instead of starting another, and a failure after the build starts says that running again is safe. Proved by `scripts/test-release.ts`; the first dry run afterwards met a dropped connection and recovered.

### 28. Erasing a household leaves its holding snapshots behind

- Type: Security
- Closed: 2026-10-02
- In: PR 5

Erasure now deletes `holding_snapshots` (it has no foreign key, so nothing removed it) and names `goal_links` rather than relying on a cascade. The export now includes holding snapshots, goal links and the person's own attempts to join a household. `scripts/test-account-data.ts` no longer measures what is left through the export: it reads every table the database says is keyed to a household, account or member (26 today) and requires zero rows after erasure, and requires each of them to have a place in the export. Against the old code it fails on all three omissions.

### 55. The tested projection engine charges no tax and draws required distributions from Roth accounts

- Type: Defect
- Closed: 2026-10-02
- In: PR 5

`runDetailedProjection` now pays federal income tax on every withdrawal from tax-deferred money, and on the Social Security that income makes taxable, out of savings. Brackets rise with inflation. Required distributions come only from tax-deferred accounts, and any part nobody spends is reinvested after tax in a taxable account. The Projections table shows the tax and any reinvestment under each year's withdrawal. On the Q9 sample household: $273,000 of tax over retirement, the Roth at 90 $1.21M instead of $0.66M, and the balance at 90 $5.00M instead of $4.51M. Proved by `scripts/test-projection-tax.ts`.

### 43. Plan limits are mostly unenforced

- Type: Gap
- Closed: 2026-10-02
- In: Your answer to Q6: friends and family, so billing is deferred

Three of eight plan features are checked, the daily AI message limit is never applied, the chat rate limit needs Redis, and only households made through "Create household" are comped. None of it is needed for a private app. It returns only if billing is ever switched on.

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
