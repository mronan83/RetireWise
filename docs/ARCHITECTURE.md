# RetireWise — Architecture Overview

## Household Model

RetireWise is designed as a **household** retirement planning tool for a married couple. A single user (Matt) manages investments for both himself and his spouse:

- **Accounts** are tagged with an `owner` field: `self` or `spouse`
- **Social Security** benefits are tracked separately for each spouse (claiming age, FRA, spousal benefits, COLA)
- **Dashboard** shows combined household totals with per-person breakdowns
- **AI Agent** understands the household model and factors in both retirement timelines, coordinated SS claiming, and joint tax filing
- **Settings** capture both spouses' ages, retirement targets, contribution amounts, and SS estimates

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VERCEL PLATFORM                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Next.js 16 App                         │   │
│  │                                                          │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │   │
│  │  │  Landing     │  │  Auth Pages  │  │  Dashboard    │   │   │
│  │  │  (public)    │  │  (Clerk)     │  │  (protected)  │   │   │
│  │  └─────────────┘  └──────────────┘  └───────┬───────┘   │   │
│  │                                              │           │   │
│  │  ┌──────────────────────────────────────────┘           │   │
│  │  │                                                      │   │
│  │  ▼                                                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │Dashboard │ │Accounts  │ │Holdings  │ │Analysis  │   │   │
│  │  │Overview  │ │CRUD      │ │Table     │ │AI Chat   │   │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │   │
│  │       │             │            │             │         │   │
│  │       ▼             ▼            ▼             ▼         │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │              Server Actions / API Routes          │   │   │
│  │  │  • Account CRUD    • Holdings CRUD               │   │   │
│  │  │  • CSV Import      • Preferences                 │   │   │
│  │  │  • AI Chat (streamText)                          │   │   │
│  │  │  • Plaid Link / Exchange / Webhook               │   │   │
│  │  │  • Cron: Snapshot / Refresh                      │   │   │
│  │  └──────────┬───────────────────────┬───────────────┘   │   │
│  └─────────────┼───────────────────────┼───────────────────┘   │
│                │                       │                        │
│                ▼                       ▼                        │
│  ┌─────────────────┐    ┌──────────────────────┐               │
│  │  Neon Postgres   │    │  AI Gateway           │               │
│  │  (Marketplace)   │    │  → Claude Sonnet 4.6  │               │
│  │                  │    │                       │               │
│  │  • accounts      │    │  Portfolio Analyst    │               │
│  │  • holdings      │    │  Agent with Tools:    │               │
│  │  • transactions  │    │  • getPortfolioSummary│               │
│  │  • snapshots     │    │  • getHoldingsDetail  │               │
│  │  • ai_analyses   │    │  • calcAllocDrift     │               │
│  │  • plaid_items   │    └──────────────────────┘               │
│  │  • preferences   │                                           │
│  └─────────────────┘    ┌──────────────────────┐               │
│                          │  Plaid API            │               │
│  ┌─────────────────┐    │  • Link (connect)     │               │
│  │  Clerk Auth      │    │  • Holdings sync      │               │
│  │  (Marketplace)   │    │  • Webhooks           │               │
│  └─────────────────┘    └──────────────────────┘               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Cron Jobs                              │   │
│  │  • /api/cron/snapshot  — Daily 2 AM (portfolio snapshot) │   │
│  │  • /api/cron/refresh   — Daily 6 AM (Plaid data sync)   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer           | Technology                        | Purpose                              |
|-----------------|-----------------------------------|--------------------------------------|
| Framework       | Next.js 16 (App Router)           | Full-stack React framework           |
| Language        | TypeScript (strict)               | Type safety throughout               |
| UI              | shadcn/ui + Tailwind CSS v4       | Component library + styling          |
| Charts          | Recharts                          | Interactive financial visualizations |
| Database        | Neon Postgres (Vercel Marketplace) | Serverless PostgreSQL                |
| ORM             | Drizzle ORM (neon-http driver)    | Type-safe database access            |
| Auth            | Clerk (Vercel Marketplace)        | Authentication + user management     |
| AI              | Vercel AI SDK v6 + AI Gateway     | Streaming AI chat + tool agents      |
| AI Model        | Claude Sonnet 4.6 (Anthropic)     | Portfolio analysis intelligence      |
| Account Sync    | Plaid API                         | Brokerage account connections        |
| Hosting         | Vercel (Fluid Compute)            | Serverless deployment + cron jobs    |
| Package Manager | pnpm                              | Fast, strict dependency management   |

## Directory Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root (Clerk + Theme + Tooltip providers)
│   ├── page.tsx                      # Public landing page
│   ├── globals.css                   # Tailwind + shadcn CSS
│   ├── (auth)/                       # Auth route group
│   │   ├── sign-in/[[...sign-in]]/   # Clerk sign-in
│   │   └── sign-up/[[...sign-up]]/   # Clerk sign-up
│   ├── (dashboard)/                  # Protected route group
│   │   ├── layout.tsx                # Dashboard shell + AI chat FAB
│   │   ├── dashboard/                # Portfolio overview
│   │   ├── accounts/                 # Account management + detail
│   │   ├── holdings/                 # All holdings view
│   │   ├── transactions/             # Transaction history
│   │   ├── analysis/                 # AI analysis hub
│   │   ├── projections/              # Retirement projections (Phase 3)
│   │   ├── import/                   # CSV import
│   │   └── settings/                 # Preferences + Plaid connections
│   └── api/
│       ├── chat/                     # AI chat streaming endpoint
│       ├── plaid/                    # Plaid Link, exchange, webhook
│       └── cron/                     # Nightly snapshot + refresh
├── components/
│   ├── ui/                           # shadcn/ui primitives
│   ├── dashboard/                    # Summary cards, charts, tables, nav
│   ├── ai/                           # Chat panel, message rendering
│   ├── forms/                        # Account, holding, preferences forms
│   └── plaid/                        # Plaid Link button
└── lib/
    ├── db/                           # Drizzle schema + client
    ├── agents/                       # AI SDK ToolLoopAgent definitions
    ├── tools/                        # AI SDK typed tool definitions
    ├── actions/                      # Server Actions (mutations)
    ├── queries/                      # Read-only data fetching
    ├── plaid/                        # Plaid client + encryption
    └── utils/                        # Formatting, calculations, CSV parsing
```

## Key Design Decisions

1. **Server Components by default** — Dashboard pages fetch data server-side; only charts, forms, and interactive elements use `"use client"`.

2. **No separate API routes for reads** — Server Components call query functions directly. API routes are only for AI streaming, Plaid integration, and cron jobs.

3. **Lazy DB initialization** — `getDb()` function prevents build-time crashes when DATABASE_URL isn't yet configured.

4. **Plaid token encryption** — Access tokens stored with AES-256-GCM encryption. Key stored in environment variable, never in code.

5. **AI Gateway as model provider** — Single unified API for accessing Claude, with built-in fallback support if needed later.
