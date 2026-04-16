# RetireWise — User Guide

## Getting Started

### 1. Sign Up

Navigate to the app and click **Get Started**. Create an account using Clerk's authentication (email, Google, or other social providers).

### 2. Create Your First Account

After signing in, you'll land on the **Dashboard** (empty at first).

1. Go to **Accounts** in the sidebar
2. Click **Add Account**
3. Fill in:
   - **Account Name**: e.g., "Fidelity 401(k)"
   - **Institution**: e.g., "Fidelity"
   - **Account Type**: Select from 401(k), IRA, Roth IRA, Brokerage, HSA, etc.
   - **Tax Treatment**: Tax-Deferred, Tax-Free, or Taxable
4. Click **Create Account**

### 3. Add Holdings

There are three ways to add holdings:

#### Manual Entry
1. Go to an account detail page or the **Holdings** page
2. Click **Add Holding**
3. Enter ticker, name, asset class, shares, cost basis per share, and current price
4. Click **Add Holding**

#### CSV Import (recommended for Fidelity)
1. Go to **Import Data** in the sidebar
2. Select the target account
3. Choose format: **Fidelity Positions Export** or **Generic CSV**
4. Upload your CSV file
5. Review the parsed holdings in the preview table
6. Click **Import Holdings**

**Fidelity CSV Export**: In Fidelity, go to Positions → Download → Choose CSV format.

#### Plaid Connection (automatic)
1. Go to **Settings** in the sidebar
2. Under **Account Connections**, click **Connect Account via Plaid**
3. Select your brokerage in the Plaid Link modal
4. Log in with your brokerage credentials
5. Holdings are automatically imported and will refresh daily

### 4. View Your Dashboard

The Dashboard shows:
- **Portfolio Summary Cards**: Total value, gain/loss, daily change, account count
- **Asset Allocation Pie Chart**: Visual breakdown by asset class
- **Performance Chart**: Portfolio value over time (populates after the first nightly snapshot)
- **Account Cards**: Quick view of each account's value
- **Holdings Table**: All positions with gain/loss

### 5. Use AI Analysis

Click the **chat button** (bottom-right corner, available on any page) to open the AI assistant. Try asking:

- "Analyze my portfolio"
- "Show my allocation drift"
- "What are my top holdings?"
- "How diversified am I?"
- "Should I rebalance?"
- "What's my risk exposure?"

The AI has access to your real portfolio data and provides personalized analysis.

### 6. Configure Preferences

Go to **Settings** to set:
- **Current Age & Retirement Age**: Used for projection calculations
- **Risk Tolerance**: Conservative, Moderate, or Aggressive
- **Annual Contribution**: How much you contribute per year
- **Monthly Expenses in Retirement**: Your expected spending
- **Target Allocation**: Your desired asset class percentages (used for drift analysis)

---

## Pages Reference

| Page | Purpose |
|------|---------|
| **Dashboard** | Portfolio overview with charts and summary |
| **Accounts** | List, create, edit, and delete investment accounts |
| **Holdings** | View all positions across all accounts |
| **Transactions** | Transaction history (populated via Plaid or manual entry) |
| **AI Analysis** | Hub for AI-powered portfolio insights |
| **Projections** | Retirement modeling tools (Phase 3) |
| **Import Data** | Upload CSV files to import holdings |
| **Settings** | Personal preferences and Plaid account connections |

---

## Data Sources

### Manual Entry
Best for: Quick setup, accounts not supported by Plaid.

### CSV Import
Best for: Bulk import from Fidelity or other brokerages. Supports:
- Fidelity Positions Export format
- Generic CSV with columns: ticker, shares, price, cost basis

### Plaid (Automatic)
Best for: Ongoing synchronization. Plaid connects to 12,000+ institutions and automatically pulls:
- Account details (name, type)
- Holdings (ticker, shares, price)
- Transactions (buys, sells, dividends)

Data refreshes automatically via a daily cron job and Plaid webhooks.

---

## AI Analysis Features

The RetireWise AI assistant can:

1. **Portfolio Review**: Overall health check of your investments
2. **Allocation Analysis**: Compare current vs target allocation, identify drift
3. **Holdings Detail**: Deep dive into individual positions, sorted by value or performance
4. **Risk Assessment**: Concentration risk, sector exposure
5. **Rebalancing Suggestions**: Specific actions to return to target allocation

All AI analysis includes a disclaimer that it is for informational purposes only and does not constitute financial advice.

---

## Keyboard Shortcuts

- **Enter**: Send message in AI chat
- **Shift+Enter**: New line in AI chat
- **Escape**: Close AI chat panel

---

## Troubleshooting

**Dashboard shows no data**: Add accounts and holdings first (manually, CSV, or Plaid).

**Performance chart is empty**: The chart requires portfolio snapshots, which are created by a nightly cron job. You'll see data the day after adding holdings.

**Plaid connection fails**: Ensure Plaid environment variables are configured. In development, use sandbox mode.

**CSV import shows "No holdings found"**: Check that your CSV format matches the selected parser (Fidelity vs Generic). The CSV must have column headers.
