# RetireWise — Data Flow Diagrams

## 1. Manual Data Entry Flow

```
User fills form            Server Action           Database
─────────────────          ──────────────          ────────────
                           
[Account Form] ──POST──→  createAccount()  ──INSERT──→  accounts
                           │
                           └──→ revalidatePath("/dashboard")

[Holding Form] ──POST──→  createHolding()  ──INSERT──→  holdings
                           │
                           ├──→ Verify account ownership
                           ├──→ Calculate currentValue
                           └──→ revalidatePath("/dashboard", "/holdings")
```

## 2. CSV Import Flow

```
User uploads CSV           Client-side parsing      Server Action        Database
────────────────           ───────────────────      ──────────────       ────────────

[File Input]
      │
      ▼
  FileReader.readAsText()
      │
      ▼
  parseFidelityCSV()  ←─── Detects format (Fidelity or generic)
  or parseGenericCSV()     Guesses asset class from ticker/name
      │
      ▼
  Preview Table  ──confirm──→  importHoldings()  ──batch INSERT──→  holdings
                                │
                                ├──→ Verify account ownership
                                └──→ revalidatePath("/dashboard", "/holdings")
```

## 3. Plaid Account Connection Flow

```
User clicks Connect        Client                    API Routes              External
───────────────────         ──────                    ──────────              ────────

[Plaid Link Button]
      │
      ▼
  POST /api/plaid/
  create-link-token  ──────────────────→  Plaid API: linkTokenCreate()
      │                                         │
      ▼                                         ▼
  Load Plaid Link JS  ←──────────────────  link_token
      │
      ▼
  Plaid Link Modal (user authenticates with brokerage)
      │
      ▼ (on success)
  POST /api/plaid/
  exchange-token  ─────────────────────→  Plaid API: itemPublicTokenExchange()
      │                                         │
      ▼                                         ▼
  Store encrypted      ←──────────────────  access_token
  access token
      │
      ▼
  Plaid API: investmentsHoldingsGet()
      │
      ▼
  Create accounts + holdings in DB
      │
      ▼
  revalidatePath → Reload page
```

## 4. Plaid Data Refresh Flow (Cron)

```
Vercel Cron (6 AM daily)
      │
      ▼
  GET /api/cron/refresh
      │
      ▼
  For each active plaid_item:
      │
      ├──→ Decrypt access_token
      ├──→ Plaid API: investmentsHoldingsGet()
      ├──→ Update holdings prices + shares
      └──→ Update lastSync timestamp
```

## 5. Portfolio Snapshot Flow (Cron)

```
Vercel Cron (2 AM daily)
      │
      ▼
  GET /api/cron/snapshot
      │
      ▼
  For each user with accounts:
      │
      ├──→ Sum all holding values → totalValue
      ├──→ Calculate allocation breakdown
      ├──→ Compare to previous snapshot → dailyChange
      ├──→ Rank top 10 holdings
      └──→ INSERT portfolio_snapshots
```

## 6. AI Chat Flow

```
User types message         Client (useChat)         API Route            AI Gateway
──────────────────         ────────────────         ─────────            ──────────

[Chat Input]
      │
      ▼
  sendMessage({text})
      │
      ▼
  POST /api/chat
  (with UIMessages)  ──→  createAgentUIStreamResponse()
                               │
                               ▼
                          ToolLoopAgent.stream()  ──→  Claude Sonnet 4.6
                               │                            │
                               │  ◄── Tool calls ──────────┘
                               │
                               ▼
                          Execute tools:
                          • getPortfolioSummary → DB queries
                          • getHoldingsDetail   → DB queries
                          • calcAllocationDrift  → DB + math
                               │
                               ▼
                          Stream response chunks
                               │
      ◄── SSE stream ─────────┘
      │
      ▼
  Render message parts:
  • text → prose
  • tool-* → badges/loaders
```

## 7. Authentication Flow

```
Unauthenticated user       Clerk Middleware           Clerk
────────────────────       ────────────────           ─────

  Request to /dashboard
      │
      ▼
  middleware.ts
  clerkMiddleware()
      │
      ▼
  isProtectedRoute?  ──yes──→  auth.protect()
      │                              │
      no                      Has valid session?
      │                        │            │
      ▼                       yes           no
  Pass through               │            │
                              ▼            ▼
                          Continue     Redirect to
                          to page      /sign-in
```

## 8. Social Security Data Flow

```
User fills SS form         Server Action                Database
──────────────────         ──────────────               ────────────

[SS Form (self)]  ──POST──→  updateSocialSecurity()  ──UPSERT──→  social_security_benefits
[SS Form (spouse)] ──POST──→  updateSocialSecurity()  ──UPSERT──→  social_security_benefits

Each form stores:
  • Monthly benefits at age 62, FRA, and 70
  • Full retirement age and planned claiming age
  • Whether already claiming + current benefit amount
  • Spousal benefit eligibility + amount
  • Assumed COLA percentage
```

## Database Entity Relationship

```
user_preferences
  ├── clerkId (unique)
  ├── Self: firstName, currentAge, retirementAge
  ├── Spouse: spouseName, spouseCurrentAge, spouseRetirementAge, spouseIsRetired
  ├── Household: filingStatus, targetAllocation, monthlyExpensesRetirement
  └── Contributions: annualContribution, spouseAnnualContribution

accounts
  ├── clerkId
  ├── owner (self | spouse)  ←── distinguishes whose account
  ├── plaidItemId? ──→ plaid_items.itemId
  │
  ├──→ holdings (1:many, cascade delete)
  │     └── accountId
  │
  └──→ transactions (1:many, cascade delete)
        ├── accountId
        └── holdingId? ──→ holdings.id (set null on delete)

social_security_benefits
  ├── clerkId
  ├── owner (self | spouse)  ←── one row per person
  ├── Benefits: age62, FRA, age70
  ├── Claiming: isClaiming, currentMonthlyBenefit, startDate
  └── Spousal: eligibleForSpousalBenefit, spousalBenefitAmount

portfolio_snapshots
  ├── clerkId + snapshotDate (indexed)
  ├── totalValue, selfValue, spouseValue
  └── allocation, topHoldings, dailyChange

ai_analyses
  └── clerkId

plaid_items
  └── clerkId
```
