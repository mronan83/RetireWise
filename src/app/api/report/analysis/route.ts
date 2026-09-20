import { getApiUserId } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { generateText } from "ai";
import { getDb } from "@/lib/db";
import {
  userPreferences,
  socialSecurityBenefits,
  contributions,
} from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getAccounts } from "@/lib/queries/accounts";
import { getSnapshots } from "@/lib/queries/snapshots";
import {
  calculatePortfolioSummary,
  calculateGainLoss,
  calculateAllocation,
  calculateAllocationDrift,
} from "@/lib/utils/calculations";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import {
  ASSET_CLASS_LABELS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_OWNER_LABELS,
} from "@/lib/constants";
import { MissingApiKeyError } from "@/lib/ai/model";
import { resolveUserModel } from "@/lib/ai/user-model";

const COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6",
];

// Analysis type definitions — title, AI prompt focus, and what data sections to include
const ANALYSIS_TYPES: Record<string, {
  title: string;
  subtitle: string;
  prompt: (ctx: DataContext) => string;
  sections: string[];
}> = {
  portfolio_review: {
    title: "Portfolio Review",
    subtitle: "Comprehensive health check of your household portfolio",
    prompt: (ctx) => `Analyze this household portfolio comprehensively. Cover allocation balance, diversification, concentration risk, performance, and 3-4 specific actionable recommendations. Be specific about tickers and numbers.\n\n${ctx.portfolioSummaryText}`,
    sections: ["stats", "allocation", "holdings", "accounts"],
  },
  allocation_drift: {
    title: "Allocation Drift Analysis",
    subtitle: "Current allocation vs targets with rebalancing guidance",
    prompt: (ctx) => `Analyze this portfolio's allocation drift from targets. Identify what's overweight/underweight, explain the risk implications, and give specific rebalancing recommendations.\n\n${ctx.portfolioSummaryText}\n\nDrift:\n${ctx.driftText}`,
    sections: ["stats", "drift", "allocation"],
  },
  tax_strategy: {
    title: "Tax Strategy Review",
    subtitle: "Asset location optimization across account types",
    prompt: (ctx) => `Review this portfolio for tax optimization. Check asset location — are bonds in tax-deferred? Growth in Roth? Recommend specific moves to improve tax efficiency.\n\n${ctx.portfolioSummaryText}\n\nAccounts by tax treatment:\n${ctx.taxBucketText}`,
    sections: ["stats", "tax_buckets", "accounts"],
  },
  household_summary: {
    title: "Household Summary",
    subtitle: "Combined retirement picture for both spouses",
    prompt: (ctx) => `Provide a household retirement summary. Cover each spouse's portfolio, retirement timelines, Social Security strategy, combined income projections, and any gaps.\n\n${ctx.portfolioSummaryText}\n\n${ctx.retirementText}`,
    sections: ["stats", "accounts", "retirement"],
  },
  risk_assessment: {
    title: "Risk Assessment",
    subtitle: "Concentration, correlation, and downturn analysis",
    prompt: (ctx) => `Assess this portfolio's risk. Analyze sector concentration, top holding concentration (single-stock risk), and estimate portfolio behavior in a 20-30% market downturn. Give specific risk-reduction recommendations.\n\n${ctx.portfolioSummaryText}`,
    sections: ["stats", "concentration", "holdings"],
  },
  retirement_readiness: {
    title: "Retirement Readiness",
    subtitle: "Are you on track to retire when you want?",
    prompt: (ctx) => `Assess retirement readiness. Based on the portfolio value, savings rate, Social Security, and retirement timeline, is this household on track? What's the projected monthly income vs expenses? What adjustments would improve the outlook?\n\n${ctx.portfolioSummaryText}\n\n${ctx.retirementText}`,
    sections: ["stats", "retirement", "accounts"],
  },
  rebalancing: {
    title: "Rebalancing Recommendations",
    subtitle: "Specific trades to return to target allocation",
    prompt: (ctx) => `Generate specific rebalancing trade recommendations. Show exact buy/sell amounts, which tickers, and which accounts to trade in. Prefer rebalancing in tax-advantaged accounts to avoid capital gains.\n\n${ctx.portfolioSummaryText}\n\nDrift:\n${ctx.driftText}`,
    sections: ["stats", "drift", "holdings"],
  },
  tax_loss: {
    title: "Tax-Loss Harvesting",
    subtitle: "Unrealized losses available to harvest in taxable accounts",
    prompt: (ctx) => `Scan for tax-loss harvesting opportunities. Only taxable brokerage accounts qualify. Show holdings with unrealized losses, estimated tax savings (assume 22% bracket), and suggest replacement funds to maintain exposure. Watch for wash sale rules.\n\n${ctx.taxableLossesText}`,
    sections: ["stats", "losses", "holdings"],
  },
  dividend: {
    title: "Dividend Income Analysis",
    subtitle: "Passive income projections from your portfolio",
    prompt: (ctx) => `Analyze dividend income for this portfolio. Estimate annual income, monthly passive income, identify top dividend payers, and suggest whether the dividend allocation is appropriate for the retirement timeline.\n\n${ctx.portfolioSummaryText}`,
    sections: ["stats", "holdings", "allocation"],
  },
  rmd_roth: {
    title: "RMD & Roth Conversion",
    subtitle: "Tax-efficient withdrawal planning",
    prompt: (ctx) => `Analyze RMD obligations and Roth conversion strategy. Project RMDs from age 73, estimate tax impact, and recommend a Roth conversion ladder for the years between retirement and 73 to reduce lifetime taxes.\n\n${ctx.portfolioSummaryText}\n\n${ctx.retirementText}\n\nTax-deferred balance: ${ctx.taxDeferredTotal}`,
    sections: ["stats", "tax_buckets", "retirement"],
  },
  fee_sequence: {
    title: "Fee Impact & Sequence Risk",
    subtitle: "Hidden costs and retirement timing risk",
    prompt: (ctx) => `Analyze expense ratio drag and sequence-of-returns risk. Calculate 30-year fee impact for the current portfolio, identify expensive funds, and assess how a bear market in the first 3 years of retirement would affect portfolio survival.\n\n${ctx.portfolioSummaryText}\n\n${ctx.retirementText}`,
    sections: ["stats", "holdings", "retirement"],
  },
  healthcare_income: {
    title: "Healthcare & Income Replacement",
    subtitle: "Healthcare cost projections and income adequacy",
    prompt: (ctx) => `Project healthcare costs through retirement (pre-Medicare at 5-6% inflation, Medicare premiums, supplemental insurance, out-of-pocket). Also calculate income replacement ratio — will retirement income cover 70-80% of pre-retirement income?\n\n${ctx.portfolioSummaryText}\n\n${ctx.retirementText}`,
    sections: ["stats", "retirement"],
  },
};

type DataContext = {
  portfolioSummaryText: string;
  driftText: string;
  taxBucketText: string;
  taxableLossesText: string;
  retirementText: string;
  taxDeferredTotal: string;
};

export async function GET(request: Request) {
  const userId = await getApiUserId();
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "portfolio_review";
  const config = ANALYSIS_TYPES[type];
  if (!config) return Response.json({ error: "Invalid analysis type" }, { status: 400 });

  const db = getDb();
  const [holdings, accountsList, prefs, selfSS, spouseSS, snapshots, contribs] =
    await Promise.all([
      getHoldingsByClerkId(userId),
      getAccounts(userId),
      db.select().from(userPreferences).where(eq(userPreferences.clerkId, userId)).limit(1),
      db.select().from(socialSecurityBenefits).where(
        and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "self"))
      ).limit(1),
      db.select().from(socialSecurityBenefits).where(
        and(eq(socialSecurityBenefits.clerkId, userId), eq(socialSecurityBenefits.owner, "spouse"))
      ).limit(1),
      getSnapshots(userId, 90),
      db.select().from(contributions).where(eq(contributions.clerkId, userId)),
    ]);

  const pref = prefs[0];
  const summary = calculatePortfolioSummary(holdings);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Allocation
  const allocEntries = Object.entries(summary.allocation)
    .sort((a, b) => b[1].pct - a[1].pct)
    .filter(([, d]) => d.pct > 0);

  // Allocation drift
  const targetAlloc = (pref?.targetAllocation as Record<string, number>) || null;
  let driftData: { assetClass: string; current: number; target: number; diff: number }[] = [];
  if (targetAlloc) {
    driftData = Object.entries(targetAlloc).map(([cls, target]) => {
      const current = summary.allocation[cls]?.pct || 0;
      return { assetClass: cls, current, target, diff: current - target };
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }

  // Per-owner values
  let selfVal = 0, spouseVal = 0;
  for (const h of holdings) {
    if (h.accountOwner === "spouse") spouseVal += Number(h.currentValue);
    else selfVal += Number(h.currentValue);
  }

  // Map accountId -> tax treatment
  const acctTaxMap = new Map(accountsList.map((a) => [a.id, a.taxTreatment]));

  // Tax buckets
  const taxBuckets: Record<string, { value: number; holdings: string[] }> = {
    tax_deferred: { value: 0, holdings: [] },
    tax_free: { value: 0, holdings: [] },
    taxable: { value: 0, holdings: [] },
  };
  for (const h of holdings) {
    const treatment = acctTaxMap.get(h.accountId) || "taxable";
    const bucket = taxBuckets[treatment];
    if (bucket) {
      bucket.value += Number(h.currentValue);
      bucket.holdings.push(h.ticker);
    }
  }

  // Taxable losses
  const taxableLosses = holdings
    .filter((h) => (acctTaxMap.get(h.accountId) || "taxable") === "taxable")
    .map((h) => {
      const { gainLoss, gainLossPct } = calculateGainLoss(h);
      return { ticker: h.ticker, value: Number(h.currentValue), gainLoss, gainLossPct };
    })
    .filter((h) => h.gainLoss < 0)
    .sort((a, b) => a.gainLoss - b.gainLoss);

  // Top holdings
  const sortedHoldings = [...holdings]
    .sort((a, b) => Number(b.currentValue) - Number(a.currentValue))
    .slice(0, 15);

  // Concentration (top 5 as % of portfolio)
  const topConcentration = sortedHoldings.slice(0, 5).map((h) => ({
    ticker: h.ticker,
    value: Number(h.currentValue),
    pct: summary.totalValue > 0 ? (Number(h.currentValue) / summary.totalValue) * 100 : 0,
  }));

  // Retirement info
  const yearsToRetirement = pref?.retirementAge && pref?.currentAge
    ? Math.max(0, pref.retirementAge - pref.currentAge) : null;
  const monthlyExpenses = pref?.monthlyExpensesRetirement ? Number(pref.monthlyExpensesRetirement) : null;

  // Build context strings for AI prompts
  const holdingSummary = sortedHoldings
    .map((h) => `${h.ticker}: ${formatCurrency(Number(h.currentValue))} (${((Number(h.currentValue) / summary.totalValue) * 100).toFixed(1)}%)`)
    .join("\n");
  const allocSummary = allocEntries
    .map(([cls, d]) => `${ASSET_CLASS_LABELS[cls] || cls}: ${d.pct.toFixed(1)}%`)
    .join(", ");

  const ctx: DataContext = {
    portfolioSummaryText: [
      `Portfolio: ${formatCurrency(summary.totalValue)} | Gain/Loss: ${formatCurrency(summary.totalGainLoss)} (${formatPercent(summary.totalGainLossPct)})`,
      `Self: ${formatCurrency(selfVal)} | Spouse: ${formatCurrency(spouseVal)}`,
      `Allocation: ${allocSummary}`,
      `Holdings:\n${holdingSummary}`,
      `Accounts: ${accountsList.length} (${holdings.length} positions)`,
    ].join("\n"),
    driftText: driftData.length > 0
      ? driftData.map((d) => `${ASSET_CLASS_LABELS[d.assetClass] || d.assetClass}: ${d.current.toFixed(1)}% current vs ${d.target}% target (${d.diff >= 0 ? "+" : ""}${d.diff.toFixed(1)}%)`).join("\n")
      : "No target allocation set.",
    taxBucketText: Object.entries(taxBuckets)
      .map(([t, d]) => `${t.replace("_", "-")}: ${formatCurrency(d.value)} (${d.holdings.length} holdings)`)
      .join("\n"),
    taxableLossesText: taxableLosses.length > 0
      ? `Taxable holdings with losses:\n${taxableLosses.map((h) => `${h.ticker}: ${formatCurrency(h.value)} | Loss: ${formatCurrency(h.gainLoss)} (${formatPercent(h.gainLossPct)})`).join("\n")}`
      : "No unrealized losses in taxable accounts.",
    retirementText: [
      yearsToRetirement !== null ? `Years to retirement: ${yearsToRetirement} (age ${pref?.retirementAge})` : "",
      pref?.currentAge ? `Current age: ${pref.currentAge}` : "",
      pref?.spouseCurrentAge ? `Spouse age: ${pref.spouseCurrentAge}` : "",
      selfSS[0]?.benefitAtFRA ? `Self SS at FRA: $${selfSS[0].benefitAtFRA}/mo` : "",
      spouseSS[0]?.benefitAtFRA ? `Spouse SS at FRA: $${spouseSS[0].benefitAtFRA}/mo` : "",
      monthlyExpenses ? `Monthly expenses in retirement: ${formatCurrency(monthlyExpenses)}` : "",
      contribs.length > 0 ? `Active contributions: ${contribs.filter((c) => c.isActive).length} line items` : "",
    ].filter(Boolean).join("\n"),
    taxDeferredTotal: formatCurrency(taxBuckets.tax_deferred.value),
  };

  // Generate AI insights on the household's own API key.
  let aiInsights = "";
  try {
    const { model } = await resolveUserModel(userId);
    const { text } = await generateText({
      model,
      prompt: `You are a financial analyst generating a report infographic. Be specific with numbers, tickers, and percentages. Format as 6-8 bullet points, each 1-2 sentences. Use plain language.\n\n${config.prompt(ctx)}`,
    });
    aiInsights = text;
  } catch (e) {
    aiInsights =
      e instanceof MissingApiKeyError
        ? "AI insights need your own API key. Add one in Settings \u2192 AI provider."
        : "AI insights unavailable \u2014 check your AI provider configuration in Settings.";
  }

  // Format insights as HTML
  const insightItems = aiInsights
    .split("\n")
    .filter((l) => l.trim().startsWith("-") || l.trim().startsWith("•") || l.trim().startsWith("*") || /^\d+\./.test(l.trim()))
    .map((l) => l.replace(/^[\s\-•*\d.]+/, "").trim())
    .filter(Boolean);

  // Daily change from snapshots
  const latestSnapshot = snapshots[0];
  const dailyChange = latestSnapshot ? Number(latestSnapshot.dailyChange || 0) : 0;

  // Build SVG donut chart
  let donutOffset = 0;
  const donutSlices = allocEntries.map(([cls, data], i) => {
    const angle = (data.pct / 100) * 360;
    const startAngle = donutOffset;
    donutOffset += angle;
    const endAngle = donutOffset;
    const largeArc = angle > 180 ? 1 : 0;
    const sr = (startAngle * Math.PI) / 180;
    const er = (endAngle * Math.PI) / 180;
    const x1 = 100 + 80 * Math.sin(sr), y1 = 100 - 80 * Math.cos(sr);
    const x2 = 100 + 80 * Math.sin(er), y2 = 100 - 80 * Math.cos(er);
    const ix1 = 100 + 50 * Math.sin(er), iy1 = 100 - 50 * Math.cos(er);
    const ix2 = 100 + 50 * Math.sin(sr), iy2 = 100 - 50 * Math.cos(sr);
    return {
      path: `M ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A 50 50 0 ${largeArc} 0 ${ix2} ${iy2} Z`,
      color: COLORS[i % COLORS.length],
      label: ASSET_CLASS_LABELS[cls] || cls,
      pct: data.pct,
      value: data.value,
    };
  });

  // Build drift bar chart SVG
  const driftChartSvg = driftData.length > 0 ? buildDriftChart(driftData) : "";

  // Build concentration bar chart SVG
  const concentrationSvg = buildConcentrationChart(topConcentration);

  // Sparkline
  const sparkData = snapshots.map((s) => Number(s.totalValue)).reverse();
  let sparkSvg = "";
  if (sparkData.length > 1) {
    const w = 400, h = 80;
    const min = Math.min(...sparkData) * 0.995, max = Math.max(...sparkData) * 1.005;
    const range = max - min || 1;
    const points = sparkData.map((v, i) => `${(i / (sparkData.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
    sparkSvg = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:80px;">
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#22c55e" stop-opacity="0.3"/><stop offset="100%" stop-color="#22c55e" stop-opacity="0"/></linearGradient></defs>
      <polygon points="0,${h} ${points} ${w},${h}" fill="url(#sg)" />
      <polyline points="${points}" fill="none" stroke="#22c55e" stroke-width="2" />
    </svg>`;
  }

  // === Build HTML sections based on analysis type ===
  const sectionHtml: string[] = [];

  // Stats section
  if (config.sections.includes("stats")) {
    sectionHtml.push(`
    <div class="section">
      <div class="section-title">Key Metrics</div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Total Portfolio</div>
          <div class="stat-value white">${formatCurrency(summary.totalValue)}</div>
          <div class="stat-sub">${pref?.firstName || "Self"}: ${formatCurrency(selfVal)}${spouseVal > 0 ? ` · ${pref?.spouseName || "Spouse"}: ${formatCurrency(spouseVal)}` : ""}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Gain/Loss</div>
          <div class="stat-value ${summary.totalGainLoss >= 0 ? "green" : "red"}">${formatCurrency(summary.totalGainLoss)}</div>
          <div class="stat-sub">${formatPercent(summary.totalGainLossPct)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Daily Change</div>
          <div class="stat-value ${dailyChange >= 0 ? "green" : "red"}">${dailyChange >= 0 ? "+" : ""}${formatCurrency(dailyChange)}</div>
        </div>
        ${yearsToRetirement !== null ? `<div class="stat-card">
          <div class="stat-label">Years to Retirement</div>
          <div class="stat-value amber">${yearsToRetirement}</div>
          <div class="stat-sub">Target age ${pref?.retirementAge}</div>
        </div>` : ""}
      </div>
    </div>`);
  }

  // Allocation donut
  if (config.sections.includes("allocation")) {
    sectionHtml.push(`
    <div class="section">
      <div class="section-title">Asset Allocation</div>
      <div class="chart-row">
        <svg viewBox="0 0 200 200" style="width:200px;height:200px;">
          ${donutSlices.map((s) => `<path d="${s.path}" fill="${s.color}" />`).join("\n")}
          <text x="100" y="95" text-anchor="middle" fill="#fff" font-size="14" font-weight="700" font-family="monospace">${formatCurrency(summary.totalValue)}</text>
          <text x="100" y="110" text-anchor="middle" fill="#737373" font-size="10">total</text>
        </svg>
        <div class="donut-legend">
          ${donutSlices.map((s) => `<div class="legend-item"><div class="legend-dot" style="background:${s.color}"></div><span>${s.label}</span><span class="legend-pct">${s.pct.toFixed(1)}%</span><span class="legend-val">${formatCurrency(s.value)}</span></div>`).join("\n")}
        </div>
      </div>
    </div>`);
  }

  // Drift chart
  if (config.sections.includes("drift") && driftChartSvg) {
    sectionHtml.push(`
    <div class="section">
      <div class="section-title">Allocation Drift — Current vs Target</div>
      <div class="sparkline-box">${driftChartSvg}</div>
      <div style="margin-top:12px;border:1px solid #262626;border-radius:12px;overflow:hidden;">
        <table>
          <thead><tr><th>Asset Class</th><th class="right">Current</th><th class="right">Target</th><th class="right">Drift</th></tr></thead>
          <tbody>
            ${driftData.map((d) => `<tr>
              <td>${ASSET_CLASS_LABELS[d.assetClass] || d.assetClass}</td>
              <td class="right mono">${d.current.toFixed(1)}%</td>
              <td class="right mono">${d.target}%</td>
              <td class="right mono ${d.diff > 2 ? "red" : d.diff < -2 ? "amber" : "green"}">${d.diff >= 0 ? "+" : ""}${d.diff.toFixed(1)}%</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`);
  }

  // Tax buckets
  if (config.sections.includes("tax_buckets")) {
    sectionHtml.push(`
    <div class="section">
      <div class="section-title">Tax Treatment Breakdown</div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Tax-Deferred (401k, IRA)</div>
          <div class="stat-value amber">${formatCurrency(taxBuckets.tax_deferred.value)}</div>
          <div class="stat-sub">${summary.totalValue > 0 ? ((taxBuckets.tax_deferred.value / summary.totalValue) * 100).toFixed(1) : 0}% of portfolio</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Tax-Free (Roth, HSA)</div>
          <div class="stat-value green">${formatCurrency(taxBuckets.tax_free.value)}</div>
          <div class="stat-sub">${summary.totalValue > 0 ? ((taxBuckets.tax_free.value / summary.totalValue) * 100).toFixed(1) : 0}% of portfolio</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Taxable (Brokerage)</div>
          <div class="stat-value white">${formatCurrency(taxBuckets.taxable.value)}</div>
          <div class="stat-sub">${summary.totalValue > 0 ? ((taxBuckets.taxable.value / summary.totalValue) * 100).toFixed(1) : 0}% of portfolio</div>
        </div>
      </div>
    </div>`);
  }

  // Concentration chart
  if (config.sections.includes("concentration")) {
    sectionHtml.push(`
    <div class="section">
      <div class="section-title">Top 5 Concentration</div>
      <div class="sparkline-box">${concentrationSvg}</div>
    </div>`);
  }

  // Taxable losses table
  if (config.sections.includes("losses")) {
    sectionHtml.push(`
    <div class="section">
      <div class="section-title">Tax-Loss Harvesting Candidates</div>
      ${taxableLosses.length > 0 ? `
      <div style="border:1px solid #262626;border-radius:12px;overflow:hidden;">
        <table>
          <thead><tr><th>Ticker</th><th class="right">Value</th><th class="right">Unrealized Loss</th><th class="right">Est. Tax Savings (22%)</th></tr></thead>
          <tbody>
            ${taxableLosses.map((h) => `<tr>
              <td class="ticker">${h.ticker}</td>
              <td class="right mono">${formatCurrency(h.value)}</td>
              <td class="right mono red">${formatCurrency(h.gainLoss)}</td>
              <td class="right mono green">${formatCurrency(Math.abs(h.gainLoss) * 0.22)}</td>
            </tr>`).join("")}
            <tr style="border-top:2px solid #262626">
              <td class="ticker">Total</td>
              <td></td>
              <td class="right mono red">${formatCurrency(taxableLosses.reduce((s, h) => s + h.gainLoss, 0))}</td>
              <td class="right mono green">${formatCurrency(Math.abs(taxableLosses.reduce((s, h) => s + h.gainLoss, 0)) * 0.22)}</td>
            </tr>
          </tbody>
        </table>
      </div>` : `<div class="insights-box"><p style="color:#737373">No unrealized losses found in taxable accounts.</p></div>`}
    </div>`);
  }

  // Retirement info
  if (config.sections.includes("retirement")) {
    sectionHtml.push(`
    <div class="section">
      <div class="section-title">Retirement Profile</div>
      <div class="stat-grid">
        ${pref?.currentAge ? `<div class="stat-card"><div class="stat-label">${pref?.firstName || "Self"}</div><div class="stat-value white">Age ${pref.currentAge}</div><div class="stat-sub">Retire at ${pref.retirementAge || "?"}</div></div>` : ""}
        ${pref?.spouseCurrentAge ? `<div class="stat-card"><div class="stat-label">${pref?.spouseName || "Spouse"}</div><div class="stat-value white">Age ${pref.spouseCurrentAge}</div><div class="stat-sub">Retire at ${pref.spouseRetirementAge || "?"}</div></div>` : ""}
        ${selfSS[0]?.benefitAtFRA ? `<div class="stat-card"><div class="stat-label">Self SS at FRA</div><div class="stat-value green">${formatCurrency(Number(selfSS[0].benefitAtFRA))}/mo</div></div>` : ""}
        ${spouseSS[0]?.benefitAtFRA ? `<div class="stat-card"><div class="stat-label">Spouse SS at FRA</div><div class="stat-value green">${formatCurrency(Number(spouseSS[0].benefitAtFRA))}/mo</div></div>` : ""}
        ${monthlyExpenses ? `<div class="stat-card"><div class="stat-label">Monthly Expenses</div><div class="stat-value amber">${formatCurrency(monthlyExpenses)}</div></div>` : ""}
      </div>
    </div>`);
  }

  // Holdings table
  if (config.sections.includes("holdings")) {
    sectionHtml.push(`
    <div class="section">
      <div class="section-title">Top Holdings</div>
      <div style="border:1px solid #262626;border-radius:12px;overflow:hidden;">
        <table>
          <thead><tr><th>Ticker</th><th>Name</th><th class="right">Value</th><th class="right">Weight</th><th class="right">Gain/Loss</th></tr></thead>
          <tbody>
            ${sortedHoldings.map((h) => {
              const { gainLoss, gainLossPct } = calculateGainLoss(h);
              const weight = summary.totalValue > 0 ? (Number(h.currentValue) / summary.totalValue) * 100 : 0;
              return `<tr>
                <td class="ticker">${h.ticker}</td>
                <td style="color:#a3a3a3;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.name}</td>
                <td class="right mono">${formatCurrency(Number(h.currentValue))}</td>
                <td class="right mono" style="color:#737373">${weight.toFixed(1)}%</td>
                <td class="right mono ${gainLoss >= 0 ? "green" : "red"}">${formatCurrency(gainLoss)} <span class="badge ${gainLoss >= 0 ? "badge-green" : "badge-red"}">${formatPercent(gainLossPct)}</span></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`);
  }

  // Accounts table
  if (config.sections.includes("accounts")) {
    sectionHtml.push(`
    <div class="section">
      <div class="section-title">Accounts</div>
      <div style="border:1px solid #262626;border-radius:12px;overflow:hidden;">
        <table>
          <thead><tr><th>Account</th><th>Type</th><th>Tax</th><th>Owner</th><th class="right">Value</th></tr></thead>
          <tbody>
            ${accountsList.map((a) => {
              const val = holdings.filter((h) => h.accountId === a.id).reduce((s, h) => s + Number(h.currentValue), 0);
              return `<tr>
                <td style="font-weight:500">${a.name}</td>
                <td style="color:#737373;font-size:12px">${ACCOUNT_TYPE_LABELS[a.accountType] || a.accountType}</td>
                <td style="color:#737373;font-size:12px">${a.taxTreatment.replace("_", " ")}</td>
                <td style="color:#737373">${ACCOUNT_OWNER_LABELS[a.owner]}</td>
                <td class="right mono">${formatCurrency(val)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`);
  }

  // Sparkline
  if (sparkSvg && config.sections.includes("stats")) {
    sectionHtml.push(`
    <div class="section">
      <div class="section-title">Portfolio Trend (90 days)</div>
      <div class="sparkline-box">
        <div class="sparkline-label">
          <span style="font-size:12px;color:#737373">${sparkData.length} snapshots</span>
          <span style="font-size:12px;color:#737373">${formatCurrency(sparkData[sparkData.length - 1] || 0)} current</span>
        </div>
        ${sparkSvg}
      </div>
    </div>`);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${config.title} — RetireWise</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; }
  .page { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
  .header { text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #262626; }
  .header h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; color: #fff; }
  .header .subtitle { color: #a3a3a3; font-size: 14px; margin-top: 4px; }
  .header .date { color: #737373; font-size: 12px; margin-top: 2px; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #737373; margin-bottom: 12px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .stat-card { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 16px; }
  .stat-label { font-size: 11px; color: #737373; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-value { font-size: 22px; font-weight: 700; font-family: 'SF Mono', 'Fira Code', monospace; margin-top: 4px; }
  .stat-sub { font-size: 12px; color: #737373; margin-top: 2px; }
  .green { color: #22c55e; } .red { color: #ef4444; } .amber { color: #f59e0b; } .white { color: #fff; }
  .chart-row { display: grid; grid-template-columns: 200px 1fr; gap: 24px; align-items: start; }
  .donut-legend { display: flex; flex-direction: column; gap: 6px; }
  .legend-item { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .legend-pct { font-family: monospace; color: #a3a3a3; min-width: 45px; text-align: right; }
  .legend-val { font-family: monospace; color: #525252; font-size: 12px; margin-left: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 11px; color: #737373; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 12px; border-bottom: 1px solid #262626; }
  th.right { text-align: right; }
  td { padding: 8px 12px; border-bottom: 1px solid #1a1a1a; }
  td.mono { font-family: 'SF Mono', monospace; }
  td.right { text-align: right; }
  td.ticker { font-weight: 600; color: #fff; }
  .sparkline-box { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 16px; }
  .sparkline-label { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .insights-box { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 20px; }
  .insights-box ul { list-style: none; padding: 0; }
  .insights-box li { padding: 10px 0; border-bottom: 1px solid #1a1a1a; font-size: 14px; line-height: 1.6; color: #d4d4d4; }
  .insights-box li:last-child { border-bottom: none; }
  .insights-box li::before { content: '→'; color: #6366f1; margin-right: 8px; font-weight: 600; }
  .footer { text-align: center; padding-top: 24px; border-top: 1px solid #262626; margin-top: 32px; font-size: 11px; color: #525252; }
  .badge { display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
  .badge-green { background: #22c55e20; color: #22c55e; }
  .badge-red { background: #ef444420; color: #ef4444; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; z-index: 100; font-weight: 500; }
  .print-btn:hover { background: #4f46e5; }
  @media (max-width: 600px) { .chart-row { grid-template-columns: 1fr; } .stat-grid { grid-template-columns: 1fr 1fr; } .stat-value { font-size: 18px; } }
  @media print { .print-btn { display: none; } body { background: #fff; color: #111; } .stat-card, .sparkline-box, .insights-box { border-color: #ddd; background: #f9f9f9; } .green { color: #16a34a; } .red { color: #dc2626; } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
<div class="page">
  <div class="header">
    <h1>${config.title}</h1>
    <div class="subtitle">${config.subtitle}</div>
    <div class="date">${today}${pref ? ` · ${pref.firstName || ""}${pref.spouseName ? ` & ${pref.spouseName}` : ""} Household` : ""}</div>
  </div>

  ${sectionHtml.join("\n")}

  <!-- AI Analysis -->
  <div class="section">
    <div class="section-title">AI Analysis & Recommendations</div>
    <div class="insights-box">
      ${insightItems.length > 0
        ? `<ul>${insightItems.map((item) => `<li>${item}</li>`).join("")}</ul>`
        : `<p style="color:#a3a3a3;font-size:14px;line-height:1.6;white-space:pre-wrap">${aiInsights}</p>`}
    </div>
  </div>

  <div class="footer">
    <p>Generated by RetireWise · ${config.title} · ${today}</p>
    <p style="margin-top:4px">For informational purposes only. Not financial advice. Past performance does not guarantee future results.</p>
  </div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// === Chart builders ===

function buildDriftChart(data: { assetClass: string; current: number; target: number; diff: number }[]): string {
  const w = 400, h = 200, barH = 24, gap = 8;
  const maxPct = Math.max(...data.map((d) => Math.max(d.current, d.target)), 60);
  const rows = data.slice(0, 8).map((d, i) => {
    const y = i * (barH + gap) + 20;
    const cw = (d.current / maxPct) * (w - 120);
    const tw = (d.target / maxPct) * (w - 120);
    const label = (ASSET_CLASS_LABELS[d.assetClass] || d.assetClass).slice(0, 14);
    return `
      <text x="0" y="${y + 16}" fill="#a3a3a3" font-size="11" font-family="sans-serif">${label}</text>
      <rect x="120" y="${y}" width="${tw}" height="${barH}" rx="4" fill="#262626" />
      <rect x="120" y="${y}" width="${cw}" height="${barH}" rx="4" fill="${Math.abs(d.diff) > 5 ? "#ef4444" : Math.abs(d.diff) > 2 ? "#f59e0b" : "#22c55e"}" opacity="0.8" />
      <text x="${120 + Math.max(cw, tw) + 8}" y="${y + 16}" fill="#737373" font-size="11" font-family="monospace">${d.current.toFixed(1)}% / ${d.target}%</text>
    `;
  }).join("");
  const totalH = data.slice(0, 8).length * (barH + gap) + 30;
  return `<svg viewBox="0 0 ${w} ${totalH}" style="width:100%;height:${totalH}px;">${rows}</svg>
    <div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:#737373">
      <span>■ Current allocation</span>
      <span style="color:#262626">■</span> <span>Target</span>
    </div>`;
}

function buildConcentrationChart(data: { ticker: string; value: number; pct: number }[]): string {
  const w = 400, barH = 28, gap = 8;
  const maxPct = Math.max(...data.map((d) => d.pct), 30);
  const rows = data.map((d, i) => {
    const y = i * (barH + gap) + 4;
    const bw = (d.pct / maxPct) * (w - 120);
    const color = d.pct > 20 ? "#ef4444" : d.pct > 10 ? "#f59e0b" : "#6366f1";
    return `
      <text x="0" y="${y + 19}" fill="#fff" font-size="13" font-weight="600" font-family="sans-serif">${d.ticker}</text>
      <rect x="80" y="${y}" width="${bw}" height="${barH}" rx="4" fill="${color}" opacity="0.8" />
      <text x="${80 + bw + 8}" y="${y + 19}" fill="#a3a3a3" font-size="12" font-family="monospace">${d.pct.toFixed(1)}%</text>
    `;
  }).join("");
  const totalH = data.length * (barH + gap) + 10;
  return `<svg viewBox="0 0 ${w} ${totalH}" style="width:100%;height:${totalH}px;">${rows}</svg>
    <div style="margin-top:8px;font-size:11px;color:#737373">
      <span style="color:#ef4444">■</span> &gt;20% (high concentration)
      <span style="color:#f59e0b;margin-left:12px">■</span> &gt;10%
      <span style="color:#6366f1;margin-left:12px">■</span> &lt;10% (healthy)
    </div>`;
}
