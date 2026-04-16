# RetireWise — Architecture Overview

## Household Model

RetireWise is a **household** retirement planning tool for Matt (42) and Tricia (45). A single user manages investments for both spouses:

- **Accounts** tagged with `owner` field: `self` or `spouse`
- **Social Security** tracked per-spouse (claiming age, FRA, spousal benefits, COLA)
- **Contributions** are granular line items per account with employer match modeling
- **Dashboard** shows combined household totals with per-person breakdowns
- **AI Agent** understands the household model with 9 specialized tools
- **Projections** model both retirement timelines, coordinated SS claiming, withdrawal strategies
- **Tax filing** defaults to Married Filing Jointly for bracket calculations

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         VERCEL PLATFORM                              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      Next.js 16 App                            │  │
│  │                                                                │  │
│  │  Pages (10 routes):                                            │  │
│  │  / (landing) • /dashboard • /accounts • /holdings              │  │
│  │  /transactions • /analysis • /projections                      │  │
│  │  /import • /settings • /sign-in • /sign-up                     │  │
│  │                                                                │  │
│  │  API Routes (13):                                              │  │
│  │  /api/chat • /api/prices/refresh • /api/settings/ai-provider   │  │
│  │  /api/plaid/{create-link-token,exchange-token,webhook}         │  │
│  │  /api/cron/{snapshot,refresh} • /api/alerts/dismiss            │  │
│  │  /api/export/{holdings,transactions,report}                    │  │
│  └────────────────┬───────────────────────┬───────────────────────┘  │
│                   │                       │                          │
│    ┌──────────────▼──────┐  ┌─────────────▼────────────┐            │
│    │   Neon Postgres     │  │  AI Providers (choosable) │            │
│    │   (Marketplace)     │  │                           │            │
│    │                     │  │  • Anthropic (Claude 4.5)  │            │
│    │   11 tables:        │  │  • Google (Gemini 2.0)    │            │
│    │   accounts          │  │  • OpenAI (GPT-4.1)      │            │
│    │   holdings          │  │                           │            │
│    │   transactions      │  │  9 AI Tools:              │            │
│    │   portfolio_snaps   │  │  • portfolioSummary       │            │
│    │   social_security   │  │  • holdingsDetail         │            │
│    │   contributions     │  │  • allocationDrift        │            │
│    │   user_preferences  │  │  • householdSummary       │            │
│    │   plaid_items       │  │  • rebalancingTrades      │            │
│    │   ai_analyses       │  │  • taxLossHarvesting      │            │
│    │   alerts            │  │  • dividendIncome         │            │
│    │   goals             │  │  • benchmarkComparison    │            │
│    └────────────────────┘  │  • retirementProjection   │            │
│                             └───────────────────────────┘            │
│    ┌──────────────────┐  ┌──────────────────┐                       │
│    │  Clerk Auth      │  │  Upstash Redis   │                       │
│    │  (Marketplace)   │  │  (Marketplace)   │                       │
│    │                  │  │  • Price cache    │                       │
│    │                  │  │  • Rate limiting  │                       │
│    └──────────────────┘  └──────────────────┘                       │
│                                                                      │
│    ┌──────────────────┐  ┌──────────────────┐                       │
│    │  Plaid API       │  │  Yahoo Finance   │                       │
│    │  (production)    │  │  (price feed)    │                       │
│    │  • Account link  │  │  • Daily prices  │                       │
│    │  • Holdings sync │  │  • Benchmarks    │                       │
│    └──────────────────┘  └──────────────────┘                       │
│                                                                      │
│    Cron Jobs (weekdays):                                             │
│    • 6 PM ET — Update prices + snapshot + alerts + goal progress    │
│    • 10 AM UTC — Plaid data refresh                                  │
└──────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer           | Technology                          | Purpose                              |
|-----------------|-------------------------------------|--------------------------------------|
| Framework       | Next.js 16 (App Router)             | Full-stack React framework           |
| Language        | TypeScript (strict)                 | Type safety throughout               |
| UI              | shadcn/ui (Base UI) + Tailwind v4   | Component library + styling          |
| Charts          | Recharts                            | Financial visualizations + fan charts|
| Database        | Neon Postgres (Vercel Marketplace)   | Serverless PostgreSQL (11 tables)    |
| ORM             | Drizzle ORM (neon-http driver)      | Type-safe database access            |
| Auth            | Clerk (Vercel Marketplace)          | Authentication + user management     |
| AI              | Vercel AI SDK v6 + direct providers | Streaming chat + 9 typed tools       |
| AI Models       | Claude 4.5 / Gemini 2.0 / GPT-4.1  | User-choosable AI provider           |
| Account Sync    | Plaid API (production)              | Brokerage account connections        |
| Price Data      | Yahoo Finance (yahoo-finance2)      | Daily stock/ETF/fund prices          |
| Caching         | Upstash Redis (Vercel Marketplace)  | Price cache + AI rate limiting       |
| Hosting         | Vercel (Fluid Compute)              | Serverless deployment + cron jobs    |
| Package Manager | pnpm                                | Fast, strict dependency management   |

## Directory Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root (Clerk + Theme + Tooltip)
│   ├── page.tsx                      # Public landing page
│   ├── globals.css                   # Tailwind + shadcn CSS
│   ├── (auth)/                       # Auth route group
│   │   ├── sign-in/[[...sign-in]]/
│   │   └── sign-up/[[...sign-up]]/
│   ├── (dashboard)/                  # Protected route group
│   │   ├── layout.tsx                # Dashboard shell + AI chat FAB
│   │   ├── error.tsx                 # Error boundary
│   │   ├── not-found.tsx             # 404 page
│   │   ├── dashboard/                # Overview + alerts + goals
│   │   ├── accounts/                 # Accounts (Plaid + manual + CSV import)
│   │   ├── holdings/                 # All holdings view
│   │   ├── transactions/             # History with summary cards
│   │   ├── analysis/                 # 11 AI analysis cards
│   │   ├── projections/              # Monte Carlo, scenarios, withdrawal
│   │   ├── import/                   # CSV import (standalone page)
│   │   └── settings/                 # Preferences, contributions, SS, AI model
│   └── api/
│       ├── chat/                     # AI streaming (streamText + tools)
│       ├── prices/refresh/           # On-demand price update
│       ├── settings/ai-provider/     # Switch AI model
│       ├── alerts/dismiss/           # Dismiss alerts
│       ├── export/{holdings,transactions,report}/  # Data export
│       ├── plaid/{create-link-token,exchange-token,webhook}/
│       └── cron/{snapshot,refresh}/  # Scheduled jobs
├── components/
│   ├── ui/                           # 22 shadcn/ui primitives
│   ├── dashboard/                    # Cards, charts, tables, nav, alerts, goals, export
│   ├── ai/                           # Chat panel with event-driven triggers
│   ├── forms/                        # Account, holding, preferences, Fidelity import
│   └── plaid/                        # Plaid Link (react-plaid-link)
└── lib/
    ├── ai/model.ts                   # Multi-provider model selector
    ├── db/{index,schema}.ts          # Drizzle schema (11 tables) + lazy client
    ├── redis.ts                      # Upstash Redis + rate limiter
    ├── agents/                       # Agent type exports
    ├── tools/                        # 9 AI tools
    │   ├── get-portfolio-summary.ts
    │   ├── get-holdings-detail.ts
    │   ├── calculate-allocation-drift.ts
    │   ├── get-household-summary.ts
    │   ├── generate-rebalancing-trades.ts
    │   ├── scan-tax-loss-harvesting.ts
    │   ├── get-dividend-income.ts
    │   ├── compare-benchmarks.ts
    │   └── run-retirement-projection.ts
    ├── actions/                      # Server Actions (6 modules)
    ├── queries/                      # Read-only data fetching
    ├── plaid/                        # Client + AES-256-GCM encryption
    └── utils/
        ├── calculations.ts           # Portfolio math
        ├── projections.ts            # Monte Carlo + withdrawal strategies
        ├── price-feed.ts             # Yahoo Finance + Redis caching
        ├── alert-generator.ts        # Drift, market move, concentration alerts
        ├── csv-parser.ts             # Fidelity + generic CSV
        ├── chat-events.ts            # Cross-component chat triggers
        └── format.ts                 # Currency, percent, date formatting
```

## Key Design Decisions

1. **Server Components by default** — Dashboard pages fetch server-side; only charts, forms, and chat use `"use client"`.

2. **Household-first data model** — Every account has an `owner` field. Queries and AI tools always distinguish self vs spouse.

3. **User-choosable AI provider** — Provider preference stored in DB, read per-request. No redeploy needed to switch models.

4. **Granular contributions** — Line items per account with employer match modeling, not a single annual number.

5. **Smart CSV import** — Upserts: existing holdings updated by ticker, new positions added, sold positions removed. Safe to re-import daily.

6. **Redis-backed price caching** — 15-minute TTL avoids hammering Yahoo Finance. Graceful fallback when Redis isn't configured.

7. **Alert generation in cron** — After prices update, alerts are auto-generated for drift > 5%, daily moves > 2%, and concentration > 25%.

8. **Client-side Monte Carlo** — 1,000 simulations run in the browser for the scenario runner, server-side for the main projections page.

9. **Base UI (not Radix)** — shadcn/ui v4 uses Base UI. No `asChild` prop — use controlled `open` state + `onClick` instead.

10. **Direct Anthropic API** — Uses `claude-sonnet-4-5-20250929` (hyphens, not dots). Gateway-style model IDs don't work with direct provider SDKs.
