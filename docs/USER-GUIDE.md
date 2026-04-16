# RetireWise — User Guide

## Getting Started

### Sign Up
Go to the app and click **Get Started**. Create an account using Clerk (email, Google, etc.).

### First-Time Setup
1. **Settings** → Fill in your details, spouse details, salaries, risk tolerance, target allocation, and monthly expenses in retirement
2. **Settings → Social Security** → Enter SS benefit estimates for both you and your spouse (get yours at [ssa.gov/myaccount](https://www.ssa.gov/myaccount/))
3. **Settings → Contributions** → Add your retirement contribution line items (401k, IRA, etc.) with employer match details
4. **Settings → AI Model** → Choose your preferred AI (Claude, Gemini, or GPT)
5. **Accounts** → Add your investment accounts (Plaid or manual)
6. **Import** → Upload Fidelity CSV or other brokerage exports

---

## Pages

### Dashboard
Your home base. Shows:
- **Alerts** — drift, market moves, concentration risk (dismiss with X)
- **Summary Cards** — total portfolio, gain/loss, daily change, account count (with mine/spouse split)
- **Asset Allocation** pie chart
- **Performance** area chart (builds over time with daily snapshots)
- **Goals** — progress bars toward your retirement targets
- **Accounts** — cards linking to each account
- **Holdings** — full table with gain/loss

**Actions:**
- **Refresh Prices** — pulls live prices for all holdings right now
- **Export** → Portfolio Report (.txt), Holdings (.csv), Transactions (.csv)

### Accounts
- **Add Account** → Choose "Connect via Plaid" (automatic) or "Add manually"
- **Quick Import** — 3-step Fidelity CSV flow: pick account → open Fidelity → drop CSV
- Smart sync: updates existing, adds new, removes sold positions. Safe to re-import daily.
- Click any account card to see its holdings and manage it

### Holdings
All positions across all accounts. Shows ticker, shares, price, value, gain/loss, and which account/owner.

### Transactions
Transaction history with summary cards (total buys, sells, dividends, fees). Transactions come from Plaid sync or CSV import.

### AI Analysis
**11 clickable cards** — each opens the AI chat with a specific pre-built prompt:

| Card | What it does |
|------|-------------|
| Portfolio Review | Full health check |
| Rebalancing Trades | Specific buy/sell trades to fix allocation |
| Tax-Loss Harvesting | Find losses to harvest in taxable accounts |
| Benchmark Comparison | Compare vs S&P 500, total market, bonds |
| Dividend Income | Estimate annual/monthly passive income |
| Allocation Drift | Current vs target allocation |
| Tax Strategy | Asset location optimization |
| Household Summary | Combined picture for both spouses |
| Risk Assessment | Concentration and downturn analysis |
| Retirement Readiness | Are you on track? |
| Ask Anything | Custom question |

The chat button (bottom-right) is available on every page.

### Projections
Interactive retirement modeling:

- **Summary Cards** — portfolio at retirement, monthly income, Monte Carlo success rate
- **Projection Chart** — portfolio growth through accumulation and drawdown
- **Monte Carlo Fan Chart** — 1,000 simulated scenarios showing probability range (10th–90th percentile)
- **Withdrawal Strategy Comparison** — 4 strategies showing lifetime taxes and remaining portfolio
- **Scenario Analysis** — click "Run All Scenarios" to compare 6 what-ifs (market crash, early retirement, boost savings, lower returns, high inflation, no SS)

### Settings
Four sections:

1. **Household & Retirement Preferences** — ages, salaries, expenses, risk tolerance, target allocation
2. **Retirement Contributions** — per-account line items with employer match (not a single number)
3. **AI Model** — switch between Claude, Gemini, or GPT anytime
4. **Social Security** — side-by-side forms for you and your spouse

---

## Data Sources

### Manual Entry
Best for: quick setup, accounts not supported by Plaid.

### CSV Import (Fidelity recommended)
Best for: bulk import. Steps:
1. Log into Fidelity.com → Positions → Download (CSV)
2. In RetireWise, go to Accounts → Quick Import
3. Pick account, drop the CSV

Smart sync means you can re-import anytime to refresh shares/prices without duplicates.

### Plaid (Automatic)
Best for: non-Fidelity brokerages. Connects to 12,000+ institutions. Note: Fidelity blocks Plaid — use CSV import for Fidelity accounts.

### Yahoo Finance (Automatic)
Daily price updates run automatically at market close (weekdays 6 PM ET). Click "Refresh Prices" on the dashboard for on-demand updates.

---

## Contributions

Contributions are tracked as **individual line items**, not a single annual number. Each line item specifies:

- **Who** — yours or spouse's
- **Account type** — 401(k), Roth IRA, brokerage, etc.
- **Method** — percentage of salary (e.g., 6%) or fixed dollar amount (e.g., $500/month)
- **Frequency** — biweekly, semi-monthly, monthly, quarterly, annually
- **Employer match** — match rate (e.g., $1:$1) and cap (e.g., up to 5% of salary)

The summary shows annualized totals per person with employer match broken out, plus a household total.

---

## AI Analysis

The AI has access to your real portfolio data through 9 specialized tools. It can:
- Pull your actual holdings, allocation, and household details
- Generate specific trade recommendations
- Scan for tax-loss harvesting opportunities
- Compare you against benchmarks
- Estimate dividend income
- Run retirement projections with Monte Carlo simulations

**Choosing a model:** Go to Settings → AI Model. Claude Sonnet 4.5 is recommended for financial analysis. Gemini 2.0 Flash is faster and has a free tier.

---

## Alerts

Auto-generated during the nightly price update:
- **Allocation drift** — when an asset class is 5%+ off target
- **Large daily move** — portfolio up/down 2%+ in a day
- **Concentration risk** — single holding is 25%+ of portfolio

Alerts appear at the top of the dashboard. Dismiss with the X button.

---

## Goals

Set retirement milestones on the dashboard:
- Click **Add Goal** → name it, set a target amount, optional date
- Progress bar shows how close your current portfolio is
- Trophy icon when you reach a goal
- Progress updates automatically with nightly price updates

---

## Exports

From the dashboard Export dropdown:
- **Portfolio Report** — formatted text file with household summary, accounts, holdings, allocation, Social Security
- **Holdings CSV** — all positions with gain/loss for spreadsheets
- **Transactions CSV** — full transaction history

---

## Keyboard Shortcuts

- **Enter** — send message in AI chat
- **Shift+Enter** — new line in AI chat

---

## Troubleshooting

**Dashboard shows no data** → Add accounts and holdings first (Accounts page).

**Performance chart is empty** → Needs daily snapshots. Will populate after the first nightly cron run. Click "Refresh Prices" to trigger a manual update.

**Plaid won't connect to Fidelity** → Fidelity blocks Plaid. Use the CSV import instead (Accounts → Quick Import).

**AI chat gives an error** → Check Settings → AI Model. Make sure you have a valid API key for the selected provider.

**"Invalid phone number" in Plaid** → Make sure you're in production mode, not sandbox.

**Projections page says "set up preferences first"** → Go to Settings and fill in your age and retirement age.
