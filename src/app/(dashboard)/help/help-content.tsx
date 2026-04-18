"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Wallet, LineChart, Calculator, Brain, Landmark,
  Upload, Settings, BookOpen, PiggyBank, TrendingDown, ShieldCheck,
  HelpCircle, ArrowRight,
} from "lucide-react";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "accounts", label: "Accounts & Holdings", icon: Wallet },
  { id: "contributions", label: "Contributions", icon: PiggyBank },
  { id: "projections", label: "Projections", icon: LineChart },
  { id: "withdrawal", label: "Withdrawal Methods", icon: TrendingDown },
  { id: "rmd", label: "RMDs", icon: ShieldCheck },
  { id: "montecarlo", label: "Monte Carlo", icon: LineChart },
  { id: "scenarios", label: "Scenario Analysis", icon: Calculator },
  { id: "analytics", label: "Financial Analytics", icon: Calculator },
  { id: "networth", label: "Net Worth", icon: Landmark },
  { id: "ai", label: "AI Analysis", icon: Brain },
  { id: "importing", label: "Importing Data", icon: Upload },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "glossary", label: "Glossary", icon: BookOpen },
] as const;

export function HelpContent() {
  const [activeSection, setActiveSection] = useState<string>("overview");

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sidebar nav — desktop only */}
      <nav className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-20 space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveSection(s.id);
                document.getElementById(`help-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn(
                "flex items-center gap-2 w-full text-left rounded-md px-3 py-1.5 text-sm transition-colors",
                activeSection === s.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <s.icon className="h-3.5 w-3.5 shrink-0" />
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content area (includes mobile selector at top) */}
      <div className="flex-1 min-w-0 space-y-6 lg:space-y-8 lg:max-w-3xl">
        {/* Mobile section selector */}
        <div className="lg:hidden sticky top-14 z-10 bg-background pb-2">
          <select
            value={activeSection}
            onChange={(e) => {
              setActiveSection(e.target.value);
              document.getElementById(`help-${e.target.value}`)?.scrollIntoView({ behavior: "smooth" });
            }}
            className="w-full rounded-md border bg-card px-3 py-2 text-sm"
          >
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* OVERVIEW */}
        <Section id="overview" title="What is RetireWise?">
          <P>
            RetireWise is a household retirement investment tracker and planning tool. It pulls together all your
            investment accounts, real estate, cash, vehicles, and debts into one place so you can see your complete
            financial picture and model your path to retirement.
          </P>
          <P>
            The app is built around a few core ideas:
          </P>
          <UL>
            <li><B>Household-level tracking</B> — Both you and your spouse&apos;s accounts are combined into one view. This matters because retirement planning is a household decision, not an individual one.</li>
            <li><B>Per-account detail</B> — Every account has its own contributions, growth rate, and tax treatment. The projection engine grows each account individually rather than treating your portfolio as one big number.</li>
            <li><B>Interactive modeling</B> — Change any assumption (market returns, spending, SS claiming age) and see the impact instantly across every chart, table, and calculation.</li>
            <li><B>Plain language</B> — We try to explain everything in terms you can understand without a finance degree.</li>
          </UL>
        </Section>

        {/* DASHBOARD */}
        <Section id="dashboard" title="Dashboard">
          <P>
            The dashboard is your home base. It shows:
          </P>
          <SubSection title="Net Worth Card">
            <P>
              Your total net worth = all assets minus all debts. This includes investment accounts, real estate equity
              (home value minus mortgage), cash reserves, vehicle equity (value minus loan), minus any standalone debts.
              Click it to go to the detailed Net Worth page.
            </P>
          </SubSection>
          <SubSection title="Portfolio Summary Cards">
            <P>
              <B>Total Portfolio</B> — The combined current market value of all your investment holdings (stocks, bonds, ETFs, mutual funds).
              If you have a spouse, it shows the split between yours and theirs.
            </P>
            <P>
              <B>Total Gain/Loss</B> — How much your investments have gained or lost since you bought them.
              Calculated as: (current value) - (what you originally paid). The percentage shows the return on your cost basis.
            </P>
            <P>
              <B>Daily Change</B> — How much your portfolio moved today compared to yesterday&apos;s snapshot.
              This updates automatically each evening when prices refresh.
            </P>
          </SubSection>
          <SubSection title="Alert Banners">
            <P>
              Alerts appear when something needs your attention — like your allocation drifting too far from your
              target, a single stock making up too much of your portfolio, or a milestone being reached. You can
              dismiss them with the X button.
            </P>
          </SubSection>
          <SubSection title="Refresh Prices">
            <P>
              Prices update automatically every weekday at 10 PM ET (after market close). The &quot;Refresh Prices&quot; button
              lets you trigger an update manually if you want current numbers during the day. Prices come from Yahoo Finance.
            </P>
          </SubSection>
        </Section>

        {/* ACCOUNTS & HOLDINGS */}
        <Section id="accounts" title="Accounts & Holdings">
          <SubSection title="Accounts">
            <P>
              An account represents a single investment account at a brokerage or employer — like your 401(k) at Fidelity,
              a Roth IRA at Vanguard, or a joint brokerage account at Schwab. Each account has:
            </P>
            <UL>
              <li><B>Type</B> — 401(k), 403(b), Traditional IRA, Roth IRA, Brokerage, HSA, 529, Pension, etc.</li>
              <li><B>Tax Treatment</B> — How withdrawals are taxed. Tax-deferred (401k, Traditional IRA) means you pay taxes when you withdraw. Tax-free (Roth) means you already paid taxes going in. Taxable (brokerage) means you pay capital gains taxes on profits.</li>
              <li><B>Owner</B> — Whether this is your account or your spouse&apos;s.</li>
              <li><B>Actively Contributing</B> — Whether new money is going into this account. Old employer 401(k)s you rolled over are typically not actively contributing — they just grow with the market.</li>
            </UL>
          </SubSection>
          <SubSection title="Holdings">
            <P>
              Holdings are the individual investments inside an account — like shares of VTI, FXAIX, or BND.
              Each holding tracks:
            </P>
            <UL>
              <li><B>Ticker</B> — The stock/fund symbol (e.g., VOO, QQQ, FXAIX)</li>
              <li><B>Shares</B> — How many shares or units you own</li>
              <li><B>Cost Basis</B> — What you paid per share on average. This is used to calculate your gain or loss.</li>
              <li><B>Current Price</B> — The latest market price. Updated daily via Yahoo Finance.</li>
              <li><B>Asset Class</B> — Auto-detected based on the ticker. Used for allocation charts (US Stocks, International, Bonds, REITs, etc.)</li>
            </UL>
          </SubSection>
          <SubSection title="Gain/Loss Calculation">
            <P>
              For each holding: <Code>Gain/Loss = (Current Price - Cost Basis) x Shares</Code>
            </P>
            <P>
              The percentage is: <Code>((Current Price - Cost Basis) / Cost Basis) x 100</Code>
            </P>
            <P>
              A positive number (green) means the investment has grown. Negative (red) means it&apos;s lost value since you bought it.
              This is &quot;unrealized&quot; gain/loss — you haven&apos;t actually gained or lost money until you sell.
            </P>
          </SubSection>
        </Section>

        {/* CONTRIBUTIONS */}
        <Section id="contributions" title="Contributions">
          <P>
            Contributions are the money you add to your investment accounts on a regular basis. RetireWise tracks
            contributions per account with full detail:
          </P>
          <SubSection title="Contribution Methods">
            <UL>
              <li><B>Percent of Salary</B> — You contribute a percentage of your gross pay each paycheck. Example: 10% of $165,000 salary = $16,500/year. This is how most 401(k) and 403(b) contributions work.</li>
              <li><B>Fixed Amount</B> — A specific dollar amount at a set frequency. Example: $583/month to a Roth IRA.</li>
            </UL>
          </SubSection>
          <SubSection title="Employer Match">
            <P>
              If your employer matches your contributions, the match is calculated as:
            </P>
            <P>
              <Code>Match = min(your contribution %, match cap %) x salary x match rate</Code>
            </P>
            <P>
              Example: You contribute 10% of salary. Your employer matches 50 cents per dollar up to 6%.
              They match on 6% (not 10%, because the cap is 6%), at 50% rate = 3% of salary in free money.
              On a $165,000 salary, that&apos;s $4,950/year your employer adds for free.
            </P>
          </SubSection>
          <SubSection title="Annual Escalation">
            <P>
              Some 401(k) plans automatically increase your contribution percentage each year. If you set 1% annual
              escalation starting at 10%, next year it becomes 11%, then 12%, etc. This is a powerful way to save
              more without feeling the pinch — the increase usually aligns with your annual raise.
            </P>
          </SubSection>
          <SubSection title="IRS Limits">
            <P>
              The IRS caps how much you can contribute to retirement accounts each year.
              For 2025: 401(k)/403(b) limit is $23,500. Roth/Traditional IRA limit is $7,000.
              HSA family limit is $8,550. People 50+ get &quot;catch-up&quot; allowances on top.
              RetireWise can auto-populate these limits and enforces them in projections.
            </P>
          </SubSection>
          <SubSection title="How Contributions Flow Into Projections">
            <P>
              Each year in the projection, the engine calculates each account&apos;s contribution for that year:
            </P>
            <UL>
              <li>Gets that year&apos;s salary (accounting for salary growth)</li>
              <li>Applies the contribution percentage (plus any escalation)</li>
              <li>Adds the employer match</li>
              <li>Caps at the IRS limit</li>
              <li>Adds the result to that specific account&apos;s balance</li>
            </UL>
            <P>
              This is why you see different contribution amounts each year in the detailed tables — salary growth
              and escalation make them increase over time.
            </P>
          </SubSection>
        </Section>

        {/* PROJECTIONS */}
        <Section id="projections" title="Retirement Projections">
          <P>
            The projections page is the heart of RetireWise. It models your financial future from now through
            retirement using your actual accounts, contributions, and assumptions.
          </P>
          <SubSection title="How the Projection Works">
            <P>
              For each year from now until the end of retirement, the engine:
            </P>
            <OL>
              <li><B>Grows each account</B> — Multiplies the balance by (1 + return rate). A 7% return on a $100,000 account adds $7,000.</li>
              <li><B>Adds contributions</B> (before retirement) — Each account gets its calculated contribution for that year, including salary growth, escalation, and employer match.</li>
              <li><B>Calculates withdrawals</B> (during retirement) — Determines how much you need to take out based on your chosen withdrawal method, then distributes that proportionally across all accounts.</li>
              <li><B>Checks RMDs</B> (age 73+) — If the Required Minimum Distribution exceeds the withdrawal, the RMD becomes the floor.</li>
            </OL>
          </SubSection>
          <SubSection title="Projection Controls">
            <P>
              Every control on the projections page immediately updates all charts, tables, and calculations:
            </P>
            <UL>
              <li><B>Market Scenario</B> — Choose from 6 presets (Historical Average, Moderate, Bull Market, Lost Decade, Stagflation, Conservative). Each sets a different return rate, volatility, and inflation rate.</li>
              <li><B>SS Claiming Ages</B> — Sliding between 62-70 changes your Social Security benefit. Earlier = lower monthly payment. Later (up to 70) = higher payment. Each year you delay past your Full Retirement Age adds ~8% to your benefit.</li>
              <li><B>Monthly Spending</B> — What you expect to spend per month in retirement. This drives the expense-based withdrawal calculation.</li>
              <li><B>Withdrawal Rate</B> — The percentage of your portfolio to withdraw each year (the &quot;4% rule&quot; is a common guideline). Only used in rate-based and higher-of-both methods.</li>
              <li><B>Max Withdrawal Cap</B> — An absolute dollar limit on annual withdrawals. Even if your rate says withdraw $150k, the cap holds it at your limit. Exception: RMDs can push past this cap because they&apos;re mandatory.</li>
              <li><B>Years in Retirement</B> — How long your money needs to last. Average life expectancy is ~85, but planning to 95-100 gives a safety margin.</li>
            </UL>
            <P>
              Your control settings are saved automatically and persist between sessions.
            </P>
          </SubSection>
          <SubSection title="Summary Cards">
            <P>
              <B>Portfolio at Retirement</B> — The total projected value of all accounts at the year you retire.
            </P>
            <P>
              <B>Monthly Spending vs Income</B> — Compares your expected monthly expenses to your projected income
              (withdrawals + Social Security). A surplus means your income exceeds spending. A shortfall means you&apos;d
              need to reduce spending or save more.
            </P>
            <P>
              <B>Will It Last?</B> — The big question. Based on your current settings, does the portfolio survive
              through your entire retirement period? If not, it tells you when it runs out.
            </P>
          </SubSection>
          <SubSection title="Detailed Tables">
            <P>
              Four tabs give you different views of the numbers:
            </P>
            <UL>
              <li><B>Key Milestones</B> — Portfolio value at important ages (retirement, 70, 75, 80, 85, 90, 95) broken down by account.</li>
              <li><B>Accumulation (5yr)</B> — Every 5 years during the saving phase, showing contributions and account growth.</li>
              <li><B>Drawdown (5yr)</B> — Every 5 years during retirement, showing withdrawals, RMDs, and Social Security income.</li>
              <li><B>Year-by-Year</B> — Every single year with full detail. Green contribution sub-lines show what each account receives. The RMD column shows mandatory minimums. An amber &quot;RMD&quot; badge on the withdrawal means the IRS is forcing a larger withdrawal than your method would otherwise require.</li>
            </UL>
          </SubSection>
        </Section>

        {/* WITHDRAWAL METHODS */}
        <Section id="withdrawal" title="Withdrawal Methods">
          <P>
            When you retire, you need to take money out of your accounts to live on. RetireWise offers three
            methods to determine how much you withdraw each year:
          </P>
          <SubSection title="Expense-Based">
            <P>
              <B>How it works:</B> Each year, calculate your inflation-adjusted expenses, subtract your Social Security
              income, and withdraw the difference from your portfolio.
            </P>
            <P>
              <B>Formula:</B> <Code>Withdrawal = (Annual Expenses x (1 + inflation%)^year) - (Annual SS x (1 + inflation%)^year)</Code>
            </P>
            <P>
              <B>When to use:</B> If you have a clear picture of what you&apos;ll spend in retirement and want to
              withdraw only what you need. This is the most conservative approach — you never take more than necessary.
            </P>
            <P>
              <B>Example:</B> $8,500/mo spending = $102,000/year. With $60,000/year in SS, you&apos;d withdraw $42,000
              from your portfolio in year 1. By year 10 (at 3% inflation), expenses grow to ~$137,000, SS grows to ~$80,600,
              so you&apos;d withdraw ~$56,400.
            </P>
          </SubSection>
          <SubSection title="Rate-Based (The &quot;4% Rule&quot;)">
            <P>
              <B>How it works:</B> Each year, withdraw a fixed percentage of your current portfolio value.
            </P>
            <P>
              <B>Formula:</B> <Code>Withdrawal = Portfolio Balance x (Rate% / 100)</Code>
            </P>
            <P>
              <B>When to use:</B> If you want your withdrawals to automatically adjust with market performance.
              Good markets = larger withdrawals. Bad markets = you tighten the belt. The classic &quot;4% rule&quot;
              was designed to make money last 30 years in most historical scenarios.
            </P>
            <P>
              <B>Example:</B> $2M portfolio at 4.5% = $90,000/year withdrawal. If the portfolio drops to $1.8M next year,
              withdrawal drops to $81,000.
            </P>
          </SubSection>
          <SubSection title="Higher Of Both">
            <P>
              <B>How it works:</B> Calculate both the expense-based and rate-based amounts, then use whichever is higher.
            </P>
            <P>
              <B>When to use:</B> If you want to guarantee you can always cover expenses while also benefiting from
              larger withdrawals when the portfolio performs well. This is the most aggressive approach and will
              deplete your portfolio faster.
            </P>
          </SubSection>
          <SubSection title="Max Withdrawal Cap">
            <P>
              Regardless of method, you can set a maximum annual withdrawal. This prevents you from withdrawing
              too much in good years. However, RMDs (see below) can push withdrawals above this cap because
              they&apos;re legally required.
            </P>
          </SubSection>
        </Section>

        {/* RMDs */}
        <Section id="rmd" title="Required Minimum Distributions (RMDs)">
          <P>
            Starting at age 73, the IRS requires you to withdraw a minimum amount from tax-deferred accounts
            (401(k), 403(b), Traditional IRA) each year. You can&apos;t leave the money growing forever — the
            government wants their tax revenue.
          </P>
          <SubSection title="How RMDs Are Calculated">
            <P>
              <Code>RMD = Tax-Deferred Account Balance / IRS Life Expectancy Divisor</Code>
            </P>
            <P>
              The divisor comes from the IRS Uniform Lifetime Table. At 73, it&apos;s 26.5. At 80, it&apos;s 20.2.
              At 90, it&apos;s 12.2. As you age, the divisor shrinks, meaning you must withdraw a larger percentage.
            </P>
            <P>
              <B>Example:</B> You have $1,000,000 in your 401(k) at age 75. The divisor is 24.6.
              RMD = $1,000,000 / 24.6 = $40,650. You must withdraw at least this much. You can always withdraw more.
            </P>
          </SubSection>
          <SubSection title="RMDs in the Projection Tables">
            <P>
              In the year-by-year table, the <B>RMD column</B> (in amber) shows the mandatory minimum for that year.
              When you see an amber <B>&quot;RMD&quot; badge</B> next to a withdrawal amount, it means the RMD is driving
              the withdrawal — the IRS is requiring you to take out more than your chosen method would otherwise call for.
            </P>
            <P>
              If there&apos;s no RMD badge, your chosen withdrawal method is in control and the RMD hasn&apos;t kicked
              in yet (either you&apos;re under 73 or your expense/rate withdrawal already exceeds the RMD).
            </P>
          </SubSection>
          <SubSection title="Which Accounts Are Affected">
            <P>
              Only <B>tax-deferred</B> accounts: 401(k), 403(b), Traditional IRA, Pension. Roth IRAs, brokerage
              accounts, and HSAs are NOT subject to RMDs. In the drawdown table, accounts subject to RMDs are
              labeled with an amber &quot;RMD&quot; tag in the column header.
            </P>
          </SubSection>
          <SubSection title="RMDs and the Max Withdrawal Cap">
            <P>
              RMDs are legally mandatory. If your max withdrawal cap is $100,000 but the RMD is $130,000,
              you must take $130,000. The cap cannot override a legal requirement. RetireWise handles this
              automatically.
            </P>
          </SubSection>
        </Section>

        {/* MONTE CARLO */}
        <Section id="montecarlo" title="Monte Carlo Simulation">
          <P>
            Real markets don&apos;t deliver a steady 7% every year. Some years you might gain 25%, others you
            might lose 15%. The Monte Carlo simulation runs your plan through 500 randomly generated market
            scenarios to see how often your money lasts.
          </P>
          <SubSection title="How It Works">
            <OL>
              <li>Takes your current settings (portfolio, contributions, spending, etc.)</li>
              <li>For each of 500 simulations, generates a random market return for every year using the selected scenario&apos;s average return and volatility</li>
              <li>Applies contributions during the accumulation phase and withdrawals during retirement</li>
              <li>Checks if the portfolio survived to the end of retirement</li>
              <li>Reports the percentage of simulations where money lasted (the &quot;success rate&quot;)</li>
            </OL>
          </SubSection>
          <SubSection title="Reading the Fan Chart">
            <P>
              The fan chart shows the range of outcomes across all 500 simulations:
            </P>
            <UL>
              <li><B>Darkest green line (median)</B> — The middle outcome. Half did better, half did worse.</li>
              <li><B>Lighter bands (25th-75th percentile)</B> — The &quot;likely&quot; range where most scenarios land.</li>
              <li><B>Lightest bands (10th-90th percentile)</B> — The wide range including lucky and unlucky scenarios.</li>
            </UL>
            <P>
              If the bottom of the fan chart (10th percentile) stays above zero through your entire retirement, even
              unlucky market conditions shouldn&apos;t derail your plan.
            </P>
          </SubSection>
          <SubSection title="What&apos;s a Good Success Rate?">
            <UL>
              <li><B>90%+</B> (green) — Strong plan. Even most bad scenarios work out.</li>
              <li><B>80-89%</B> (green) — Solid. Some flexibility to adjust if markets disappoint.</li>
              <li><B>60-79%</B> (yellow) — Needs attention. Consider saving more, spending less, or working longer.</li>
              <li><B>Below 60%</B> (red) — High risk. Significant changes needed.</li>
            </UL>
          </SubSection>
        </Section>

        {/* SCENARIO ANALYSIS */}
        <Section id="scenarios" title="Scenario Analysis">
          <P>
            Scenario Analysis lets you ask &quot;what if?&quot; questions by changing one variable at a time and seeing
            how it affects your retirement outcome. It uses the exact same engine and settings as the projection
            controls above it.
          </P>
          <SubSection title="Available Scenarios">
            <UL>
              <li><B>Market Crash</B> — What if your portfolio drops by X% tomorrow? Reduces your starting portfolio value. Helps you understand how a crash would affect your long-term plan.</li>
              <li><B>Retire Earlier</B> — What if you retire X years sooner? Fewer years of saving + more years of spending. Shows the real cost of early retirement.</li>
              <li><B>Boost Savings</B> — What if you increase contributions by X%? Shows the power of saving more, even modestly.</li>
              <li><B>Lower Returns</B> — What if markets only return X% instead of your scenario&apos;s expected return? Stress-tests your plan against weak markets.</li>
              <li><B>High Inflation</B> — What if inflation stays at X%? Higher inflation eats into your purchasing power, making expenses grow faster.</li>
              <li><B>Reduced Social Security</B> — What if SS benefits get cut by X%? With the SS trust fund projected to run low, some reduction is possible.</li>
            </UL>
          </SubSection>
          <SubSection title="How to Read the Results">
            <P>
              Each scenario shows its projected portfolio at retirement and Monte Carlo success rate. The green/red
              number below shows the difference from your base case. You can adjust the parameter and re-run to find
              the tipping point where your plan breaks or recovers.
            </P>
          </SubSection>
        </Section>

        {/* FINANCIAL ANALYTICS */}
        <Section id="analytics" title="Financial Analytics">
          <P>
            The Analytics page provides 9 specialized calculators. Each one focuses on a different aspect of
            retirement planning:
          </P>
          <SubSection title="RMD Projections">
            <P>Shows your estimated RMDs year by year from age 73 onward, including the tax impact. Helps you plan for the mandatory distributions.</P>
          </SubSection>
          <SubSection title="Tax Projections">
            <P>Estimates your federal tax liability in retirement based on withdrawals from tax-deferred accounts, Social Security taxation (up to 85% of SS can be taxable for higher earners), and the standard deduction.</P>
          </SubSection>
          <SubSection title="Roth Conversion Ladder">
            <P>Models converting Traditional IRA/401(k) money to Roth over multiple years. Converting early in retirement (before SS starts) can reduce future RMDs and create tax-free income. Shows the optimal conversion amount per year to stay within your target tax bracket.</P>
          </SubSection>
          <SubSection title="SS Break-Even">
            <P>Calculates when claiming Social Security early (lower payments starting sooner) vs. late (higher payments starting later) breaks even. If you live past the break-even age, delaying was the better choice.</P>
          </SubSection>
          <SubSection title="Catch-Up Contributions">
            <P>Shows how much extra you can contribute once you turn 50 (catch-up contributions) and the projected impact on your portfolio at retirement.</P>
          </SubSection>
          <SubSection title="Income Replacement Ratio">
            <P>What percentage of your current income will your retirement sources replace? Financial planners typically recommend 70-80%. Shows the breakdown: portfolio withdrawals, Social Security, and any pension income.</P>
          </SubSection>
          <SubSection title="Fee Impact Analysis">
            <P>Shows how investment fees (expense ratios) eat into your returns over time. Even 0.5% in fees can cost hundreds of thousands over a 30-year period. Compares your current fees to a low-cost alternative.</P>
          </SubSection>
          <SubSection title="Sequence of Returns Risk">
            <P>Tests what happens if you hit a bad market right at the start of retirement. Even if average returns are fine, getting the losses first (when your portfolio is largest) can be devastating. Runs scenarios with bad years front-loaded vs. back-loaded.</P>
          </SubSection>
          <SubSection title="Healthcare Cost Projections">
            <P>Estimates healthcare costs from retirement through life expectancy, including Medicare premiums, supplemental insurance, and out-of-pocket costs. Healthcare inflation typically runs 5-6% per year — much higher than general inflation.</P>
          </SubSection>
        </Section>

        {/* NET WORTH */}
        <Section id="networth" title="Net Worth">
          <P>
            Net worth is the simplest measure of your financial health:
          </P>
          <P>
            <Code>Net Worth = Total Assets - Total Debts</Code>
          </P>
          <SubSection title="What Counts as Assets">
            <UL>
              <li><B>Investments</B> — Live value from your portfolio holdings. Updates daily.</li>
              <li><B>Real Estate Equity</B> — Home value minus mortgage balance. Equity = what you&apos;d walk away with if you sold.</li>
              <li><B>Cash Reserves</B> — Checking, savings, money market, CDs, I Bonds, emergency fund.</li>
              <li><B>Vehicle Equity</B> — Vehicle value minus any loan balance.</li>
            </UL>
          </SubSection>
          <SubSection title="What Counts as Debts">
            <P>
              Standalone debts not already embedded in an asset (like student loans, credit cards, personal loans).
              Mortgages and auto loans are already subtracted from their associated asset&apos;s equity, so they&apos;re
              not double-counted here.
            </P>
          </SubSection>
          <SubSection title="Vehicle Valuations">
            <P>
              RetireWise links to KBB (Kelley Blue Book) for cars, trucks, and SUVs, and NADAguides for boats,
              RVs, motorcycles, and ATVs. You can also enter a VIN to auto-fill year, make, and model.
              We recommend updating vehicle values quarterly.
            </P>
          </SubSection>
        </Section>

        {/* AI ANALYSIS */}
        <Section id="ai" title="AI Analysis">
          <P>
            The AI chat (floating button in the bottom-right corner) connects to your chosen AI model
            (Claude, Gemini, or GPT) and has access to your actual portfolio data through 11 specialized tools.
          </P>
          <SubSection title="What the AI Can Do">
            <UL>
              <li>Summarize your portfolio and allocation</li>
              <li>Identify allocation drift from your targets</li>
              <li>Suggest specific rebalancing trades</li>
              <li>Scan for tax-loss harvesting opportunities</li>
              <li>Analyze dividend income</li>
              <li>Compare your performance to benchmarks (S&amp;P 500, Total Market, etc.)</li>
              <li>Run retirement projections with custom scenarios</li>
              <li>Calculate your net worth breakdown</li>
              <li>Run any of the 9 financial analytics</li>
            </UL>
          </SubSection>
          <SubSection title="Infographic Report">
            <P>
              From the Export dropdown on the dashboard, you can generate an &quot;Infographic Report&quot; — a
              full-page HTML document with charts, tables, and AI-generated insights. It opens in a new tab and
              can be saved or printed as a PDF.
            </P>
          </SubSection>
          <SubSection title="Important Disclaimer">
            <P>
              AI analysis is for informational purposes only. It is not financial advice. The AI can make mistakes
              and does not know your complete financial situation, tax circumstances, or risk tolerance beyond what
              you&apos;ve entered. Always consult a qualified financial advisor for major decisions.
            </P>
          </SubSection>
        </Section>

        {/* IMPORTING DATA */}
        <Section id="importing" title="Importing Data">
          <SubSection title="CSV Import (Fidelity and others)">
            <P>
              On the Accounts page, the Quick Import card lets you upload CSV files exported from your brokerage.
              It auto-detects Fidelity&apos;s format and also handles generic CSVs with columns like ticker, shares, price, cost basis.
            </P>
            <P>
              <B>Smart sync:</B> Re-importing the same CSV updates existing holdings, adds new ones, and removes
              positions that are no longer in the file (sold). Safe to re-import anytime.
            </P>
          </SubSection>
          <SubSection title="QFX/OFX Import (ADP myKplan and others)">
            <P>
              For 401(k) accounts on ADP&apos;s myKplan platform, you can export a .qfx file and import it directly.
              QFX files often use CUSIP numbers instead of ticker symbols — RetireWise shows an editable preview
              so you can correct the tickers before importing.
            </P>
          </SubSection>
          <SubSection title="Plaid Connection">
            <P>
              For brokerages that support Plaid (Schwab, Vanguard, E*TRADE, etc.), you can connect your account
              directly. Note: Fidelity does not currently support Plaid for investment accounts.
            </P>
          </SubSection>
        </Section>

        {/* SETTINGS */}
        <Section id="settings" title="Settings">
          <SubSection title="Personal Information">
            <P>
              Your age, spouse&apos;s age, retirement ages, filing status, and risk tolerance. These drive all
              projection calculations.
            </P>
          </SubSection>
          <SubSection title="Salary & Growth">
            <P>
              Current salaries for both spouses, plus salary growth configuration. Three growth methods:
            </P>
            <UL>
              <li><B>Percent per year</B> — Compound growth (e.g., 3% per year forever)</li>
              <li><B>Percent for X years</B> — Growth for a set period, then flat (e.g., 3% for 10 years, then no more raises)</li>
              <li><B>Target by year</B> — Linear interpolation to a target salary by a specific year</li>
            </UL>
          </SubSection>
          <SubSection title="AI Provider">
            <P>
              Choose between Claude (Anthropic), Gemini (Google), or GPT (OpenAI) for AI analysis.
              You need your own API key for whichever provider you choose.
            </P>
          </SubSection>
          <SubSection title="Household Sharing">
            <P>
              Both spouses can have their own Clerk login and see the same data. One person creates the household
              and the other joins with an invite code.
            </P>
          </SubSection>
        </Section>

        {/* GLOSSARY */}
        <Section id="glossary" title="Glossary">
          <div className="grid gap-2">
            <Term term="401(k)">Employer-sponsored retirement account. Contributions are pre-tax (reduces your taxable income now). Withdrawals in retirement are taxed as income.</Term>
            <Term term="403(b)">Similar to a 401(k) but for employees of nonprofits, schools, and government organizations.</Term>
            <Term term="Asset Allocation">How your portfolio is divided between different types of investments (US stocks, international stocks, bonds, REITs, etc.).</Term>
            <Term term="Basis / Cost Basis">What you originally paid for an investment. Used to calculate gain or loss.</Term>
            <Term term="COLA">Cost of Living Adjustment. The annual increase to Social Security benefits to keep up with inflation.</Term>
            <Term term="Compound Growth">Growth on top of growth. If you earn 7% on $100,000, you have $107,000. Next year you earn 7% on $107,000 = $114,490. The &quot;extra&quot; $490 is compound growth.</Term>
            <Term term="CUSIP">A 9-character ID that identifies a security. Used in QFX files instead of ticker symbols.</Term>
            <Term term="Diversification">Spreading investments across different asset classes to reduce risk. If stocks drop, bonds might hold steady.</Term>
            <Term term="Expense Ratio">The annual fee charged by a fund (ETF or mutual fund), expressed as a percentage. 0.03% is very low (index funds). 1%+ is high (actively managed).</Term>
            <Term term="FRA (Full Retirement Age)">The age at which you receive your full Social Security benefit. For most people today, it&apos;s 67.</Term>
            <Term term="HSA">Health Savings Account. Triple tax advantage: contributions are tax-deductible, growth is tax-free, and withdrawals for medical expenses are tax-free.</Term>
            <Term term="Inflation">The rate at which prices increase over time. At 3% inflation, something costing $100 today costs $103 next year. Over 20 years, it costs $181.</Term>
            <Term term="IRA (Traditional)">Individual Retirement Account. Like a 401(k) but you open it yourself. Contributions may be tax-deductible. Withdrawals in retirement are taxed.</Term>
            <Term term="MFJ">Married Filing Jointly. A tax filing status that usually results in lower taxes for married couples.</Term>
            <Term term="Monte Carlo Simulation">A method that runs your retirement plan through hundreds of random market scenarios to estimate the probability of success.</Term>
            <Term term="Net Worth">Total assets minus total debts. The single best measure of financial health.</Term>
            <Term term="Rebalancing">Buying and selling investments to get your allocation back to your target. If stocks grew and are now 65% of your portfolio instead of 55%, you&apos;d sell some stocks and buy bonds.</Term>
            <Term term="RMD (Required Minimum Distribution)">Starting at age 73, the IRS requires you to withdraw a minimum amount from tax-deferred accounts each year.</Term>
            <Term term="Roth IRA / Roth 401(k)">Retirement accounts funded with after-tax money. Contributions aren&apos;t tax-deductible, but growth and withdrawals are completely tax-free. No RMDs required.</Term>
            <Term term="Sequence of Returns Risk">The danger of experiencing bad market returns early in retirement. Even if returns average out over time, losing money when your portfolio is at its peak is harder to recover from.</Term>
            <Term term="Social Security">Federal retirement benefits funded by payroll taxes. You earn credits by working, and benefits are based on your highest 35 years of earnings.</Term>
            <Term term="Tax-Deferred">Accounts where you don&apos;t pay taxes on contributions or growth until you withdraw the money (401k, Traditional IRA).</Term>
            <Term term="Tax-Free">Accounts where withdrawals are not taxed (Roth IRA, Roth 401k, HSA for medical expenses).</Term>
            <Term term="Tax-Loss Harvesting">Selling investments that have lost value to realize a tax deduction, then buying a similar (but not identical) investment to maintain your market exposure.</Term>
            <Term term="Volatility">How much an investment&apos;s value swings up and down. Higher volatility means bigger gains and bigger losses. Used in Monte Carlo simulations to model realistic market behavior.</Term>
            <Term term="Withdrawal Rate">The percentage of your portfolio you take out each year in retirement. The &quot;4% rule&quot; suggests withdrawing 4% of your initial portfolio, adjusted for inflation.</Term>
          </div>
        </Section>

      </div>
    </div>
  );
}

// ── Helper Components ──────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Card id={`help-${id}`} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="text-foreground">{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">{children}</code>;
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1.5">{children}</ul>;
}

function OL({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal pl-5 space-y-1.5">{children}</ol>;
}

function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <dt className="font-semibold text-foreground text-sm">{term}</dt>
      <dd className="text-sm text-muted-foreground mt-1">{children}</dd>
    </div>
  );
}
