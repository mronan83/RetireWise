/**
 * Seed realistic demo data for the demo mode.
 * Run: pnpm exec dotenv -e .env.local -- tsx scripts/seed-demo.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const DEMO_ID = "demo_user_retirewise";

async function main(sql: postgres.Sql) {
  const db = drizzle(sql, { schema });

  console.log("Cleaning existing demo data...");

  // Delete holdings via account IDs first (holdings don't have clerkId directly)
  const demoAccounts = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.clerkId, DEMO_ID));
  for (const acct of demoAccounts) {
    await db.delete(schema.holdings).where(eq(schema.holdings.accountId, acct.id));
  }

  // Delete tables that have clerkId directly
  const tables = [
    schema.alerts,
    schema.goals,
    schema.contributions,
    schema.portfolioSnapshots,
    schema.socialSecurityBenefits,
    schema.vehicles,
    schema.debts,
    schema.cashReserves,
    schema.realEstate,
    schema.accounts,
    schema.userPreferences,
  ];
  for (const table of tables) {
    await db.delete(table).where(eq((table as { clerkId: typeof schema.accounts.clerkId }).clerkId, DEMO_ID));
  }

  console.log("Seeding demo data...");

  // 1. User Preferences
  await db.insert(schema.userPreferences).values({
    clerkId: DEMO_ID,
    firstName: "Alex",
    spouseName: "Jordan",
    currentAge: 38,
    spouseCurrentAge: 36,
    retirementAge: 62,
    spouseRetirementAge: 62,
    spouseIsRetired: false,
    riskTolerance: "moderate",
    filingStatus: "married_filing_jointly",
    annualSalary: "165000",
    spouseAnnualSalary: "92000",
    monthlyExpensesRetirement: "8500",
    salaryGrowth: { method: "pct_per_year", pctPerYear: 3 },
    spouseSalaryGrowth: { method: "pct_per_year", pctPerYear: 2.5 },
    aiProvider: "anthropic",
  });

  // 2. Accounts
  const accts = await db.insert(schema.accounts).values([
    {
      clerkId: DEMO_ID, name: "Fidelity 401(k)", institution: "Fidelity",
      accountType: "401k", taxTreatment: "tax_deferred", owner: "self",
      dataSource: "manual", isActivelyContributing: true,
    },
    {
      clerkId: DEMO_ID, name: "Vanguard Roth IRA", institution: "Vanguard",
      accountType: "ira_roth", taxTreatment: "tax_free", owner: "self",
      dataSource: "manual", isActivelyContributing: true,
    },
    {
      clerkId: DEMO_ID, name: "Schwab 403(b)", institution: "Schwab",
      accountType: "403b", taxTreatment: "tax_deferred", owner: "spouse",
      dataSource: "manual", isActivelyContributing: true,
    },
    {
      clerkId: DEMO_ID, name: "Vanguard Trad IRA", institution: "Vanguard",
      accountType: "ira_traditional", taxTreatment: "tax_deferred", owner: "spouse",
      dataSource: "manual", isActivelyContributing: false,
    },
    {
      clerkId: DEMO_ID, name: "Joint Brokerage", institution: "Fidelity",
      accountType: "brokerage", taxTreatment: "taxable", owner: "self",
      dataSource: "manual", isActivelyContributing: false,
    },
    {
      clerkId: DEMO_ID, name: "HSA", institution: "Fidelity",
      accountType: "hsa", taxTreatment: "tax_free", owner: "self",
      dataSource: "manual", isActivelyContributing: true,
    },
  ]).returning({ id: schema.accounts.id, name: schema.accounts.name });

  const acctMap = Object.fromEntries(accts.map((a) => [a.name, a.id]));
  console.log("  Created", accts.length, "accounts");

  // 3. Holdings
  const holdingsData: { accountName: string; ticker: string; name: string; assetClass: string; shares: number; costBasis: number; price: number }[] = [
    // Fidelity 401k
    { accountName: "Fidelity 401(k)", ticker: "FXAIX", name: "Fidelity 500 Index Fund", assetClass: "us_stock", shares: 412.5, costBasis: 148.20, price: 198.45 },
    { accountName: "Fidelity 401(k)", ticker: "FSPSX", name: "Fidelity Intl Index Fund", assetClass: "intl_stock", shares: 285.0, costBasis: 42.10, price: 48.92 },
    { accountName: "Fidelity 401(k)", ticker: "FXNAX", name: "Fidelity US Bond Index", assetClass: "bond", shares: 520.0, costBasis: 10.85, price: 10.42 },
    // Vanguard Roth IRA
    { accountName: "Vanguard Roth IRA", ticker: "VTI", name: "Vanguard Total Stock Market ETF", assetClass: "us_stock", shares: 95.0, costBasis: 205.30, price: 278.15 },
    { accountName: "Vanguard Roth IRA", ticker: "VXUS", name: "Vanguard Total Intl Stock ETF", assetClass: "intl_stock", shares: 180.0, costBasis: 52.80, price: 61.40 },
    { accountName: "Vanguard Roth IRA", ticker: "VNQ", name: "Vanguard Real Estate ETF", assetClass: "reit", shares: 50.0, costBasis: 78.50, price: 87.20 },
    // Schwab 403b
    { accountName: "Schwab 403(b)", ticker: "SCHB", name: "Schwab US Broad Market ETF", assetClass: "us_stock", shares: 320.0, costBasis: 48.25, price: 62.18 },
    { accountName: "Schwab 403(b)", ticker: "SCHF", name: "Schwab Intl Equity ETF", assetClass: "intl_stock", shares: 250.0, costBasis: 34.60, price: 39.85 },
    { accountName: "Schwab 403(b)", ticker: "SCHZ", name: "Schwab US Aggregate Bond ETF", assetClass: "bond", shares: 180.0, costBasis: 48.90, price: 46.15 },
    // Vanguard Trad IRA (old rollover)
    { accountName: "Vanguard Trad IRA", ticker: "VTSAX", name: "Vanguard Total Stock Mkt Idx Adm", assetClass: "us_stock", shares: 145.0, costBasis: 85.40, price: 118.92 },
    { accountName: "Vanguard Trad IRA", ticker: "VTIAX", name: "Vanguard Total Intl Stock Idx Adm", assetClass: "intl_stock", shares: 120.0, costBasis: 28.15, price: 33.20 },
    // Joint Brokerage
    { accountName: "Joint Brokerage", ticker: "VOO", name: "Vanguard S&P 500 ETF", assetClass: "us_stock", shares: 42.0, costBasis: 380.00, price: 520.85 },
    { accountName: "Joint Brokerage", ticker: "QQQ", name: "Invesco QQQ Trust", assetClass: "us_stock", shares: 18.0, costBasis: 345.20, price: 498.30 },
    { accountName: "Joint Brokerage", ticker: "SCHD", name: "Schwab US Dividend Equity ETF", assetClass: "us_stock", shares: 85.0, costBasis: 68.40, price: 82.75 },
    { accountName: "Joint Brokerage", ticker: "BND", name: "Vanguard Total Bond Market ETF", assetClass: "bond", shares: 100.0, costBasis: 72.30, price: 70.45 },
    // HSA
    { accountName: "HSA", ticker: "FZROX", name: "Fidelity ZERO Total Market Index", assetClass: "us_stock", shares: 280.0, costBasis: 14.20, price: 18.95 },
    { accountName: "HSA", ticker: "FZILX", name: "Fidelity ZERO Intl Index", assetClass: "intl_stock", shares: 350.0, costBasis: 10.80, price: 12.65 },
  ];

  for (const h of holdingsData) {
    await db.insert(schema.holdings).values({
      accountId: acctMap[h.accountName],
      ticker: h.ticker,
      name: h.name,
      assetClass: h.assetClass as typeof schema.holdings.$inferInsert.assetClass,
      shares: String(h.shares),
      costBasisPerShare: String(h.costBasis),
      currentPrice: String(h.price),
      currentValue: String(Math.round(h.shares * h.price * 100) / 100),
      dataSource: "manual",
      lastPriceUpdate: new Date(),
    });
  }
  console.log("  Created", holdingsData.length, "holdings");

  const totalPortfolio = holdingsData.reduce((s, h) => s + h.shares * h.price, 0);
  console.log("  Total portfolio value:", Math.round(totalPortfolio).toLocaleString());

  // 4. Contributions
  await db.insert(schema.contributions).values([
    {
      clerkId: DEMO_ID, accountId: acctMap["Fidelity 401(k)"], owner: "self",
      label: "401k Employee + Match", accountType: "401k", contributionMethod: "percent_of_salary",
      contributionPercent: "10", frequency: "per_paycheck_biweekly",
      hasEmployerMatch: true, employerMatchRate: "0.5", employerMatchMaxPercent: "6",
      hasAnnualEscalation: true, annualEscalationAmount: "1", maxAnnualContribution: "23500",
    },
    {
      clerkId: DEMO_ID, accountId: acctMap["Vanguard Roth IRA"], owner: "self",
      label: "Roth IRA Max", accountType: "ira_roth", contributionMethod: "fixed_amount",
      contributionAmount: "583.33", frequency: "monthly",
      hasEmployerMatch: false, hasAnnualEscalation: false, maxAnnualContribution: "7000",
    },
    {
      clerkId: DEMO_ID, accountId: acctMap["Schwab 403(b)"], owner: "spouse",
      label: "403b Employee + Match", accountType: "403b", contributionMethod: "percent_of_salary",
      contributionPercent: "8", frequency: "per_paycheck_biweekly",
      hasEmployerMatch: true, employerMatchRate: "1.0", employerMatchMaxPercent: "4",
      hasAnnualEscalation: false, maxAnnualContribution: "23500",
    },
    {
      clerkId: DEMO_ID, accountId: acctMap["HSA"], owner: "self",
      label: "HSA Family Max", accountType: "hsa", contributionMethod: "fixed_amount",
      contributionAmount: "680", frequency: "monthly",
      hasEmployerMatch: false, hasAnnualEscalation: false, maxAnnualContribution: "8300",
    },
  ]);
  console.log("  Created 4 contributions");

  // 5. Social Security
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.insert(schema.socialSecurityBenefits) as any).values([
    { clerkId: DEMO_ID, owner: "self", benefitAtFRA: "3200", fullRetirementAge: 67, estimatedAt62: "2240" },
    { clerkId: DEMO_ID, owner: "spouse", benefitAtFRA: "2100", fullRetirementAge: 67, estimatedAt62: "1470" },
  ]);
  console.log("  Created SS benefits");

  // 6. Portfolio Snapshots (90 days of history)
  const snapshotBase = totalPortfolio;
  const today = new Date();
  for (let d = 89; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends
    const drift = (90 - d) * 0.0008 + (Math.random() - 0.48) * 0.015;
    const value = snapshotBase * (1 + drift);
    const prevValue = d === 89 ? value : value * (1 - (Math.random() - 0.48) * 0.012);
    const dailyChange = value - prevValue;
    await db.insert(schema.portfolioSnapshots).values({
      clerkId: DEMO_ID,
      snapshotDate: date.toISOString().split("T")[0],
      totalValue: String(Math.round(value * 100) / 100),
      selfValue: String(Math.round(value * 0.62 * 100) / 100),
      spouseValue: String(Math.round(value * 0.38 * 100) / 100),
      dailyChange: String(Math.round(dailyChange * 100) / 100),
      dailyChangePct: String(Math.round((dailyChange / prevValue) * 10000) / 100),
      allocation: {
        us_stock: { value: value * 0.55, pct: 55 },
        intl_stock: { value: value * 0.22, pct: 22 },
        bond: { value: value * 0.13, pct: 13 },
        reit: { value: value * 0.03, pct: 3 },
        cash: { value: value * 0.07, pct: 7 },
      },
      topHoldings: [
        { ticker: "FXAIX", value: value * 0.25, pct: 25 },
        { ticker: "VOO", value: value * 0.08, pct: 8 },
        { ticker: "VTI", value: value * 0.08, pct: 8 },
      ],
    });
  }
  console.log("  Created ~65 daily snapshots");

  // 7. Real Estate
  await db.insert(schema.realEstate).values({
    clerkId: DEMO_ID, owner: "self", name: "Primary Residence",
    address: "742 Evergreen Terrace, Portland OR 97201",
    estimatedValue: "485000", mortgageBalance: "278000",
    mortgageRate: "3.875", monthlyPayment: "1850",
    isPrimaryResidence: true,
  });
  console.log("  Created real estate");

  // 8. Cash Reserves
  await db.insert(schema.cashReserves).values([
    { clerkId: DEMO_ID, owner: "self", name: "Joint Checking", accountType: "checking", institution: "Chase", balance: "14200" },
    { clerkId: DEMO_ID, owner: "self", name: "Emergency Fund", accountType: "high_yield_savings", institution: "Marcus", balance: "42000", interestRate: "4.40" },
    { clerkId: DEMO_ID, owner: "spouse", name: "Savings", accountType: "savings", institution: "Chase", balance: "8500", interestRate: "0.05" },
  ]);
  console.log("  Created 3 cash accounts");

  // 9. Debts
  await db.insert(schema.debts).values([
    { clerkId: DEMO_ID, owner: "self", name: "Auto Loan - RAV4", debtType: "auto_loan", originalBalance: "32000", currentBalance: "18400", interestRate: "4.9", monthlyPayment: "580", payoffDate: "2028-06-01" },
    { clerkId: DEMO_ID, owner: "spouse", name: "Student Loan", debtType: "student_loan", originalBalance: "45000", currentBalance: "12800", interestRate: "3.5", monthlyPayment: "420", payoffDate: "2029-03-01" },
  ]);
  console.log("  Created 2 debts");

  // 10. Vehicles
  await db.insert(schema.vehicles).values([
    {
      clerkId: DEMO_ID, owner: "self", name: "2023 Toyota RAV4 Hybrid",
      vehicleType: "suv", year: 2023, make: "Toyota", model: "RAV4 Hybrid", trim: "XLE Premium",
      mileage: 28000, condition: "excellent", estimatedValue: "34500",
      hasLoan: true, loanBalance: "18400", loanRate: "4.9", loanMonthlyPayment: "580", loanRemainingMonths: 26,
      purchasePrice: "38500", purchaseDate: "2023-03-15",
    },
    {
      clerkId: DEMO_ID, owner: "self", name: "2019 Honda Accord",
      vehicleType: "car", year: 2019, make: "Honda", model: "Accord", trim: "Sport",
      mileage: 62000, condition: "good", estimatedValue: "22000",
      hasLoan: false,
    },
    {
      clerkId: DEMO_ID, owner: "self", name: "2021 Yamaha MT-07",
      vehicleType: "motorcycle", year: 2021, make: "Yamaha", model: "MT-07",
      mileage: 8500, condition: "excellent", estimatedValue: "6800",
      hasLoan: false,
    },
  ]);
  console.log("  Created 3 vehicles");

  // 11. Goals
  await db.insert(schema.goals).values([
    {
      clerkId: DEMO_ID, name: "Retire by 62", targetAmount: "2500000",
      currentAmount: String(Math.round(totalPortfolio)), targetDate: "2050-01-01",
      isCompleted: false,
    },
    {
      clerkId: DEMO_ID, name: "Pay off all debt", targetAmount: "31200",
      currentAmount: "0", targetDate: "2029-06-01",
      isCompleted: false,
    },
  ]);
  console.log("  Created 2 goals");

  // 12. Alerts
  await db.insert(schema.alerts).values([
    {
      clerkId: DEMO_ID, type: "allocation_drift", severity: "warning",
      title: "International stocks underweight",
      message: "International stocks are at 22% vs your 25% target. Consider rebalancing with your next contribution.",
      isDismissed: false,
    },
    {
      clerkId: DEMO_ID, type: "milestone_reached", severity: "info",
      title: "Portfolio milestone reached",
      message: "Your household portfolio crossed $200,000. Great progress toward your retirement goal!",
      isDismissed: false,
    },
  ]);
  console.log("  Created 2 alerts");

  console.log("\nDemo data seeded successfully!");
  console.log(`  Portfolio: $${Math.round(totalPortfolio).toLocaleString()}`);
  console.log(`  Net worth: ~$${Math.round(totalPortfolio + 485000 - 278000 + 64700 - 31200 + 63300).toLocaleString()}`);
  console.log(`\nAccess demo at: https://your-app.vercel.app/?demo=true`);
}

/**
 * Close the connection and set an exit code.
 *
 * postgres.js keeps its socket open, so a script that just falls off the end
 * of main() never exits — which in CI is an unattended step that hangs until
 * the job times out rather than failing. Closing explicitly, and exiting
 * non-zero on failure, makes this usable as a build step.
 */
const sql = postgres(
  (process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL)!,
  { prepare: false, max: 1 }
);

main(sql)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
