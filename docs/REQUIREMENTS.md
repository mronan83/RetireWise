# RetireWise requirements and feature traceability

Last reviewed: 2026-10-02

RetireWise has no written requirements specification. Everything here was derived on 2 Oct 2026 from the code at `c1b0b0a`, the user guide, the in-app help, the legal pages, the CI suite and the backlog, and then checked line by line. Treat every requirement as a proposal for you to confirm, reword or reject; the open questions at the end are the decisions only you can make.

<!--
How to edit
- One "### ID. Title" heading per entry, then its fields as a list, then a description.
- IDs are permanent. Retire a requirement by marking it Deferred, never by reusing its ID.
- Backticked repository paths are checked: `pnpm trace:check` fails if one does not exist.
- Requirement fields: Priority (Must | Should | Could), Status (Verified | Implemented | Partial | Planned | Deferred),
  Source, Features (functional) or Enforced by (non-functional), Verified by, and Backlog or Gap when Partial.
- Feature fields: Group, Status, Requirements, Code, Checks, and Backlog or Gap when Partial.
- Gap fields: Affects, Severity (High | Medium | Low), Evidence, Backlog, Status (Open | Closed YYYY-MM-DD).
- Question fields: Status (Open | Answered YYYY-MM-DD), Decides. An answer is a paragraph starting **Answer**.
- Change log lines: "- YYYY-MM-DD · what changed · who".
-->

## How this document works

Every requirement traces down to the features that deliver it, and every feature traces to the code that builds it and the checks that prove it. A requirement is only as far along as its weakest feature.

- **IDs.** Business objectives are BO-n. Functional requirements are FR-AREA-nn and non-functional ones NFR-AREA-nn. Features are F-nn. Gaps are GAP-nn, and every gap is also a backlog item (#n). Questions are Qn.
- **Statuses** are listed below the trace diagram. "Verified" is a strong claim here: the build fails unless the requirement names a check that CI actually runs.
- **Priority** is MoSCoW (Must, Should, Could) and ranks requirements. The backlog's P1–P3 ranks work items, so the two scales differ on purpose.
- **The code is the source of truth for what exists. This document is the source of truth for what is required.** Where they disagree, the difference is recorded as a gap and a backlog item, never silently fixed in either.

**How it stays true.** `pnpm trace:check` runs in CI on every push. It fails when:
- a file named here does not exist;
- a Verified status names no check that CI runs, or an Implemented status hides one;
- a page or API route belongs to no feature;
- a CI check traces to nothing;
- a gap here and its backlog item disagree about whether it is open.

A pull request that changes app code must also change this file, or say in a commit message why behaviour is unchanged. The page is regenerated from this file after every successful release, so it always describes what is live.

**Keeping it current.**
- A change that alters behaviour: Claude updates the affected rows and adds a change-log line in the same pull request.
- A new or changed requirement from you: it goes in as Planned, and Claude proposes the features, checks and backlog items it needs.
- An answered question: Claude records the answer, changes what it decides, and opens any gap it creates.

## Areas

- FR-ID: Identity and access
- FR-ACC: Accounts and linking
- FR-IMP: Imports
- FR-INV: Holdings and investment data
- FR-NW: Net worth and debts
- FR-PLAN: Planning inputs and projections
- FR-ANA: Analysis and analytics
- FR-GOAL: Goals
- FR-AI: AI assistant and reports
- FR-DATA: Exports and data rights
- FR-HH: Households and sharing
- FR-ONB: Dashboard, onboarding, help and alerts
- FR-BIL: Plans and billing
- NFR-SEC: Security and access control
- NFR-TEN: Tenancy and isolation
- NFR-PRIV: Privacy and data rights
- NFR-INT: Data integrity and honesty
- NFR-OPS: Operations and recovery
- NFR-DEL: Delivery and change control
- NFR-UX: Devices and accessibility
- NFR-PERF: Performance and limits
- NFR-DOC: Truthful documentation

## Business objectives

### BO-1. One place for a household's whole retirement picture

- Stated in: `src/app/(auth)/auth-form.tsx:37` ("Track your household's retirement in one place"); `docs/USER-GUIDE.md:21`
- Served by: FR-ACC, FR-IMP, FR-INV, FR-NW, FR-HH, FR-ONB

Every account, holding, property, cash balance and debt, for both partners, kept current with as little typing as possible.

### BO-2. Know whether retirement is on track, and what would change it

- Stated in: `src/app/page.tsx:60` ("model scenarios"); `docs/USER-GUIDE.md:66`
- Served by: FR-PLAN, FR-ANA, FR-GOAL

Projections, Monte Carlo odds, what-if scenarios and the analytics (RMDs, tax, Social Security, Roth conversions) that change a plan.

### BO-3. Guidance grounded in the household's own numbers

- Stated in: `src/app/page.tsx:60` ("intelligent recommendations"); `docs/USER-GUIDE.md:136`
- Served by: FR-AI, FR-ANA

An AI assistant that reads the household's real data through tools, on the household's own provider key, and is not investment advice (`src/app/page.tsx:148`).

### BO-4. Numbers a household can trust

- Stated in: `.github/workflows/ci.yml` (the comment above each check); `scripts/test-cost-basis.ts`
- Served by: NFR-INT, FR-INV, FR-NW, FR-PLAN

Unknown is shown as unknown, never as a plausible guess, and every figure says how fresh it is. Most of the CI suite exists because a figure once looked right and was not.

### BO-5. Private and safe by design

- Stated in: `src/app/legal/privacy/page.tsx:88` ("Nothing is sold"); `docs/data-retention.md`
- Served by: NFR-SEC, NFR-TEN, NFR-PRIV, FR-DATA

Only the household sees its data, and the household can take all of it away or erase it.

### BO-6. Little effort to keep it current

- Stated in: `docs/USER-GUIDE.md:35`; `docs/USER-GUIDE.md:104`; `docs/USER-GUIDE.md:149`
- Served by: FR-ACC, FR-IMP, FR-ONB, NFR-OPS

Linked accounts refresh themselves, statements import in one step, and alerts surface what changed.

### BO-7. A private, free tool for the owner, family and close friends

- Stated in: `src/app/legal/terms/page.tsx:26` ("no paid tier"); Q6
- Served by: FR-ID, FR-BIL, NFR-SEC, NFR-DEL

RetireWise is for the owner first, and for family and friends the owner lets in (Q6). It is not offered to the public, so nobody can join without the owner's say, and nothing is charged. The billing code stays, switched off; making it work is deferred.

## Functional requirements

### FR-ID-01. A person the owner has let in signs up with email and password, confirms by email, and signs in and out

- Priority: Must
- Status: Partial
- Source: `src/app/(auth)/auth-form.tsx`; `docs/USER-GUIDE.md:6`; Q6
- Features: F-02, F-05
- Gap: GAP-26

The app handles the confirmation step, but Supabase is set to confirm every new account automatically, so an email address is never proved to belong to the person using it. The user guide still promises Clerk and Google sign-in; the app uses Supabase email and password only (GAP-17).

### FR-ID-02. A person who forgets their password can reset it

- Priority: Must
- Status: Planned
- Source: `src/app/auth/callback/route.ts:4` (anticipates reset links that nothing sends)
- Backlog: #48

### FR-ID-03. After signing in, a person lands on the page they asked for

- Priority: Should
- Status: Partial
- Source: `src/proxy.ts:145` (sets `next`)
- Features: F-02
- Gap: GAP-21

### FR-ID-04. A visitor can explore a demo household without an account, and cannot change it

- Priority: Should
- Status: Partial
- Source: `src/app/page.tsx`; `src/lib/auth-helpers.ts`
- Features: F-01, F-04
- Verified by: `scripts/test-analysis-cards.ts`
- Gap: GAP-09

### FR-ID-05. A signed-in person can change their password

- Priority: Should
- Status: Implemented
- Source: `src/app/(dashboard)/account/password-form.tsx`
- Features: F-05

### FR-ACC-01. Add, edit and delete investment accounts by hand, with owner, type and tax treatment

- Priority: Must
- Status: Implemented
- Source: `docs/USER-GUIDE.md:35`
- Features: F-08

Owner is self, spouse or joint. Tax treatment decides which analyses apply (FR-ANA-02).

### FR-ACC-02. Link investment accounts through Plaid so holdings arrive automatically

- Priority: Must
- Status: Partial
- Source: `docs/USER-GUIDE.md:35`; `docs/USER-GUIDE.md:113`
- Features: F-09, F-11
- Backlog: #11, #13, #14

### FR-ACC-03. Link banks, cards and loans so balances arrive automatically

- Priority: Must
- Status: Partial
- Source: `src/app/(dashboard)/net-worth/page.tsx:213`
- Features: F-26
- Backlog: #3, #12

### FR-ACC-04. Linked accounts refresh daily, retry failures with backoff, and say when they need reconnecting

- Priority: Must
- Status: Partial
- Source: `docs/USER-GUIDE.md:116`; `src/lib/plaid/backoff.ts`
- Features: F-11
- Verified by: `scripts/test-ops.ts`
- Backlog: #13

Backoff is 15 minutes doubling to a 12-hour cap; eight failures in a row, or an error that needs the user, stops retrying. There is no way to reconnect in place (#13).

### FR-ACC-05. A household can refresh its linked accounts on demand

- Priority: Should
- Status: Partial
- Source: `src/components/plaid/sync-now-button.tsx`
- Features: F-10
- Gap: GAP-05

### FR-ACC-06. Disconnecting stops syncing, and a linked account can be merged with its manual twin

- Priority: Should
- Status: Implemented
- Source: `src/lib/actions/plaid.ts`; `src/lib/accounts/duplicates.ts`
- Features: F-12

### FR-ACC-07. Each account shows its value, gain, period returns and how fresh its data is

- Priority: Must
- Status: Verified
- Source: `docs/USER-GUIDE.md:38`
- Features: F-14
- Verified by: `scripts/test-performance.ts`, `scripts/test-cost-basis.ts`, `scripts/test-freshness.ts`

### FR-ACC-08. Each account page shows and manages its own contributions and holdings

- Priority: Should
- Status: Partial
- Source: `src/app/(dashboard)/accounts/[accountId]/page.tsx`
- Features: F-13
- Gap: GAP-04

The contribution form still quotes 2025 IRS limits (`src/app/(dashboard)/accounts/[accountId]/linked-contributions.tsx:441`).

### FR-IMP-01. Import holdings from a brokerage file (CSV, QFX or OFX), with a preview

- Priority: Must
- Status: Partial
- Source: `docs/USER-GUIDE.md:36`
- Features: F-20
- Verified by: `scripts/test-ofx-import.ts`
- Gap: GAP-11

### FR-IMP-02. Re-import Fidelity positions daily without duplicates

- Priority: Should
- Status: Implemented
- Source: `docs/USER-GUIDE.md:104`
- Features: F-21

Positions are updated, added and removed by ticker.

### FR-IMP-03. Import a card, loan or bank statement as a debt or cash balance, new or existing, with the sign of the balance right

- Priority: Should
- Status: Verified
- Source: `scripts/test-ofx-import.ts:1`
- Features: F-22
- Verified by: `scripts/test-ofx-import.ts`, `e2e/statement-import.spec.ts`

The sign of a card balance is read from the card's own purchases, never forced with an absolute value. Only the last four digits of an account number are kept.

### FR-IMP-04. Every import is checked against what is already recorded, and shown for review, before anything is written

- Priority: Must
- Status: Partial
- Source: Q5
- Features: F-20, F-21, F-22
- Gap: GAP-11

A file older than what is recorded is refused. A newer one is merged: positions are matched by ticker, and transactions already recorded are skipped, judged one by one rather than by the file's date. The review shows what will be added, changed and removed. A cost basis entered by hand is kept unless the file supplies one. A file with no date asks for one. Statement balances already work this way (F-22); holdings imports do not.

### FR-INV-01. See every holding across all accounts with its owner and account, and add holdings by hand

- Priority: Must
- Status: Partial
- Source: `docs/USER-GUIDE.md:42`
- Features: F-15
- Gap: GAP-12

### FR-INV-02. Cost basis can be entered, cleared, or derived from transactions only when that is provable

- Priority: Must
- Status: Verified
- Source: `.github/workflows/ci.yml` (cost-basis and investment-transaction checks)
- Features: F-16
- Verified by: `scripts/test-cost-basis.ts`, `scripts/test-investment-transactions.ts`

A manually entered basis is never overwritten. Derivation is refused after any sell, transfer or split, or when acquired shares do not match shares held.

### FR-INV-03. Prices refresh on demand and every weekday

- Priority: Must
- Status: Partial
- Source: `docs/USER-GUIDE.md:31`; `vercel.json`
- Features: F-17
- Gap: GAP-09

### FR-INV-04. Investment transactions are listed with totals and the period they cover

- Priority: Should
- Status: Partial
- Source: `docs/USER-GUIDE.md:45`
- Features: F-18
- Verified by: `scripts/test-investment-transactions.ts`
- Gap: GAP-13

### FR-INV-05. Dividend income comes only from recorded distributions, never from a guessed yield

- Priority: Must
- Status: Verified
- Source: `.github/workflows/ci.yml` (dividend check)
- Features: F-19
- Verified by: `scripts/test-dividends.ts`

An account with no reported dividends shows no figure rather than $0, and the total says what share of the portfolio it covers.

### FR-INV-06. Investment returns are time-weighted, exclude contributions, and are refused where history is too short

- Priority: Must
- Status: Verified
- Source: `.github/workflows/ci.yml` (performance check)
- Features: F-14
- Verified by: `scripts/test-performance.ts`

### FR-NW-01. Net worth is every asset minus every liability, each counted once

- Priority: Must
- Status: Verified
- Source: `docs/USER-GUIDE.md:76`
- Features: F-23
- Verified by: `scripts/test-net-worth.ts`

A debt secured against an asset replaces the loan typed onto that asset; it is never added to it. Suspected duplicates are flagged, never merged automatically.

### FR-NW-02. Record real estate, cash, vehicles and debts by hand

- Priority: Must
- Status: Verified
- Source: `docs/USER-GUIDE.md:76`
- Features: F-24
- Verified by: `e2e/debt-security.spec.ts`

### FR-NW-03. A debt can be secured against a property or vehicle, and likely double counts are flagged

- Priority: Should
- Status: Verified
- Source: `src/lib/actions/debt-security.ts`
- Features: F-25
- Verified by: `e2e/debt-security.spec.ts`, `scripts/test-net-worth.ts`

### FR-NW-04. Net worth history is kept daily and charted, in total and per item

- Priority: Should
- Status: Partial
- Source: `src/app/(dashboard)/net-worth/net-worth-history-chart.tsx`
- Features: F-27
- Verified by: `scripts/test-net-worth.ts`
- Gap: GAP-22

### FR-PLAN-01. Record the household's profile: ages, retirement targets, salaries, filing status, risk, target allocation and spending

- Priority: Must
- Status: Implemented
- Source: `docs/USER-GUIDE.md:89`
- Features: F-31

### FR-PLAN-02. Contributions are line items: a percentage or amount, employer match, vesting, escalation and pauses, capped at IRS limits

- Priority: Must
- Status: Partial
- Source: `docs/USER-GUIDE.md:120`
- Features: F-32
- Verified by: `scripts/test-analytics.ts`
- Gap: GAP-04

### FR-PLAN-03. Record Social Security for both partners, with claiming age and cost-of-living adjustment

- Priority: Must
- Status: Partial
- Source: `src/app/(dashboard)/settings/social-security-form.tsx`
- Features: F-33
- Gap: GAP-03

### FR-PLAN-04. A year-by-year retirement projection with controls that persist

- Priority: Must
- Status: Partial
- Source: `docs/USER-GUIDE.md:66`
- Features: F-34
- Verified by: `scripts/test-analytics.ts`
- Gap: GAP-02

Spending is inflated from today, not from the year retirement starts. Withdrawals never fall below the required minimum distribution. Every screen and the assistant use this one tested engine, including for the odds that savings last (Q9).

### FR-PLAN-05. Monte Carlo simulation gives the odds that savings last

- Priority: Should
- Status: Partial
- Source: `docs/USER-GUIDE.md:70` ("500 simulated scenarios")
- Features: F-34
- Gap: GAP-02

### FR-PLAN-06. Compare what-if scenarios side by side

- Priority: Should
- Status: Partial
- Source: `docs/USER-GUIDE.md:73`
- Features: F-35
- Gap: GAP-02

The six scenarios are a 30% crash, retiring five years earlier, saving 50% more, a 4% return, 5% inflation, and Social Security cut by 25%.

### FR-PLAN-07. Required minimum distributions are computed correctly, starting at 73

- Priority: Must
- Status: Verified
- Source: `.github/workflows/ci.yml` (RMD check)
- Features: F-37
- Verified by: `scripts/test-rmd.ts`

Headline figures read the first row aged 73 or over, not the retirement-age row. The rule that RMDs start at 75 for people born in 1960 or later is not modelled; see Q9.

### FR-PLAN-08. Tax brackets and contribution limits come from a reference table for the year, which says which year it is using

- Priority: Must
- Status: Partial
- Source: `docs/annual-tax-update.md`
- Features: F-36, F-37
- Verified by: `scripts/test-tax-reference.ts`
- Gap: GAP-04, GAP-29

A half-loaded year is refused and the newest complete year is used; a table a year or more behind says so. The projection engine does not read the limits table (GAP-04).

### FR-PLAN-09. Projections and analytics ask for missing inputs rather than assume them

- Priority: Should
- Status: Partial
- Source: `.github/workflows/ci.yml` (onboarding check: "stop a projection being believed before its inputs exist")
- Features: F-34, F-37
- Gap: GAP-15

When current age or retirement spending is missing, a figure that depends on it is not shown. In its place, a short note says what is needed and why, with a link straight to the field in Settings; the figure appears as soon as the value is set. A fund whose fee is unknown is left out of the fee total, and the page says how many funds were left out (Q4).

### FR-PLAN-10. A projection pays income tax on what it withdraws, and takes each withdrawal from the right account

- Priority: Must
- Status: Verified
- Source: Q9 comparison, 2 Oct
- Features: F-34
- Verified by: `scripts/test-projection-tax.ts`

Withdrawals from tax-deferred accounts are taxed, with the Social Security they make taxable, and the tax comes out of savings. Brackets rise with inflation; the Social Security thresholds, fixed in law, do not. A required minimum distribution comes only from tax-deferred accounts. Any amount beyond what is spent is reinvested, after tax, in a taxable account rather than disappearing.

Not modelled: state tax, capital gains on taxable-account withdrawals (treated as return of principal), and filing statuses other than married filing jointly. The 2025 figures predate the July 2025 law (GAP-29).

### FR-ANA-01. Nine analyses: RMD, tax, Roth conversion ladder, Social Security break-even, catch-up, income replacement, fees, sequence risk, healthcare

- Priority: Must
- Status: Verified
- Source: `src/app/(dashboard)/analytics/analytics-dashboard.tsx`
- Features: F-37
- Verified by: `scripts/test-analytics.ts`, `scripts/test-rmd.ts`

### FR-ANA-02. One-click analysis prompts, offered only where they apply

- Priority: Should
- Status: Verified
- Source: `docs/USER-GUIDE.md:48`
- Features: F-38
- Verified by: `scripts/test-analysis-cards.ts`

Tax-loss harvesting is offered only to a household with a taxable account, and no built feature is labelled unbuilt.

### FR-GOAL-01. Goals to build up or pay down, measured over their own linked accounts and debts

- Priority: Must
- Status: Verified
- Source: `.github/workflows/ci.yml` (goals check)
- Features: F-30
- Verified by: `scripts/test-goals.ts`, `e2e/goals.spec.ts`

Progress is not capped at 100%, and a goal closes once when it is met and stays closed.

### FR-AI-01. An AI assistant answers questions about the household's own data, on every page

- Priority: Must
- Status: Partial
- Source: `docs/USER-GUIDE.md:64`
- Features: F-39
- Gap: GAP-06

It has eleven read-only tools and at most ten steps per answer.

### FR-AI-02. The assistant runs on the household's own provider key; the app never spends its own

- Priority: Must
- Status: Verified
- Source: `.env.example` (AI provider section)
- Features: F-40
- Verified by: `e2e/entitlements.spec.ts`

The provider is Claude, Gemini or OpenAI. A missing key is an error, never a silent fallback.

### FR-AI-03. AI reports: per-analysis and dashboard infographics

- Priority: Could
- Status: Verified
- Source: `src/app/api/report/analysis/route.ts`
- Features: F-41
- Verified by: `scripts/test-analysis-cards.ts`

### FR-AI-04. The assistant never states a figure the data does not support, and agrees with the screens

- Priority: Must
- Status: Partial
- Source: `.github/workflows/ci.yml` (dividend check)
- Features: F-39, F-19
- Verified by: `scripts/test-dividends.ts`
- Gap: GAP-02

### FR-DATA-01. Export a portfolio report and holdings and transactions as CSV

- Priority: Should
- Status: Partial
- Source: `docs/USER-GUIDE.md:170`
- Features: F-42
- Gap: GAP-20

### FR-DATA-02. Download everything held about the household as one file, without secrets

- Priority: Must
- Status: Partial
- Source: `src/app/legal/privacy/page.tsx:118`
- Features: F-42
- Verified by: `scripts/test-account-data.ts`
- Gap: GAP-01

### FR-DATA-03. The household owner can erase all of its data

- Priority: Must
- Status: Partial
- Source: `docs/data-retention.md`; `src/app/legal/privacy/page.tsx:107`
- Features: F-42
- Verified by: `scripts/test-account-data.ts`
- Gap: GAP-01

Erasure requires typing "DELETE MY DATA" and is refused in demo mode. It removes the household's data, not the sign-in itself.

### FR-HH-01. Two partners share one household through single-use, expiring invite codes

- Priority: Must
- Status: Verified
- Source: `src/app/(dashboard)/settings/household-sharing.tsx`
- Features: F-43
- Verified by: `scripts/test-invites.ts`

Only the owner issues and revokes codes. A code expires after seven days and works once.

### FR-HH-02. A member can leave the household, and the owner can remove a member; what that member added is deleted

- Priority: Should
- Status: Planned
- Source: `src/app/api/account/delete/route.ts:57` (tells members they can leave); Q3
- Backlog: #35, #54
- Gap: GAP-08, GAP-27

Leaving, or being removed, deletes every row the member added and disconnects the bank connections they linked, at Plaid as well as here (Q3). Before it happens, the member is shown what will be deleted. Rows from before the app recorded who added what stay with the household.

### FR-HH-03. Household figures split by owner: self, spouse and joint

- Priority: Should
- Status: Implemented
- Source: `docs/USER-GUIDE.md:23`
- Features: F-28

### FR-ONB-01. A new household is guided through setup, and an empty one lands on the checklist

- Priority: Must
- Status: Partial
- Source: `docs/USER-GUIDE.md:8`
- Features: F-06
- Verified by: `scripts/test-onboarding.ts`
- Gap: GAP-14

### FR-ONB-02. In-app help explains the calculations and how to fix common problems

- Priority: Should
- Status: Partial
- Source: `src/app/(dashboard)/help/help-content.tsx`
- Features: F-07
- Gap: GAP-17

### FR-ONB-03. Alerts for allocation drift, large daily moves and concentration, each dismissible

- Priority: Should
- Status: Implemented
- Source: `docs/USER-GUIDE.md:149`
- Features: F-29

The thresholds are drift above 5%, a daily move above 2% and a holding above 25% of the portfolio.

### FR-ONB-04. The dashboard summarises the household: totals, allocation, performance, goals, accounts and holdings

- Priority: Must
- Status: Implemented
- Source: `docs/USER-GUIDE.md:21`
- Features: F-28

### FR-BIL-01. Every household gets the full product while billing is off, and a paid plan can be switched on by configuration

- Priority: Could
- Status: Deferred
- Source: `src/lib/billing/plans.ts:7`; Q6
- Features: F-44
- Verified by: `e2e/entitlements.spec.ts`

Deferred by Q6: RetireWise is not offered to the public. Every household keeps the full product, which the entitlement check still proves; enforcing paid-plan limits is not pursued.

## Non-functional requirements

### NFR-SEC-01. Every signed-in page and API needs a verified session; signed-out visitors are redirected, never shown an error

- Priority: Must
- Status: Verified
- Enforced by: `src/proxy.ts`, `src/lib/auth.ts`
- Source: `.github/workflows/ci.yml` (protected-routes check)
- Verified by: `scripts/check-protected-routes.ts`, `e2e/signed-out.spec.ts`

### NFR-SEC-02. Secrets at rest are encrypted, and their keys can be rotated

- Priority: Must
- Status: Partial
- Enforced by: `src/lib/plaid/encryption.ts`, `src/lib/utils/encryption.ts`, `src/lib/crypto/keyring.ts`, `scripts/rotate-keys.ts`
- Source: `docs/incident-response.md`
- Verified by: `scripts/test-ops.ts`
- Backlog: #9

Plaid access tokens and AI provider keys are sealed with AES-256-GCM.

### NFR-SEC-03. Demo mode cannot change anything

- Priority: Must
- Status: Partial
- Enforced by: `src/lib/auth-helpers.ts`
- Source: `.github/workflows/ci.yml` (analysis-cards check)
- Verified by: `scripts/test-analysis-cards.ts`
- Gap: GAP-09

### NFR-SEC-04. Machine endpoints authenticate themselves: cron jobs by secret, Plaid and Stripe webhooks by signature

- Priority: Must
- Status: Partial
- Enforced by: `src/app/api/cron/refresh/route.ts`, `src/lib/plaid/webhook-verify.ts`, `src/app/api/billing/webhook/route.ts`
- Source: `src/proxy.ts:33`
- Gap: GAP-10

### NFR-SEC-05. Unreviewed code never holds production credentials

- Priority: Must
- Status: Partial
- Enforced by: Vercel environment-variable targets
- Source: [Delivery review G1](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)
- Backlog: #1

### NFR-SEC-06. Invite codes cannot be guessed or probed

- Priority: Must
- Status: Verified
- Enforced by: `src/lib/invites.ts`, `src/app/api/household/join/route.ts`
- Source: `.github/workflows/ci.yml` (invite check)
- Verified by: `scripts/test-invites.ts`

Codes carry 80 bits of randomness and only their hash is stored. Failed redemptions are limited to ten per account per hour, and every refusal reads the same.

### NFR-SEC-07. Abuse limits on costly actions

- Priority: Could
- Status: Implemented
- Enforced by: `src/lib/redis.ts`, `src/app/api/plaid/sync/route.ts`
- Source: `src/app/api/chat/route.ts`

AI chat is limited to 30 messages a minute per household, and an on-demand sync to once every two minutes per institution. The chat limit applies only when Redis is configured. For a private app (Q6) the defence that matters is who can get in (NFR-SEC-08); each household pays for its own AI use with its own key.

### NFR-SEC-08. Only people the owner has let in can create an account

- Priority: Must
- Status: Planned
- Enforced by: Supabase Auth settings (sign-up and email confirmation), outside the repository
- Source: Q6
- Gap: GAP-26

Anyone who finds the address can sign up today and link real bank accounts. That stores a stranger's financial data in the owner's database and adds connections to the owner's Plaid account. The control has to sit in Supabase, not only in the app: the sign-up endpoint is public, so a check in the sign-up form alone could be bypassed.

### NFR-TEN-01. One household never sees or changes another's data

- Priority: Must
- Status: Verified
- Enforced by: `src/lib/db/tenant.ts`, `src/lib/auth-helpers.ts`, `src/lib/db/migrations/0009_row_level_security.sql`
- Source: `.github/workflows/ci.yml` (RLS check)
- Verified by: `scripts/test-rls.ts`

Household work runs as a database role with no bypass, under row-level security keyed to the household.

### NFR-TEN-02. Every entry point that reads household data runs under that restricted role

- Priority: Must
- Status: Partial
- Enforced by: `scripts/check-tenant-scope.ts`
- Source: `src/app/legal/privacy/page.tsx:99`
- Verified by: `scripts/check-tenant-scope.ts`
- Gap: GAP-06

### NFR-TEN-03. An account belongs to at most one household, and only an invite adds someone to one

- Priority: Must
- Status: Partial
- Enforced by: `src/lib/invites.ts`, `src/lib/household.ts`
- Source: `src/lib/invites.ts`
- Gap: GAP-07

### NFR-PRIV-01. Erasure removes every row about the household, and export includes every row

- Priority: Must
- Status: Partial
- Enforced by: `src/lib/account/delete.ts`, `src/lib/account/export.ts`
- Source: `docs/data-retention.md`; `src/app/legal/privacy/page.tsx:107`
- Verified by: `scripts/test-account-data.ts`
- Gap: GAP-01

### NFR-PRIV-02. Exports never contain secrets

- Priority: Must
- Status: Verified
- Enforced by: `src/lib/account/export.ts`
- Source: `.github/workflows/ci.yml` (account-data check)
- Verified by: `scripts/test-account-data.ts`

### NFR-PRIV-03. The privacy page names every party that receives data and claims only what the code does

- Priority: Must
- Status: Partial
- Enforced by: `src/app/legal/privacy/page.tsx`
- Source: `src/app/legal/privacy/page.tsx`
- Gap: GAP-18

### NFR-PRIV-04. Actions that change access or remove data are recorded in an append-only audit log, with who acted

- Priority: Should
- Status: Partial
- Enforced by: `src/lib/audit.ts`
- Source: `docs/incident-response.md`
- Gap: GAP-19

### NFR-INT-01. Unknown is shown as unknown, never as a plausible number

- Priority: Must
- Status: Verified
- Enforced by: `src/lib/utils/cost-basis.ts`, `src/lib/utils/dividends.ts`, `src/lib/performance/twr.ts`
- Source: `.github/workflows/ci.yml` (cost-basis, dividend and performance checks)
- Verified by: `scripts/test-cost-basis.ts`, `scripts/test-dividends.ts`, `scripts/test-performance.ts`

This applies to cost basis, gains, returns and dividend income.

### NFR-INT-02. Every total says how fresh its oldest input is

- Priority: Must
- Status: Verified
- Enforced by: `src/lib/utils/freshness.ts`
- Source: `.github/workflows/ci.yml` (freshness check)
- Verified by: `scripts/test-freshness.ts`

### NFR-INT-03. Identifiers from outside services stay consistent

- Priority: Must
- Status: Partial
- Enforced by: `src/lib/plaid/sync.ts`
- Source: `src/app/api/cron/refresh/route.ts`
- Gap: GAP-05

### NFR-INT-04. An import or sync never destroys data the household entered

- Priority: Must
- Status: Partial
- Enforced by: `src/lib/plaid/sync.ts` (a manual cost basis is never overwritten)
- Source: `.github/workflows/ci.yml` (cost-basis check); Q5
- Gap: GAP-11

### NFR-INT-05. A check proves what its label says

- Priority: Should
- Status: Partial
- Enforced by: `.github/workflows/ci.yml`
- Source: `scripts/test-analytics.ts:235`
- Gap: GAP-24

A check that restates a rule locally, or never triggers the case it names, makes "Verified" claim more than it proves.

### NFR-OPS-01. Scheduled refresh and snapshots run unattended, record each run, and degrade health when stale

- Priority: Must
- Status: Partial
- Enforced by: `src/app/api/cron/refresh/route.ts`, `src/app/api/cron/snapshot/route.ts`, `src/app/api/health/freshness/route.ts`, `vercel.json`
- Source: `docs/DATA-FLOW.md`
- Verified by: `scripts/test-ops.ts`
- Gap: GAP-22

### NFR-OPS-02. Someone is told within minutes when production breaks

- Priority: Must
- Status: Partial
- Enforced by: `src/app/api/health/route.ts`
- Source: [Delivery review G3](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)
- Backlog: #2, #20

### NFR-OPS-03. Data can be recovered within the stated targets, and recovery has been rehearsed

- Priority: Must
- Status: Partial
- Enforced by: Supabase daily backups
- Source: `docs/disaster-recovery.md`
- Backlog: #17

The stated targets are up to 24 hours of data lost (RPO) and four hours to restore (RTO).

### NFR-OPS-04. Errors reach someone who can act on them

- Priority: Should
- Status: Planned
- Source: [Delivery review G3](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)
- Backlog: #8

### NFR-DEL-01. Production changes only on the owner's command, from a commit on main with green CI, and can be rolled back in one step

- Priority: Must
- Status: Partial
- Enforced by: `scripts/deploy-production.ts`, `vercel.json`
- Source: `AGENTS.md`
- Gap: GAP-23

### NFR-DEL-02. The backlog and this document are checked in CI and published only after a successful release

- Priority: Must
- Status: Verified
- Enforced by: `scripts/build-backlog.ts`, `scripts/build-traceability.ts`, `scripts/deploy-production.ts`
- Source: `AGENTS.md`
- Verified by: `scripts/build-backlog.ts`, `scripts/build-traceability.ts`

### NFR-DEL-03. No change reaches main without review and green CI

- Priority: Should
- Status: Partial
- Enforced by: `.github/workflows/ci.yml`
- Source: [Delivery review G4](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)
- Backlog: #16

### NFR-DEL-04. Schema changes are released with the code that needs them

- Priority: Must
- Status: Partial
- Enforced by: `drizzle.config.ts`
- Source: [Delivery review G2](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)
- Backlog: #6

### NFR-DEL-05. Code that nothing uses is removed

- Priority: Could
- Status: Partial
- Enforced by: `eslint.config.mjs`
- Source: `src/app/(dashboard)/projections/scenario-runner.tsx` (imported nowhere)
- Gap: GAP-25

### NFR-UX-01. Every page fits a phone screen without sideways scrolling or inputs small enough to zoom

- Priority: Must
- Status: Verified
- Enforced by: `src/app/layout.tsx`
- Source: `playwright.config.ts`
- Verified by: `e2e/mobile-layout.spec.ts`

The devices tested are iPhone SE and iPhone 13 (WebKit) and Pixel 7 (Chromium).

### NFR-UX-02. Dialogs and sheets fit the screen and keep their action reachable

- Priority: Must
- Status: Verified
- Enforced by: `src/components/dashboard/sidebar-nav.tsx`
- Source: `playwright.config.ts`
- Verified by: `e2e/mobile-overlays.spec.ts`

### NFR-UX-03. Desktop browsers, keyboard use and screen readers are supported and checked

- Priority: Should
- Status: Planned
- Source: `playwright.config.ts` (phones only)

The scope is Q8.

### NFR-PERF-01. Long jobs are bounded and never overload a provider

- Priority: Should
- Status: Implemented
- Enforced by: `src/app/api/cron/refresh/route.ts`
- Source: `src/app/api/cron/refresh/route.ts`

The refresh job stops within a 230-second budget, three items at a time, at most 300 a run.

### NFR-PERF-02. Prices are cached so repeated views do not refetch them

- Priority: Could
- Status: Implemented
- Enforced by: `src/lib/redis.ts`, `src/lib/utils/price-feed.ts`
- Source: `src/lib/redis.ts`

Prices are cached for 15 minutes, when Redis is configured.

### NFR-DOC-01. What users and maintainers read matches the app

- Priority: Should
- Status: Partial
- Enforced by: `docs/USER-GUIDE.md`, `src/app/(dashboard)/help/help-content.tsx`, `docs/ARCHITECTURE.md`, `docs/DATA-FLOW.md`, `README.md`
- Source: `docs/USER-GUIDE.md`
- Gap: GAP-17

## Features

### F-01. Public landing page and demo entry

- Group: Access and identity
- Status: Verified
- Requirements: FR-ID-04
- Code: `src/app/page.tsx`, `src/proxy.ts`
- Checks: `scripts/test-analysis-cards.ts`

"Try Demo" appears only when demo mode is switched on, using the same test the proxy uses.

### F-02. Email sign-up and sign-in

- Group: Access and identity
- Status: Partial
- Requirements: FR-ID-01, FR-ID-03
- Code: `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/auth-form.tsx`, `src/lib/actions/auth.ts`, `src/app/auth/callback/route.ts`
- Checks: none
- Gap: GAP-21

### F-03. Protected routes

- Group: Access and identity
- Status: Verified
- Requirements: NFR-SEC-01
- Code: `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/auth-helpers.ts`
- Checks: `scripts/check-protected-routes.ts`, `e2e/signed-out.spec.ts`

### F-04. Read-only demo household

- Group: Access and identity
- Status: Partial
- Requirements: FR-ID-04, NFR-SEC-03
- Code: `src/lib/auth-helpers.ts`, `src/components/dashboard/demo-banner.tsx`, `src/app/(dashboard)/layout.tsx`, `scripts/seed-demo.ts`
- Checks: `scripts/test-analysis-cards.ts`
- Gap: GAP-09

### F-05. Login account page

- Group: Access and identity
- Status: Implemented
- Requirements: FR-ID-01, FR-ID-05
- Code: `src/app/(dashboard)/account/page.tsx`, `src/app/(dashboard)/account/password-form.tsx`, `src/components/dashboard/user-menu.tsx`
- Checks: none

### F-06. Setup checklist

- Group: Dashboard and guidance
- Status: Partial
- Requirements: FR-ONB-01
- Code: `src/lib/onboarding.ts`, `src/app/(dashboard)/onboarding/page.tsx`, `src/app/(dashboard)/dashboard/setup-banner.tsx`
- Checks: `scripts/test-onboarding.ts`
- Gap: GAP-14

### F-07. Help centre

- Group: Dashboard and guidance
- Status: Partial
- Requirements: FR-ONB-02, NFR-DOC-01
- Code: `src/app/(dashboard)/help/page.tsx`, `src/app/(dashboard)/help/help-content.tsx`
- Checks: none
- Gap: GAP-17

### F-08. Manual investment accounts

- Group: Accounts and linking
- Status: Implemented
- Requirements: FR-ACC-01
- Code: `src/app/(dashboard)/accounts/page.tsx`, `src/app/(dashboard)/accounts/add-account-button.tsx`, `src/components/forms/account-form.tsx`, `src/lib/actions/accounts.ts`, `src/lib/queries/accounts.ts`
- Checks: none

### F-09. Plaid investment linking

- Group: Accounts and linking
- Status: Partial
- Requirements: FR-ACC-02, NFR-SEC-02
- Code: `src/components/plaid/plaid-link-button.tsx`, `src/app/api/plaid/create-link-token/route.ts`, `src/app/api/plaid/exchange-token/route.ts`, `src/lib/plaid/sync.ts`, `src/lib/plaid/encryption.ts`
- Checks: none
- Backlog: #11, #13

### F-10. Sync now

- Group: Accounts and linking
- Status: Partial
- Requirements: FR-ACC-05, NFR-INT-03
- Code: `src/components/plaid/sync-now-button.tsx`, `src/app/api/plaid/sync/route.ts`
- Checks: none
- Gap: GAP-05

### F-11. Daily linked-account refresh and webhooks

- Group: Accounts and linking
- Status: Partial
- Requirements: FR-ACC-02, FR-ACC-04, NFR-SEC-04
- Code: `src/app/api/cron/refresh/route.ts`, `src/lib/plaid/backoff.ts`, `src/app/api/plaid/webhook/route.ts`, `src/lib/plaid/webhook-verify.ts`, `src/components/ui/last-updated.tsx`, `vercel.json`
- Checks: `scripts/test-ops.ts`
- Backlog: #13, #14

### F-12. Disconnect and merge duplicate accounts

- Group: Accounts and linking
- Status: Implemented
- Requirements: FR-ACC-06
- Code: `src/lib/actions/plaid.ts`, `src/app/(dashboard)/accounts/duplicate-review.tsx`, `src/lib/accounts/duplicates.ts`, `src/app/(dashboard)/accounts/[accountId]/account-actions.tsx`
- Checks: none

### F-13. Account detail and linked contributions

- Group: Accounts and linking
- Status: Partial
- Requirements: FR-ACC-08
- Code: `src/app/(dashboard)/accounts/[accountId]/page.tsx`, `src/app/(dashboard)/accounts/[accountId]/linked-contributions.tsx`, `src/app/(dashboard)/accounts/[accountId]/add-holding-button.tsx`
- Checks: none
- Gap: GAP-04

### F-14. Account values, returns and freshness

- Group: Holdings and investments
- Status: Verified
- Requirements: FR-ACC-07, FR-INV-06, NFR-INT-01, NFR-INT-02
- Code: `src/components/dashboard/account-card.tsx`, `src/lib/performance/twr.ts`, `src/lib/utils/cost-basis.ts`, `src/lib/utils/freshness.ts`, `src/lib/queries/snapshots.ts`
- Checks: `scripts/test-performance.ts`, `scripts/test-cost-basis.ts`, `scripts/test-freshness.ts`

### F-15. Holdings list and manual add

- Group: Holdings and investments
- Status: Partial
- Requirements: FR-INV-01
- Code: `src/app/(dashboard)/holdings/page.tsx`, `src/components/dashboard/holdings-table.tsx`, `src/components/forms/holding-form.tsx`, `src/lib/actions/holdings.ts`, `src/lib/queries/holdings.ts`
- Checks: none
- Gap: GAP-12

### F-16. Cost basis

- Group: Holdings and investments
- Status: Verified
- Requirements: FR-INV-02, NFR-INT-01
- Code: `src/components/forms/cost-basis-dialog.tsx`, `src/lib/actions/holdings.ts`, `src/lib/utils/cost-basis.ts`, `src/lib/plaid/investment-transactions.ts`
- Checks: `scripts/test-cost-basis.ts`, `scripts/test-investment-transactions.ts`

### F-17. Price refresh

- Group: Holdings and investments
- Status: Partial
- Requirements: FR-INV-03
- Code: `src/components/dashboard/refresh-prices-button.tsx`, `src/app/api/prices/refresh/route.ts`, `src/lib/utils/price-feed.ts`, `src/lib/redis.ts`
- Checks: none
- Gap: GAP-09

### F-18. Transaction history

- Group: Holdings and investments
- Status: Partial
- Requirements: FR-INV-04
- Code: `src/app/(dashboard)/transactions/page.tsx`, `src/lib/plaid/investment-transactions.ts`
- Checks: `scripts/test-investment-transactions.ts`
- Gap: GAP-13

### F-19. Recorded dividend income

- Group: Holdings and investments
- Status: Verified
- Requirements: FR-INV-05, FR-AI-04, NFR-INT-01
- Code: `src/lib/utils/dividends.ts`, `src/lib/queries/dividends.ts`, `src/lib/tools/get-dividend-income.ts`
- Checks: `scripts/test-dividends.ts`

### F-20. Holdings file import

- Group: Imports
- Status: Partial
- Requirements: FR-IMP-01, FR-IMP-04, NFR-INT-04
- Code: `src/app/(dashboard)/import/page.tsx`, `src/app/(dashboard)/import/csv-import-form.tsx`, `src/lib/utils/csv-parser.ts`, `src/lib/actions/import.ts`
- Checks: `scripts/test-ofx-import.ts`
- Gap: GAP-11

### F-21. Fidelity quick import

- Group: Imports
- Status: Partial
- Requirements: FR-IMP-02, FR-IMP-04
- Code: `src/components/forms/fidelity-import.tsx`, `src/lib/actions/import.ts`
- Checks: none
- Gap: GAP-11

Merges by ticker, but with no date check or review: a position missing from the file is removed, and the file's cost basis replaces one entered by hand.

### F-22. Statement balance import

- Group: Imports
- Status: Verified
- Requirements: FR-IMP-03, FR-IMP-04
- Code: `src/app/(dashboard)/import/statement-import.tsx`, `src/lib/import/ofx.ts`, `src/lib/actions/import-statement.ts`
- Checks: `scripts/test-ofx-import.ts`, `e2e/statement-import.spec.ts`

### F-23. Net worth summary

- Group: Net worth and debts
- Status: Verified
- Requirements: FR-NW-01
- Code: `src/app/(dashboard)/net-worth/page.tsx`, `src/lib/net-worth/compose.ts`, `src/lib/net-worth/load.ts`, `src/components/dashboard/net-worth-card.tsx`
- Checks: `scripts/test-net-worth.ts`

### F-24. Manual assets and debts

- Group: Net worth and debts
- Status: Verified
- Requirements: FR-NW-02
- Code: `src/app/(dashboard)/net-worth/net-worth-forms.tsx`, `src/lib/actions/net-worth.ts`, `src/lib/actions/vehicles.ts`, `src/lib/constants-net-worth.ts`
- Checks: `e2e/debt-security.spec.ts`

### F-25. Secured debts and duplicate review

- Group: Net worth and debts
- Status: Verified
- Requirements: FR-NW-03
- Code: `src/lib/actions/debt-security.ts`, `src/app/(dashboard)/net-worth/secured-debt-review.tsx`, `src/app/(dashboard)/net-worth/duplicate-cash-review.tsx`
- Checks: `e2e/debt-security.spec.ts`, `scripts/test-net-worth.ts`

### F-26. Bank, card and loan linking

- Group: Net worth and debts
- Status: Partial
- Requirements: FR-ACC-03
- Code: `src/components/plaid/plaid-link-button.tsx`, `src/app/api/plaid/create-link-token/route.ts`, `src/lib/plaid/sync.ts`
- Checks: none
- Backlog: #3, #12

### F-27. Net worth history

- Group: Net worth and debts
- Status: Partial
- Requirements: FR-NW-04
- Code: `src/lib/utils/net-worth-snapshot.ts`, `src/lib/utils/record-item-history.ts`, `src/app/(dashboard)/net-worth/net-worth-history-chart.tsx`, `src/app/(dashboard)/net-worth/item-history-chart.tsx`
- Checks: `scripts/test-net-worth.ts`
- Gap: GAP-22

### F-28. Portfolio dashboard

- Group: Dashboard and guidance
- Status: Implemented
- Requirements: FR-ONB-04, FR-HH-03
- Code: `src/app/(dashboard)/dashboard/page.tsx`, `src/components/dashboard/portfolio-summary-card.tsx`, `src/components/dashboard/allocation-chart.tsx`, `src/components/dashboard/performance-chart.tsx`, `src/lib/utils/calculations.ts`
- Checks: none

### F-29. Alerts

- Group: Dashboard and guidance
- Status: Implemented
- Requirements: FR-ONB-03
- Code: `src/lib/utils/alert-generator.ts`, `src/components/dashboard/notification-bell.tsx`, `src/app/api/alerts/route.ts`, `src/app/api/alerts/dismiss/route.ts`, `src/app/api/alerts/dismiss-all/route.ts`
- Checks: none

### F-30. Linked goals

- Group: Planning
- Status: Verified
- Requirements: FR-GOAL-01
- Code: `src/lib/goals/progress.ts`, `src/components/dashboard/goals-panel.tsx`, `src/lib/actions/goals.ts`, `src/lib/queries/goals.ts`
- Checks: `scripts/test-goals.ts`, `e2e/goals.spec.ts`

### F-31. Household profile and settings

- Group: Planning
- Status: Implemented
- Requirements: FR-PLAN-01
- Code: `src/app/(dashboard)/settings/page.tsx`, `src/app/(dashboard)/settings/preferences-form.tsx`, `src/lib/actions/preferences.ts`, `src/lib/utils/salary-growth.ts`
- Checks: none

### F-32. Contribution line items

- Group: Planning
- Status: Partial
- Requirements: FR-PLAN-02
- Code: `src/app/(dashboard)/settings/contributions-section.tsx`, `src/lib/actions/contributions.ts`, `src/lib/utils/contributions.ts`
- Checks: `scripts/test-analytics.ts`
- Gap: GAP-04

### F-33. Social Security estimates

- Group: Planning
- Status: Partial
- Requirements: FR-PLAN-03
- Code: `src/app/(dashboard)/settings/social-security-form.tsx`, `src/lib/actions/social-security.ts`
- Checks: none
- Gap: GAP-03

### F-34. Interactive retirement projection and Monte Carlo

- Group: Planning
- Status: Partial
- Requirements: FR-PLAN-04, FR-PLAN-05, FR-PLAN-09, FR-PLAN-10
- Code: `src/app/(dashboard)/projections/page.tsx`, `src/app/(dashboard)/projections/interactive-controls.tsx`, `src/lib/utils/projection-scenarios.ts`, `src/lib/utils/glide-path.ts`, `src/lib/projections/build-accounts.ts`, `src/app/api/settings/projection-controls/route.ts`
- Checks: `scripts/test-analytics.ts`, `scripts/test-projection-tax.ts`
- Gap: GAP-02, GAP-15

### F-35. What-if scenarios

- Group: Planning
- Status: Partial
- Requirements: FR-PLAN-06
- Code: `src/app/(dashboard)/projections/interactive-controls.tsx`, `src/lib/utils/projection-scenarios.ts`
- Checks: none
- Gap: GAP-02

### F-36. IRS limits and tax reference

- Group: Planning
- Status: Partial
- Requirements: FR-PLAN-08
- Code: `src/app/api/irs-limits/refresh/route.ts`, `src/app/(dashboard)/settings/irs-limits-section.tsx`, `src/lib/tax/seed.ts`, `src/lib/tax/table.ts`, `src/components/ui/tax-year-badge.tsx`
- Checks: `scripts/test-tax-reference.ts`
- Gap: GAP-04, GAP-09

### F-37. Financial analytics

- Group: Analysis
- Status: Partial
- Requirements: FR-PLAN-07, FR-PLAN-08, FR-PLAN-09, FR-ANA-01
- Code: `src/app/(dashboard)/analytics/page.tsx`, `src/app/(dashboard)/analytics/analytics-dashboard.tsx`, `src/lib/utils/financial-analytics.ts`, `src/lib/tax/load.ts`
- Checks: `scripts/test-analytics.ts`, `scripts/test-rmd.ts`, `scripts/test-tax-reference.ts`
- Gap: GAP-15

### F-38. AI analysis cards

- Group: Analysis
- Status: Verified
- Requirements: FR-ANA-02
- Code: `src/app/(dashboard)/analysis/page.tsx`, `src/app/(dashboard)/analysis/analysis-cards.tsx`, `src/lib/utils/taxability.ts`, `src/lib/utils/chat-events.ts`
- Checks: `scripts/test-analysis-cards.ts`

### F-39. AI chat assistant

- Group: AI assistant
- Status: Partial
- Requirements: FR-AI-01, FR-AI-04, NFR-TEN-02
- Code: `src/app/api/chat/route.ts`, `src/components/ai/chat-panel.tsx`, `src/lib/ai/user-model.ts`, `src/lib/tools/get-net-worth.ts`, `src/lib/tools/run-financial-analytics.ts`, `src/lib/tools/run-retirement-projection.ts`
- Checks: `scripts/test-dividends.ts`, `scripts/test-net-worth.ts`
- Gap: GAP-02, GAP-06

### F-40. AI provider and model settings

- Group: AI assistant
- Status: Partial
- Requirements: FR-AI-02, NFR-SEC-02
- Code: `src/app/api/settings/ai-provider/route.ts`, `src/app/(dashboard)/settings/ai-provider-section.tsx`, `src/lib/ai/models.ts`, `src/lib/utils/encryption.ts`, `src/lib/crypto/keyring.ts`
- Checks: `e2e/entitlements.spec.ts`, `scripts/test-ops.ts`
- Backlog: #9

### F-41. AI reports

- Group: AI assistant
- Status: Verified
- Requirements: FR-AI-03
- Code: `src/app/api/report/analysis/route.ts`, `src/app/api/report/infographic/route.ts`, `src/components/dashboard/export-buttons.tsx`
- Checks: `scripts/test-analysis-cards.ts`

### F-42. Exports and erasure

- Group: Data and sharing
- Status: Partial
- Requirements: FR-DATA-01, FR-DATA-02, FR-DATA-03, NFR-PRIV-01, NFR-PRIV-02
- Code: `src/app/api/export/report/route.ts`, `src/app/api/export/holdings/route.ts`, `src/app/api/export/transactions/route.ts`, `src/app/api/account/export/route.ts`, `src/app/api/account/delete/route.ts`, `src/lib/account/export.ts`, `src/lib/account/delete.ts`, `src/app/(dashboard)/settings/your-data-section.tsx`
- Checks: `scripts/test-account-data.ts`
- Gap: GAP-01, GAP-20

### F-43. Household sharing

- Group: Data and sharing
- Status: Partial
- Requirements: FR-HH-01, NFR-SEC-06, NFR-TEN-03
- Code: `src/lib/invites.ts`, `src/lib/household.ts`, `src/app/(dashboard)/settings/household-sharing.tsx`, `src/app/api/household/invites/route.ts`, `src/app/api/household/join/route.ts`, `src/app/api/household/create/route.ts`
- Checks: `scripts/test-invites.ts`
- Gap: GAP-07, GAP-08, GAP-27

### F-44. Plans and billing

- Group: Data and sharing
- Status: Deferred
- Requirements: FR-BIL-01
- Code: `src/lib/billing/plans.ts`, `src/lib/billing/entitlements.ts`, `src/lib/billing/stripe.ts`, `src/app/(dashboard)/settings/plan-section.tsx`, `src/app/api/billing/status/route.ts`, `src/app/api/billing/checkout/route.ts`, `src/app/api/billing/portal/route.ts`, `src/app/api/billing/webhook/route.ts`
- Checks: `e2e/entitlements.spec.ts`

Built and switched off. Deferred by Q6.

### F-45. Scheduled snapshots and health probes

- Group: Platform
- Status: Partial
- Requirements: NFR-OPS-01, NFR-OPS-02
- Code: `src/app/api/cron/snapshot/route.ts`, `src/app/api/health/route.ts`, `src/app/api/health/freshness/route.ts`, `vercel.json`
- Checks: none
- Gap: GAP-22
- Backlog: #2, #20

### F-46. Legal pages

- Group: Platform
- Status: Partial
- Requirements: NFR-PRIV-03
- Code: `src/app/legal/privacy/page.tsx`, `src/app/legal/terms/page.tsx`, `src/app/legal/layout.tsx`
- Checks: none
- Gap: GAP-18

Both pages are marked as drafts that no lawyer has reviewed.

### F-47. App shell and navigation

- Group: Platform
- Status: Verified
- Requirements: NFR-UX-01, NFR-UX-02
- Code: `src/components/dashboard/sidebar-nav.tsx`, `src/components/dashboard/header.tsx`, `src/app/layout.tsx`, `src/app/manifest.ts`
- Checks: `e2e/mobile-overlays.spec.ts`

### F-48. Release on command

- Group: Delivery
- Status: Partial
- Requirements: NFR-DEL-01
- Code: `scripts/deploy-production.ts`, `vercel.json`
- Checks: none
- Gap: GAP-23

### F-49. Backlog and traceability pages

- Group: Delivery
- Status: Verified
- Requirements: NFR-DEL-02
- Code: `scripts/backlog/render.ts`, `scripts/traceability/model.ts`, `scripts/traceability/render.ts`, `docs/BACKLOG.md`, `docs/REQUIREMENTS.md`
- Checks: `scripts/build-backlog.ts`, `scripts/build-traceability.ts`

## Gaps

### GAP-01. Erasure leaves holding snapshots behind, and the export omits them

- Affects: FR-DATA-02, FR-DATA-03, NFR-PRIV-01, F-42
- Severity: High
- Evidence: `src/lib/account/delete.ts`, `src/lib/account/export.ts`, `src/app/legal/privacy/page.tsx:107`
- Backlog: #28
- Status: Open

Neither file mentions `holding_snapshots`, and the export also omits `goal_links`. The privacy page promises that erasure removes the historical snapshots and that the export holds every row. The deletion check cannot see the omission, because it measures what is left through the export itself.

### GAP-02. Four retirement calculations disagree, and the shipped odds are too optimistic

- Affects: FR-PLAN-04, FR-PLAN-05, FR-PLAN-06, FR-AI-04, F-34, F-35, F-39
- Severity: High
- Evidence: `src/lib/utils/projections.ts:480`, `src/lib/tools/run-retirement-projection.ts:80`, `src/lib/tools/run-retirement-projection.ts:139`, `src/app/(dashboard)/projections/interactive-controls.tsx:303`, `src/app/(dashboard)/projections/interactive-controls.tsx:333`, `src/app/(dashboard)/projections/interactive-controls.tsx:354`, `src/app/(dashboard)/projections/interactive-controls.tsx:1581`, `src/app/api/chat/route.ts:27`
- Backlog: #29
- Status: Open

Only `runDetailedProjection` is tested, and it drives the Projections chart and verdict and the Analytics balances. The Projections page's Monte Carlo, the scenario Monte Carlo and the AI assistant's tool each compute their own answer.

A comparison on 2 Oct ran each one on the same household. The household: age 55, retiring at 65, $1.2M saved, $7,000 a month of spending in today's dollars, and $3,000 a month of Social Security claimed at 67. The Projections page reported a 94% chance that savings last; the same simulation under the tested engine's rules gives about 80%. Claiming at 62, the figures are 89% and 72%. The causes:
- **Spending is inflated from retirement, not from today**, in both Monte Carlos and the assistant's engine. First-year spending is $84,000 instead of $116,276, 28% low.
- **Social Security is paid from the first day of retirement**, whatever the claiming age, in the page's Monte Carlo.
- **Catch-up contributions are added on top of what was recorded**, so contributions run past the IRS limit, adding about $117,000 by retirement in the sample.
- **The assistant uses the Social Security amount at full retirement age from day one**, always plans 30 years of retirement (to 95 here) rather than the household's own horizon, never inflates spending in its Monte Carlo (97%), and uses 2024 tax brackets. Its other tool uses the 2025 tables and the tiered rule, so the assistant disagrees with itself.
- The scenario Monte Carlo ignores required minimum distributions. That changed nothing for this household.

The assistant's system prompt still asks it to "estimate dividend income".

### GAP-03. The Social Security claiming rule differs between pages

- Affects: FR-PLAN-03, F-33
- Severity: Medium
- Evidence: `src/lib/utils/projection-scenarios.ts:81`, `src/lib/utils/financial-analytics.ts:340`
- Backlog: #30
- Status: Open

Projections cut the benefit a flat 6.67% per early year, so claiming at 62 gives 66.65%. Analytics uses the tiered SSA rule, which gives 70%. Only the tiered rule is tested.

### GAP-04. Contribution limits are hard-coded, out of date, and disagree with each other

- Affects: FR-PLAN-02, FR-PLAN-08, FR-ACC-08, F-32, F-36, F-13
- Severity: Medium
- Evidence: `src/lib/constants.ts:106`, `src/app/(dashboard)/accounts/[accountId]/linked-contributions.tsx:441`, `scripts/test-analytics.ts:235`
- Backlog: #31
- Status: Open

The projection engine caps contributions from three hard-coded 2025 copies of the limits, and never reads the IRS limits table that Settings shows and refreshes. The HSA catch-up applies from 50 instead of 55. The check meant to prove the cap uses a deferral under the cap, so it would pass even if capping were broken.

### GAP-05. "Sync now" stores the wrong Plaid item ID

- Affects: FR-ACC-05, NFR-INT-03, F-10
- Severity: Medium
- Evidence: `src/app/api/plaid/sync/route.ts:92`
- Backlog: #32
- Status: Open

The manual sync passes the database's own ID where the daily refresh passes Plaid's, and writes it onto the synced accounts. Disconnecting before the next daily refresh would leave the connection's stored credentials in place. On 2 Oct no linked record carried a wrong ID (0 of 24).

### GAP-06. Some entry points read household data without the restricted database role

- Affects: NFR-TEN-02, FR-AI-01, F-39
- Severity: Medium
- Evidence: `src/app/api/chat/route.ts:62`, `src/lib/db/tenant.ts:39`, `scripts/check-tenant-scope.ts:55`, `src/app/legal/privacy/page.tsx:99`
- Backlog: #33
- Status: Open

The AI chat and its tools, the price refresh, billing status and the household routes query as the table owner. They are isolated only by their own household filters. The tenant-scope check cannot see them, and the privacy page says every request runs under a restricted role.

### GAP-07. The membership rule lets an account join any household, and one account can hold two

- Affects: NFR-TEN-03, F-43
- Severity: Medium
- Evidence: `src/lib/db/migrations/0009_row_level_security.sql:120`, `src/lib/db/schema.ts:244`
- Backlog: #34
- Status: Open

The row-level policy on memberships allows an account to insert itself into any household. Nothing makes an account's membership unique, so a second membership would make which household loads unpredictable. No code path does either today.

### GAP-08. There is no way to leave a household or remove a member

- Affects: FR-HH-02, F-43
- Severity: Medium
- Evidence: `src/app/api/account/delete/route.ts:57`, `src/app/(dashboard)/settings/your-data-section.tsx:140`
- Backlog: #35
- Status: Open

The app tells a member they "can leave the household instead". There is no such action; the only way to revoke a member is to erase all data.

### GAP-09. Demo visitors and any signed-in user can trigger writes beyond their own household

- Affects: NFR-SEC-03, FR-ID-04, FR-INV-03, F-04, F-17, F-36
- Severity: Low
- Evidence: `src/app/api/prices/refresh/route.ts:30`, `src/app/api/irs-limits/refresh/route.ts:26`
- Backlog: #36
- Status: Open

The price refresh rewrites the demo household's prices, and returns a stack trace when it fails. Any signed-in user can rewrite the shared tax and limits tables, though only to values fixed in code.

### GAP-10. Cron routes would accept anyone if their secret were unset

- Affects: NFR-SEC-04
- Severity: Low
- Evidence: `src/app/api/cron/refresh/route.ts:48`, `src/app/api/cron/snapshot/route.ts:22`
- Backlog: #37
- Status: Open

The expected header becomes `Bearer undefined`, and the comparison is not constant-time. The secret is set in production today.

### GAP-11. Holdings imports write without checking the file's date or showing a review

- Affects: FR-IMP-01, FR-IMP-04, NFR-INT-04, F-20, F-21
- Severity: Medium
- Evidence: `src/lib/actions/import.ts:56`, `src/lib/actions/import.ts:71`, `src/lib/actions/import-statement.ts:144`
- Backlog: #38
- Status: Open

The file import deletes every holding in the account and inserts the file, so a cost basis entered by hand is lost. Fidelity quick import merges by ticker, but removes any position missing from the file and replaces a hand-entered cost basis. Neither looks at the file's date. The statement balance import already refuses a statement older than what is recorded; Q5 asks for the same rule here, plus a merge.

### GAP-12. Holdings cannot be edited or deleted in the app

- Affects: FR-INV-01, F-15
- Severity: Medium
- Evidence: `src/lib/actions/holdings.ts:79`
- Backlog: #39
- Status: Open

The update and delete actions exist, but no screen calls them.

### GAP-13. The transactions page shows only the latest 500 and totals over them

- Affects: FR-INV-04, F-18
- Severity: Low
- Evidence: `src/app/(dashboard)/transactions/page.tsx:61`
- Backlog: #40
- Status: Open

### GAP-14. The setup checklist counts retired contributions as done

- Affects: FR-ONB-01, F-06
- Severity: Low
- Evidence: `src/lib/onboarding.ts:69`
- Backlog: #41
- Status: Open

It counts contributions whose `is_active` is not null; the column is never null.

### GAP-15. Analytics and projections assume inputs instead of asking

- Affects: FR-PLAN-09, F-34, F-37
- Severity: Medium
- Evidence: `src/app/(dashboard)/analytics/page.tsx:87`, `src/app/(dashboard)/projections/page.tsx:78`, `src/lib/utils/financial-analytics.ts:541`
- Backlog: #42
- Status: Open

The assumed values are age 42, $7,000 a month of spending, and a 0.15% fee on any fund whose fee is unknown. This is the guessed-figure pattern the dividend work removed. Q4 decided: refuse, and ask gracefully.

### GAP-16. Plan limits are mostly unenforced

- Affects: FR-BIL-01, NFR-SEC-07, F-44
- Severity: Low
- Evidence: `src/lib/billing/plans.ts:8`, `src/lib/redis.ts`
- Backlog: #43
- Status: Closed 2026-10-02

Closed by the answer to Q6: billing is deferred, so unenforced plan limits no longer fall short of a requirement. The facts below stay true and matter again only if billing is ever switched on.

The shortfalls:
- Only three of the eight plan features are checked anywhere.
- The daily AI message limit is never applied.
- The chat rate limit works only when Redis is configured.
- Only households created through "Create household" are comped.

None of this matters while every plan is free; all of it would on the day billing is switched on.

### GAP-17. What users and maintainers read contradicts the app

- Affects: NFR-DOC-01, FR-ONB-02, F-07
- Severity: Medium
- Evidence: `README.md`, `docs/USER-GUIDE.md:6`, `src/app/(dashboard)/help/help-content.tsx:143`, `docs/ARCHITECTURE.md`, `docs/DATA-FLOW.md`
- Backlog: #44
- Status: Open

- **README:** still the create-next-app template.
- **User guide:** promises Clerk and Google sign-in, 11 analysis cards and 10 AI tools, and alerts on the dashboard.
- **Help:** gives the wrong price-update time and a reconnect button that does not exist.
- **Architecture and data-flow docs:** describe Neon, Clerk and 14 tables.

### GAP-18. The privacy page misses who receives data, and overstates two protections

- Affects: NFR-PRIV-03, F-46
- Severity: Medium
- Evidence: `src/app/legal/privacy/page.tsx:62`, `src/app/legal/privacy/page.tsx:89`, `src/lib/actions/vehicles.ts:172`, `src/lib/utils/price-feed.ts:4`
- Backlog: #45
- Status: Open

It does not name Yahoo Finance (tickers) or the NHTSA (vehicle VINs). It says there are no third-party scripts, yet Plaid's Link window loads from Plaid. It also claims restricted access on every request (GAP-06) and complete erasure (GAP-01).

### GAP-19. The audit log misses actions it declares, and loses who acted

- Affects: NFR-PRIV-04
- Severity: Low
- Evidence: `src/lib/audit.ts:20`
- Backlog: #46
- Status: Open

Account deletion and billing changes are declared but never recorded. Plaid and AI-key events carry no actor, so which partner acted is lost. Revoked invites are filed under the wrong key.

### GAP-20. The holdings CSV breaks on a name containing a quote

- Affects: FR-DATA-01, F-42
- Severity: Low
- Evidence: `src/app/api/export/holdings/route.ts:26`
- Backlog: #47
- Status: Open

### GAP-21. No password reset, and sign-in ignores where you were going

- Affects: FR-ID-02, FR-ID-03, F-02
- Severity: Medium
- Evidence: `src/lib/actions/auth.ts:26`, `src/proxy.ts:145`
- Backlog: #48
- Status: Open

A person who forgets their password cannot get back in. When a signed-out visitor opens a deep link, the redirect to sign-in carries the page in `next`, but sign-in ignores it and always lands on the dashboard. The email-link callback does honour `next`.

### GAP-22. The weekday snapshot skips some households and can double-count a day

- Affects: NFR-OPS-01, FR-NW-04, F-27, F-45
- Severity: Low
- Evidence: `src/app/api/cron/snapshot/route.ts:72`
- Backlog: #49
- Status: Open

The shortfalls:
- A household with no investments gets no net-worth snapshot.
- A second run on the same day inserts duplicate rows.
- A run is recorded as ok whatever happened.

### GAP-23. A release stops on a passing Vercel error before confirming itself

- Affects: NFR-DEL-01, F-48
- Severity: Low
- Evidence: `scripts/deploy-production.ts`
- Backlog: #50
- Status: Open

On 2 Oct a single 502 from Vercel's API stopped the script after a successful release, so the backlog page had to be built by hand.

### GAP-24. Some checks prove less than their labels say

- Affects: NFR-INT-05
- Severity: Medium
- Evidence: `scripts/test-analytics.ts:235`, `scripts/test-cost-basis.ts:157`, `scripts/test-net-worth.ts:195`
- Backlog: #51
- Status: Open

Examples:
- An IRS cap check that never triggers the cap.
- A coverage rule restated locally instead of imported.
- An "underwater" case that asserts positive equity.

Several checks read source text rather than running code. The requirements that cite these checks are marked accordingly.

### GAP-25. Code that nothing uses

- Affects: NFR-DEL-05
- Severity: Low
- Evidence: `src/app/(dashboard)/projections/scenario-runner.tsx`, `src/app/(dashboard)/projections/projection-charts.tsx`, `src/components/dashboard/alerts-panel.tsx`
- Backlog: #52
- Status: Open

The scenario runner, projection charts and alerts panel are imported nowhere, and several actions have no caller.

### GAP-26. Anyone can create an account, and no email address is ever confirmed

- Affects: NFR-SEC-08, FR-ID-01, BO-7, F-02
- Severity: Medium
- Evidence: `src/lib/actions/auth.ts:40`, Supabase Auth settings on 2 Oct (sign-up allowed; new accounts confirmed automatically)
- Backlog: #53
- Status: Open

Found while applying the answer to Q6. Households cannot see each other, so this exposes no one's data to a stranger. It does let a stranger store bank data in the owner's database and add connections to the owner's Plaid account. Because confirmation is automatic, an account can also be opened in someone else's name.

### GAP-27. Nothing records which member added a row

- Affects: FR-HH-02, F-43
- Severity: Low
- Evidence: `src/lib/db/schema.ts:255`, `src/lib/db/schema.ts:402`
- Backlog: #54
- Status: Open

Rows are keyed by household, not by the person who added them, and Plaid connections do not record who linked them. Until that is recorded, the answer to Q3 (a leaving member's additions are deleted) cannot be carried out. Rows added before then cannot be attributed.

### GAP-28. The tested engine charges no tax, and takes required distributions from Roth accounts

- Affects: FR-PLAN-10, FR-PLAN-04, F-34
- Severity: High
- Evidence: `src/lib/utils/projection-scenarios.ts:369`, `src/lib/utils/projection-scenarios.ts:378`
- Backlog: #55
- Status: Closed 2026-10-02

Found in the Q9 comparison. `runDetailedProjection` withdraws exactly the spending, with no income tax on tax-deferred withdrawals. In the comparison household the first year would owe about $5,000. When a required minimum distribution is larger than spending, the engine takes it from every account in proportion, Roth included, and the excess is never reinvested. That removed $1.1M from the balance at 90 in the comparison. The assistant's engine works out tax but never subtracts it either. This has to be fixed before this engine becomes the only one.

Closed by #55: the engine now taxes withdrawals, takes RMDs only from tax-deferred accounts and reinvests the unspent part (FR-PLAN-10).

### GAP-29. The built-in 2025 tax figures predate the July 2025 tax law

- Affects: FR-PLAN-08, F-36
- Severity: Low
- Evidence: `src/lib/tax/table.ts:132`
- Backlog: #56
- Status: Open

The table's standard deduction for married couples is $30,000. The One Big Beautiful Bill Act raised it to $31,500 for 2025, and added a deduction of $6,000 for each person aged 65 or over, for 2025 to 2028, phasing out at higher incomes. Neither is modelled; for retirees the senior deduction is the larger change. These figures come from Claude's knowledge, not the repository, so check them against the IRS before changing the table. Married filing jointly is the only filing status the app models.

## Open questions

### Q1. What would show each objective is met?

- Status: Open
- Decides: BO-1, BO-2, BO-3, BO-4, BO-5, BO-6, BO-7

No objective has a measure. For BO-2, for example: "a household can tell within a minute whether retirement is on track".

### Q2. Should a partner be able to view without changing anything?

- Status: Open
- Decides: FR-HH-01, NFR-TEN-03

Today every member can change everything; only invites and erasure are reserved for the owner.

### Q3. When a member leaves, what happens to what they added?

- Status: Answered 2026-10-02
- Decides: FR-HH-02

Accounts and contributions are owned by the household, not the person who typed them.

**Answer** (owner, 2 Oct): "It gets deleted." Applied as: leaving or being removed deletes what that member added and disconnects the bank connections they linked (FR-HH-02). The app does not yet record who added what (GAP-27), so that comes first. A joint account a partner typed in goes with them, which is why the member sees the list before confirming.

### Q4. When an input is missing, refuse or show a visible default?

- Status: Answered 2026-10-02
- Decides: FR-PLAN-09

Three inputs are filled in silently today (GAP-15):
- **Current age** (Settings → Preferences). When blank, Analytics assumes 42. Age drives years to retirement, catch-up limits and required minimum distributions.
- **Monthly spending in retirement** (Settings → Preferences). When blank, Analytics and Projections assume $7,000. It is the largest single driver of "on track".
- **A fund's annual fee.** The app knows the fee for a few dozen common tickers; any other fund is assumed to cost 0.15%. It feeds the fee-drag figure.

Claude's recommendation: refuse for age and spending, with a link to the field; for an unknown fund fee, leave it out of the fee total and say how many funds were left out.

**Answer** (owner, 2 Oct): agreed, and "display the requirement to set values gracefully in the app". Applied as FR-PLAN-09: a missing age or spending figure is asked for in place of the result, politely and with a direct link, never an error or an empty chart.

### Q5. Should a holdings file import replace an account's holdings or merge into them?

- Status: Answered 2026-10-02
- Decides: FR-IMP-01, FR-IMP-04, NFR-INT-04

Replacing loses any cost basis entered by hand (GAP-11).

**Answer** (owner, 2 Oct): neither, blindly. "It should be reviewed and determined if it's mergeable or not. If the data is older than what's in the database already, don't import. If it's newer data or transactions, figure out the merge." Applied as FR-IMP-04. One refinement: a statement always contains older transactions, so for transactions "older" is judged one transaction at a time (skip those already recorded) rather than by the file's date.

### Q6. Who is RetireWise for: friends and family, or a paying public?

- Status: Answered 2026-10-02
- Decides: FR-BIL-01, NFR-PRIV-03, NFR-SEC-07, NFR-SEC-08, BO-7

The terms say there is no paid tier, while billing is built and dormant. The answer sets how much legal review, support and plan enforcement (GAP-16) are worth.

**Answer** (owner, 2 Oct): "Friends and family (mainly me)." Applied as:
- BO-7 is restated.
- Billing (FR-BIL-01) is deferred, and GAP-16 closes.
- Abuse limits drop to Could.
- A new Must, NFR-SEC-08, requires that only people the owner lets in can create an account. Today anyone can (GAP-26).
- The privacy page still has to be accurate (NFR-PRIV-03), but it does not need the review a public product would.

### Q7. Are the recovery targets right?

- Status: Open
- Decides: NFR-OPS-03

The stated targets are up to 24 hours of data lost and four hours to restore. Neither has been tested.

### Q8. Which devices and assistive technology must be supported beyond phones?

- Status: Open
- Decides: NFR-UX-03

Only phone layouts are checked today.

### Q9. Should every surface use one tested projection engine and the tiered Social Security rule?

- Status: Answered 2026-10-02
- Decides: FR-PLAN-04, FR-AI-04, FR-PLAN-07

Answering yes closes GAP-02 and GAP-03, and the assistant's figures may change. It would also be the moment to model RMDs per person and from age 75 for people born in 1960 or later.

The owner asked for more context on 2 Oct. It is in GAP-02 and GAP-28, and in short:
- Four calculations answer "will the money last?", and only one is tested.
- On a sample household, the Projections page shows a 94% chance where the tested rules give about 80%, before any tax.
- The tested engine is not ready to be the only one: it charges no tax and draws required distributions from Roth accounts (GAP-28).
- Yes would mean four steps: fix that engine, build the odds simulation on it, route the Projections page, scenarios and the assistant through it, then delete the rest.
- The assistant's withdrawal-strategy comparison lives only in the old engine, so yes also means rebuilding it or dropping the landing-page claim (Q10).
- Flat versus tiered Social Security matters only when claiming at 62 or 63: $100 a month at 62 on a $3,000 benefit.
- The 2024 versus 2025 tax tables differ by about $109 a year.

Claude's recommendation: yes, in that order.

**Answer** (owner, 2 Oct): "Yes. Recommended approach to route everything through one tested projection engine." Applied as FR-PLAN-04. The order of work:
1. Fix the tested engine (#55).
2. Build the odds on it, and route the Projections page, scenarios and the assistant through it (#29).
3. Adopt the tiered Social Security rule (#30).

Q10 stays open: the withdrawal-strategy comparison is rebuilt on the engine, or the landing-page claim goes.

### Q10. Should the landing page's "optimize withdrawal strategies" claim stand?

- Status: Open
- Decides: FR-PLAN-04

Only the assistant's older engine compares withdrawal strategies, using 2024 brackets.

## Change log

- 2026-10-02 · First version, derived from the code at `c1b0b0a`, the user guide, help, legal pages, CI and the backlog. 25 gaps found and opened as backlog #28–#52. · Claude
- 2026-10-02 · Answers to Q3, Q5 and Q6 recorded. Added FR-IMP-04 (imports are dated and reviewed) and NFR-SEC-08 (only people the owner lets in can sign up). FR-HH-02 now deletes a leaving member's additions. BO-7 restated, billing (FR-BIL-01, F-44) deferred, and GAP-16 closed. New gaps GAP-26 (open sign-up, no email confirmation) as #53 and GAP-27 (no record of who added what) as #54. GAP-21's evidence corrected: the email-link callback honours `next`, sign-in does not. Q4 spelled out. · Claude
- 2026-10-02 · Q9 context from a side-by-side run of every projection path on one household. GAP-02 restated with the results. Added FR-PLAN-10 (projections pay tax and draw from the right accounts). New gaps GAP-28 (the tested engine charges no tax and draws RMDs from Roth) as #55, and GAP-29 (2025 tax figures predate the July 2025 law) as #56. · Claude
- 2026-10-02 · Answers to Q4 and Q9 recorded. FR-PLAN-09 now says how a missing input is asked for, and FR-PLAN-04 makes the tested engine the only one. #42 and #29 unblocked; #29 now follows #55. · Claude
- 2026-10-02 · #55 done: the tested engine pays federal tax on withdrawals and taxable Social Security, takes RMDs only from tax-deferred accounts, and reinvests the unspent part. FR-PLAN-10 Verified by the new `scripts/test-projection-tax.ts`; GAP-28 closed. · Claude

## Sources

- `.github/workflows/ci.yml` and every check it runs
- `src/` at `c1b0b0a`: pages, API routes, server actions, library code and migrations
- `docs/USER-GUIDE.md`, `src/app/(dashboard)/help/help-content.tsx`, `src/app/legal/privacy/page.tsx`, `src/app/legal/terms/page.tsx`
- `docs/ARCHITECTURE.md`, `docs/DATA-FLOW.md`, `docs/data-retention.md`, `docs/disaster-recovery.md`, `docs/incident-response.md`, `docs/annual-tax-update.md`
- `docs/BACKLOG.md` and the [delivery review](https://claude.ai/artifact/Eo9g6bEnWFi9TBoSPwohPk)
- The production database (read-only), 2 Oct 2026: migrations applied, linked-record identifiers
