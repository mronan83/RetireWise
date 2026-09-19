import { getApiUserId } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences, socialSecurityBenefits } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getAccounts } from "@/lib/queries/accounts";
import { calculatePortfolioSummary, calculateGainLoss } from "@/lib/utils/calculations";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { ASSET_CLASS_LABELS, ACCOUNT_TYPE_LABELS, ACCOUNT_OWNER_LABELS } from "@/lib/constants";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const [holdings, accountsList, prefs, selfSS, spouseSS] = await Promise.all([
    getHoldingsByClerkId(userId),
    getAccounts(userId),
    db.select().from(userPreferences).where(eq(userPreferences.clerkId, userId)).limit(1),
    db.select().from(socialSecurityBenefits).where(
      and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "self"))
    ).limit(1),
    db.select().from(socialSecurityBenefits).where(
      and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "spouse"))
    ).limit(1),
  ]);

  const summary = calculatePortfolioSummary(holdings);
  const pref = prefs[0];
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Build plain text report (readable, printable)
  let report = "";
  report += "═══════════════════════════════════════════════════\n";
  report += "          RETIREWISE PORTFOLIO REPORT\n";
  report += `          ${today}\n`;
  report += "═══════════════════════════════════════════════════\n\n";

  // Household
  if (pref) {
    report += "HOUSEHOLD\n";
    report += "─────────────────────────────────────────────────\n";
    report += `  ${pref.firstName || "Self"}, Age ${pref.currentAge || "?"} → Retire at ${pref.retirementAge || "?"}\n`;
    if (pref.spouseName) {
      report += `  ${pref.spouseName}, Age ${pref.spouseCurrentAge || "?"} → Retire at ${pref.spouseRetirementAge || "?"}`;
      if (pref.spouseIsRetired) report += " (RETIRED)";
      report += "\n";
    }
    report += `  Filing: ${pref.filingStatus || "MFJ"} | Risk: ${pref.riskTolerance || "moderate"}\n\n`;
  }

  // Portfolio Summary
  report += "PORTFOLIO SUMMARY\n";
  report += "─────────────────────────────────────────────────\n";
  report += `  Total Value:       ${formatCurrency(summary.totalValue)}\n`;
  report += `  Cost Basis:        ${formatCurrency(summary.totalCostBasis)}\n`;
  report += `  Total Gain/Loss:   ${formatCurrency(summary.totalGainLoss)} (${formatPercent(summary.totalGainLossPct)})\n`;
  report += `  Accounts:          ${accountsList.length}\n`;
  report += `  Holdings:          ${holdings.length}\n\n`;

  // Per-owner breakdown
  let selfVal = 0, spouseVal = 0;
  for (const h of holdings) {
    if (h.accountOwner === "spouse") spouseVal += Number(h.currentValue);
    else selfVal += Number(h.currentValue);
  }
  report += `  ${pref?.firstName || "Self"}: ${formatCurrency(selfVal)}`;
  if (spouseVal > 0) report += `  |  ${pref?.spouseName || "Spouse"}: ${formatCurrency(spouseVal)}`;
  report += "\n\n";

  // Allocation
  report += "ASSET ALLOCATION\n";
  report += "─────────────────────────────────────────────────\n";
  for (const [cls, data] of Object.entries(summary.allocation)) {
    const label = (ASSET_CLASS_LABELS[cls] || cls).padEnd(22);
    report += `  ${label} ${formatPercent(data.pct).padStart(7)}  ${formatCurrency(data.value).padStart(12)}\n`;
  }
  report += "\n";

  // Accounts
  report += "ACCOUNTS\n";
  report += "─────────────────────────────────────────────────\n";
  for (const acct of accountsList) {
    const acctValue = holdings
      .filter((h) => h.accountId === acct.id)
      .reduce((s, h) => s + Number(h.currentValue), 0);
    const owner = ACCOUNT_OWNER_LABELS[acct.owner] || acct.owner;
    report += `  ${acct.name.padEnd(25)} ${ACCOUNT_TYPE_LABELS[acct.accountType]?.padEnd(15) || ""} ${owner.padEnd(8)} ${formatCurrency(acctValue).padStart(12)}\n`;
  }
  report += "\n";

  // Holdings
  report += "HOLDINGS\n";
  report += "─────────────────────────────────────────────────\n";
  report += "  Ticker    Shares       Price        Value       Gain/Loss\n";
  const sorted = [...holdings].sort((a, b) => Number(b.currentValue) - Number(a.currentValue));
  for (const h of sorted) {
    const { gainLoss, gainLossPct } = calculateGainLoss(h);
    report += `  ${h.ticker.padEnd(9)} ${Number(h.shares).toFixed(2).padStart(10)}  ${formatCurrency(Number(h.currentPrice)).padStart(10)}  ${formatCurrency(Number(h.currentValue)).padStart(12)}  ${formatCurrency(gainLoss).padStart(10)} (${formatPercent(gainLossPct)})\n`;
  }
  report += "\n";

  // Social Security
  if (selfSS[0] || spouseSS[0]) {
    report += "SOCIAL SECURITY\n";
    report += "─────────────────────────────────────────────────\n";
    if (selfSS[0]) {
      report += `  ${pref?.firstName || "Self"}: $${selfSS[0].benefitAtFRA || "?"}/mo at FRA\n`;
    }
    if (spouseSS[0]) {
      report += `  ${pref?.spouseName || "Spouse"}: $${spouseSS[0].benefitAtFRA || "?"}/mo at FRA\n`;
    }
    report += "\n";
  }

  report += "═══════════════════════════════════════════════════\n";
  report += "  Generated by RetireWise | For informational purposes only\n";
  report += "═══════════════════════════════════════════════════\n";

  return new Response(report, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="retirewise-report-${new Date().toISOString().split("T")[0]}.txt"`,
    },
  });
}
