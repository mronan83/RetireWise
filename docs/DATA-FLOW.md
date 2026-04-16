# RetireWise — Data Flow Diagrams

## 1. Manual Data Entry

```
[Account Form] ──→ createAccount() ──→ accounts table
[Holding Form] ──→ createHolding() ──→ holdings table (verify account ownership)
[Contribution Form] ──→ createContribution() ──→ contributions table
[Goal Form] ──→ createGoal() ──→ goals table
[Preferences Form] ──→ updatePreferences() ──→ user_preferences table
[SS Form] ──→ updateSocialSecurity() ──→ social_security_benefits table
```

## 2. Net Worth Data Entry

```
[Property Form] ──→ createProperty() ──→ real_estate table
[Cash Form] ──→ createCashReserve() ──→ cash_reserves table
[Debt Form] ──→ createDebt() ──→ debts table

Net Worth = real estate values + cash reserves + portfolio value − debts
```

## 3. CSV Import (Fidelity + Generic)

```
Upload CSV → FileReader → parseFidelityCSV() or parseGenericCSV()
  ↓                       (auto-detects format, guesses asset class)
Preview Table
  ↓ confirm
refreshHoldings(accountId, parsed)
  ├── Existing tickers → UPDATE (price, shares, cost basis)
  ├── New tickers → INSERT
  └── Missing tickers → DELETE (sold positions)
```

## 4. Plaid Account Connection

```
[Add Account] → "Connect via Plaid"
  ↓
POST /api/plaid/create-link-token → Plaid API → link_token
  ↓
react-plaid-link opens Plaid modal → user authenticates
  ↓ onSuccess(public_token)
POST /api/plaid/exchange-token → Plaid API → access_token
  ├── Encrypt token (AES-256-GCM) → plaid_items table
  ├── Fetch investmentsHoldingsGet()
  ├── Create accounts (mapped type + tax treatment)
  └── Insert holdings per account
```

## 5. Daily Price Update + Snapshot (Cron — weekdays 6 PM ET)

```
GET /api/cron/snapshot (CRON_SECRET auth)
  │
  For each user with accounts:
  │
  ├── Step 1: Update prices
  │   ├── Check Redis cache (15 min TTL)
  │   ├── Fetch uncached from Yahoo Finance (batches of 20)
  │   ├── Cache fresh prices in Redis
  │   └── Update holdings: currentPrice, currentValue, lastPriceUpdate
  │
  ├── Step 2: Take snapshot
  │   ├── Sum total, self, spouse values
  │   ├── Calculate allocation breakdown
  │   ├── Compare to previous snapshot → daily change
  │   └── INSERT portfolio_snapshots
  │
  ├── Step 3: Generate alerts
  │   ├── Allocation drift > 5% → warning/critical
  │   ├── Daily move > 2% → warning/critical
  │   ├── Single holding > 25% → concentration risk
  │   └── INSERT alerts (undismissed)
  │
  └── Step 4: Update goal progress
      └── UPDATE goals.currentAmount + isCompleted
```

## 6. Plaid Data Refresh (Cron — daily 10 AM UTC)

```
GET /api/cron/refresh (CRON_SECRET auth)
  │
  For each active plaid_item:
  ├── Decrypt access_token
  ├── Plaid API: investmentsHoldingsGet()
  ├── Update holdings prices + shares
  └── Update lastSync timestamp
```

## 7. AI Chat

```
User clicks Analysis card or types in chat
  ↓
triggerChat(prompt) → event emitter → ChatPanel opens + sends
  ↓
POST /api/chat
  ├── Rate limit check (Upstash Redis, 30 req/min)
  ├── Read user's AI provider preference from DB
  ├── convertToModelMessages(UIMessages)
  ├── streamText({model, messages, tools: 10 tools})
  │   └── AI calls tools as needed:
  │       • getPortfolioSummary → DB queries
  │       • getHoldingsDetail → DB queries
  │       • calculateAllocationDrift → DB + math
  │       • getHouseholdSummary → DB (prefs, SS, accounts)
  │       • generateRebalancingTrades → DB + allocation math
  │       • scanTaxLossHarvesting → DB (taxable accounts only)
  │       • getDividendIncome → DB + yield estimates
  │       • compareBenchmarks → Yahoo Finance historical
  │       • runRetirementProjection → DB + Monte Carlo engine
  │       • getNetWorth → DB (real estate, cash, debts + portfolio)
  └── toUIMessageStreamResponse() → SSE stream → chat panel
```

## 8. Retirement Projections

```
/projections page (Server Component)
  ├── Read: portfolio, preferences, contributions, SS benefits
  ├── Calculate total annual contributions (line items + employer match)
  ├── calculateProjection() → deterministic year-by-year forecast
  ├── runMonteCarlo(1000 sims) → percentile fan chart data
  └── calculateWithdrawalStrategies() → 4 strategies compared
      ├── Conventional (taxable → tax-deferred → Roth)
      ├── Tax-Deferred First (reduce RMDs)
      ├── Roth First (tax-free income early)
      └── Pro-Rata (balanced)

ScenarioRunner (Client Component)
  └── Run 6 what-if scenarios in browser:
      Market crash, early retirement, boost savings,
      lower returns, high inflation, no Social Security
```

## 9. Data Export

```
Dashboard → Export dropdown
  ├── Portfolio Report (.txt) → GET /api/export/report
  │   └── Formatted text: household, accounts, holdings, allocation, SS
  ├── Holdings (.csv) → GET /api/export/holdings
  │   └── All positions with gain/loss, account, owner
  └── Transactions (.csv) → GET /api/export/transactions
      └── Full history with account, owner, type
```

## 10. Authentication

```
Request → middleware.ts (clerkMiddleware)
  ├── Public routes (/, /sign-in, /sign-up) → pass through
  └── Protected routes (/dashboard, /api, etc.)
      ├── Has session → continue to page
      └── No session → redirect to /sign-in
```

## Database Entity Relationship (14 tables)

```
user_preferences
  ├── clerkId (unique)
  ├── Self: firstName, currentAge, retirementAge, annualSalary
  ├── Spouse: spouseName, spouseCurrentAge, spouseRetirementAge, spouseIsRetired
  ├── Household: filingStatus, targetAllocation, monthlyExpenses
  └── AI: aiProvider (anthropic/google/openai)

accounts
  ├── clerkId + owner (self | spouse)
  ├── type, institution, taxTreatment
  ├── plaidItemId? → plaid_items
  ├── → holdings (1:many, cascade)
  └── → transactions (1:many, cascade)

holdings ← accounts
  └── ticker, shares, costBasis, currentPrice, currentValue, assetClass

transactions ← accounts
  └── type, ticker, shares, amount, date

contributions
  ├── clerkId + owner
  ├── accountType, label
  ├── method (% of salary | fixed amount) + frequency
  └── employerMatch (rate + max %)

social_security_benefits
  ├── clerkId + owner
  ├── Benefits at 62 / FRA / 70
  ├── Claiming status + spousal benefit
  └── COLA assumption

portfolio_snapshots
  ├── clerkId + snapshotDate (indexed)
  └── totalValue, selfValue, spouseValue, allocation, dailyChange

alerts
  ├── clerkId
  └── type, severity, title, message, isDismissed

goals
  ├── clerkId
  └── name, targetAmount, currentAmount, targetDate, isCompleted

plaid_items
  └── clerkId, itemId, accessTokenEncrypted, status

ai_analyses
  └── clerkId, type, result (JSONB)

real_estate
  ├── clerkId
  └── name, estimatedValue, owner, propertyType, notes

cash_reserves
  ├── clerkId
  └── name, balance, owner, accountType, institution, notes

debts
  ├── clerkId
  └── name, balance, owner, interestRate, minimumPayment, debtType, notes
```
