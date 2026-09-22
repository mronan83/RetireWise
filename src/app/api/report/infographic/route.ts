import { getApiUserId, withApiHousehold } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { generateText } from "ai";
import { getDb } from "@/lib/db";
import {
  userPreferences,
  socialSecurityBenefits,
  realEstate,
  cashReserves,
  debts,
} from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getAccounts } from "@/lib/queries/accounts";
import { getSnapshots } from "@/lib/queries/snapshots";
import { loadNetWorth } from "@/lib/net-worth/load";
import {
  calculatePortfolioSummary,
  calculateGainLoss,
} from "@/lib/utils/calculations";
import { NO_BASIS, orNoBasis } from "@/lib/utils/cost-basis";
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

export async function GET() {
  return withApiHousehold(() => handleGet());
}

async function handleGet() {
  const userId = await getApiUserId();
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const [
    holdings,
    accountsList,
    prefs,
    selfSS,
    spouseSS,
    snapshots,
    properties,
    cashAccounts,
    debtsList,
  ] = await Promise.all([
    getHoldingsByClerkId(userId),
    getAccounts(userId),
    db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.clerkId, userId))
      .limit(1),
    db
      .select()
      .from(socialSecurityBenefits)
      .where(
        and(
          eq(socialSecurityBenefits.clerkId, userId),
          eq(socialSecurityBenefits.owner, "self")
        )
      )
      .limit(1),
    db
      .select()
      .from(socialSecurityBenefits)
      .where(
        and(
          eq(socialSecurityBenefits.clerkId, userId),
          eq(socialSecurityBenefits.owner, "spouse")
        )
      )
      .limit(1),
    getSnapshots(userId, 90),
    db.select().from(realEstate).where(eq(realEstate.clerkId, userId)),
    db.select().from(cashReserves).where(eq(cashReserves.clerkId, userId)),
    db.select().from(debts).where(eq(debts.clerkId, userId)),
  ]);

  const summary = calculatePortfolioSummary(holdings);
  const pref = prefs[0];
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Net worth, composed once — see src/lib/net-worth/compose.ts. This block
  // summed it in its own words, and differently again: it left vehicles out
  // of the total entirely while the dashboard and the net worth page included
  // them. Three copies, three answers.
  const composed = await loadNetWorth(userId);
  // Gross assets against every liability, the same basis as the screens. The
  // breakdown printed real estate EQUITY beside a debt figure that excluded
  // the mortgage netted out of it, and left vehicles out altogether — so the
  // four lines did not add up to the total above them.
  const investmentTotal = composed.investments;
  const realEstateValue = composed.assets
    .filter((a) => a.kind === "real_estate")
    .reduce((s, a) => s + a.value, 0);
  const vehicleValue = composed.assets
    .filter((a) => a.kind === "vehicle")
    .reduce((s, a) => s + a.value, 0);
  const cashTotal = composed.cash;
  const debtTotal = composed.liabilities;
  const netWorth = composed.netWorth;

  // Owner breakdown
  let selfVal = 0,
    spouseVal = 0;
  for (const h of holdings) {
    if (h.accountOwner === "spouse") spouseVal += Number(h.currentValue);
    else selfVal += Number(h.currentValue);
  }

  // Top holdings sorted by value
  const sortedHoldings = [...holdings]
    .sort((a, b) => Number(b.currentValue) - Number(a.currentValue))
    .slice(0, 15);

  // Allocation data for donut chart
  const allocEntries = Object.entries(summary.allocation)
    .sort((a, b) => b[1].pct - a[1].pct)
    .filter(([, d]) => d.pct > 0);

  // Snapshot performance sparkline
  const sparkData = snapshots
    .map((s) => Number(s.totalValue))
    .reverse();

  // Recent performance
  const latestSnapshot = snapshots[0];
  const dailyChange = latestSnapshot
    ? Number(latestSnapshot.dailyChange || 0)
    : 0;

  // Retirement info
  const yearsToRetirement = pref?.retirementAge && pref?.currentAge
    ? Math.max(0, pref.retirementAge - pref.currentAge)
    : null;

  // AI insights on the household's own API key.
  //
  // This call site used to pass `undefined` for the key, so it silently ran on
  // the server's ANTHROPIC_API_KEY while the other two AI routes used the
  // household's. Routing every entry point through resolveUserModel is what
  // stops that from recurring.
  let aiInsights = "";
  try {
    const { model } = await resolveUserModel(userId);
    const holdingSummary = sortedHoldings
      .map(
        (h) =>
          `${h.ticker}: ${formatCurrency(Number(h.currentValue))} (${formatPercent(
            (Number(h.currentValue) / summary.totalValue) * 100
          )} of portfolio)`
      )
      .join("\n");

    const allocSummary = allocEntries
      .map(
        ([cls, d]) =>
          `${ASSET_CLASS_LABELS[cls] || cls}: ${formatPercent(d.pct)}`
      )
      .join(", ");

    const { text } = await generateText({
      model,
      prompt: `You are a concise financial analyst writing for a portfolio report infographic. Given this household portfolio data, provide 4-5 short actionable insights. Each insight should be 1-2 sentences max. Use plain language, no jargon. Format as bullet points.

Portfolio: ${formatCurrency(summary.totalValue)} | Gain/Loss: ${summary.totalGainLoss === null ? NO_BASIS : `${formatCurrency(summary.totalGainLoss)} (${formatPercent(summary.totalGainLossPct!)})`}
Net Worth: ${formatCurrency(netWorth)}
Allocation: ${allocSummary}
Top Holdings:
${holdingSummary}
${yearsToRetirement !== null ? `Years to retirement: ${yearsToRetirement}` : ""}
${selfSS[0] ? `Self SS at FRA: $${selfSS[0].benefitAtFRA}/mo` : ""}
${spouseSS[0] ? `Spouse SS at FRA: $${spouseSS[0].benefitAtFRA}/mo` : ""}

Focus on: concentration risk, allocation balance, actionable improvements, and anything notable. Be specific about tickers and numbers.`,
    });
    aiInsights = text;
  } catch (e) {
    aiInsights =
      e instanceof MissingApiKeyError
        ? "AI insights need your own API key. Add one in Settings \u2192 AI provider."
        : "AI insights unavailable \u2014 check your AI provider configuration in Settings.";
  }

  // Build SVG donut chart
  const donutSize = 200;
  const donutRadius = 80;
  const donutInner = 50;
  let donutOffset = 0;
  const donutSlices = allocEntries.map(([cls, data], i) => {
    const angle = (data.pct / 100) * 360;
    const startAngle = donutOffset;
    donutOffset += angle;
    const endAngle = donutOffset;
    const largeArc = angle > 180 ? 1 : 0;
    const sr = (startAngle * Math.PI) / 180;
    const er = (endAngle * Math.PI) / 180;
    const x1 = 100 + donutRadius * Math.sin(sr);
    const y1 = 100 - donutRadius * Math.cos(sr);
    const x2 = 100 + donutRadius * Math.sin(er);
    const y2 = 100 - donutRadius * Math.cos(er);
    const ix1 = 100 + donutInner * Math.sin(er);
    const iy1 = 100 - donutInner * Math.cos(er);
    const ix2 = 100 + donutInner * Math.sin(sr);
    const iy2 = 100 - donutInner * Math.cos(sr);
    return {
      path: `M ${x1} ${y1} A ${donutRadius} ${donutRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${donutInner} ${donutInner} 0 ${largeArc} 0 ${ix2} ${iy2} Z`,
      color: COLORS[i % COLORS.length],
      label: ASSET_CLASS_LABELS[cls] || cls,
      pct: data.pct,
      value: data.value,
    };
  });

  // Build sparkline SVG
  let sparkSvg = "";
  if (sparkData.length > 1) {
    const sparkW = 400;
    const sparkH = 80;
    const min = Math.min(...sparkData) * 0.995;
    const max = Math.max(...sparkData) * 1.005;
    const range = max - min || 1;
    const points = sparkData
      .map((v, i) => {
        const x = (i / (sparkData.length - 1)) * sparkW;
        const y = sparkH - ((v - min) / range) * sparkH;
        return `${x},${y}`;
      })
      .join(" ");
    sparkSvg = `<svg viewBox="0 0 ${sparkW} ${sparkH}" style="width:100%;height:80px;">
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#22c55e" stop-opacity="0.3"/><stop offset="100%" stop-color="#22c55e" stop-opacity="0"/></linearGradient></defs>
      <polygon points="0,${sparkH} ${points} ${sparkW},${sparkH}" fill="url(#sg)" />
      <polyline points="${points}" fill="none" stroke="#22c55e" stroke-width="2" />
    </svg>`;
  }

  // Format AI insights as HTML list
  const insightItems = aiInsights
    .split("\n")
    .filter((l) => l.trim().startsWith("-") || l.trim().startsWith("•") || l.trim().startsWith("*"))
    .map((l) => l.replace(/^[\s\-•*]+/, "").trim())
    .filter(Boolean);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RetireWise Portfolio Report — ${new Date().toISOString().split("T")[0]}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 0; }
  .page { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
  .header { text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #262626; }
  .header h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; color: #fff; }
  .header .date { color: #737373; font-size: 14px; margin-top: 4px; }
  .header .subtitle { color: #a3a3a3; font-size: 13px; margin-top: 2px; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #737373; margin-bottom: 12px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .stat-card { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 16px; }
  .stat-label { font-size: 11px; color: #737373; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-value { font-size: 24px; font-weight: 700; font-family: 'SF Mono', 'Fira Code', monospace; margin-top: 4px; }
  .stat-sub { font-size: 12px; color: #737373; margin-top: 2px; }
  .green { color: #22c55e; }
  .red { color: #ef4444; }
  .amber { color: #f59e0b; }
  .white { color: #fff; }
  .nw-breakdown { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
  .nw-item { font-size: 12px; color: #a3a3a3; }
  .nw-item span { font-family: 'SF Mono', monospace; }
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
  .insights-box li { padding: 8px 0; border-bottom: 1px solid #1a1a1a; font-size: 14px; line-height: 1.5; color: #d4d4d4; }
  .insights-box li:last-child { border-bottom: none; }
  .insights-box li::before { content: '→'; color: #6366f1; margin-right: 8px; font-weight: 600; }
  .footer { text-align: center; padding-top: 24px; border-top: 1px solid #262626; margin-top: 32px; font-size: 11px; color: #525252; }
  .badge { display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
  .badge-green { background: #22c55e20; color: #22c55e; }
  .badge-red { background: #ef444420; color: #ef4444; }
  @media (max-width: 600px) {
    .chart-row { grid-template-columns: 1fr; }
    .stat-grid { grid-template-columns: 1fr 1fr; }
    .stat-value { font-size: 18px; }
  }
  @media print {
    body { background: #fff; color: #111; }
    .stat-card, .sparkline-box, .insights-box { border-color: #ddd; background: #f9f9f9; }
    .green { color: #16a34a; } .red { color: #dc2626; }
    .section-title { color: #555; }
    th { color: #555; } td { border-color: #eee; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>RetireWise Portfolio Report</h1>
    <div class="date">${today}</div>
    ${pref ? `<div class="subtitle">${pref.firstName || ""}${pref.spouseName ? ` & ${pref.spouseName}` : ""} Household</div>` : ""}
  </div>

  <!-- Net Worth -->
  <div class="section">
    <div class="section-title">Household Net Worth</div>
    <div class="stat-card">
      <div class="stat-value ${netWorth >= 0 ? "green" : "red"}">${formatCurrency(netWorth)}</div>
      <div class="nw-breakdown">
        <div class="nw-item">📈 Investments <span>${formatCurrency(investmentTotal)}</span></div>
        <div class="nw-item">🏠 Real Estate <span>${formatCurrency(realEstateValue)}</span></div>
        <div class="nw-item">💰 Cash <span>${formatCurrency(cashTotal)}</span></div>
        ${vehicleValue > 0 ? `<div class="nw-item">🚗 Vehicles <span>${formatCurrency(vehicleValue)}</span></div>` : ""}
        <div class="nw-item">💳 Debt <span class="red">-${formatCurrency(debtTotal)}</span></div>
      </div>
    </div>
  </div>

  <!-- Portfolio Stats -->
  <div class="section">
    <div class="section-title">Portfolio Overview</div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Total Portfolio</div>
        <div class="stat-value white">${formatCurrency(summary.totalValue)}</div>
        <div class="stat-sub">${pref?.firstName || "Self"}: ${formatCurrency(selfVal)}${spouseVal > 0 ? ` · ${pref?.spouseName || "Spouse"}: ${formatCurrency(spouseVal)}` : ""}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Gain/Loss</div>
        <div class="stat-value ${summary.totalGainLoss === null ? "" : summary.totalGainLoss >= 0 ? "green" : "red"}">${orNoBasis(summary.totalGainLoss, formatCurrency)}</div>
        <div class="stat-sub">${orNoBasis(summary.totalGainLossPct, formatPercent)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Daily Change</div>
        <div class="stat-value ${dailyChange >= 0 ? "green" : "red"}">${dailyChange >= 0 ? "+" : ""}${formatCurrency(dailyChange)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Accounts</div>
        <div class="stat-value white">${accountsList.length}</div>
        <div class="stat-sub">${holdings.length} positions</div>
      </div>
      ${yearsToRetirement !== null ? `<div class="stat-card">
        <div class="stat-label">Retirement</div>
        <div class="stat-value amber">${yearsToRetirement} years</div>
        <div class="stat-sub">Age ${pref?.retirementAge || "?"} target</div>
      </div>` : ""}
    </div>
  </div>

  <!-- Performance Sparkline -->
  ${sparkSvg ? `<div class="section">
    <div class="section-title">Portfolio Performance (90 days)</div>
    <div class="sparkline-box">
      <div class="sparkline-label">
        <span style="font-size:12px;color:#737373">${sparkData.length} snapshots</span>
        <span style="font-size:12px;color:#737373">${formatCurrency(sparkData[sparkData.length - 1] || 0)} current</span>
      </div>
      ${sparkSvg}
    </div>
  </div>` : ""}

  <!-- Allocation Donut -->
  <div class="section">
    <div class="section-title">Asset Allocation</div>
    <div class="chart-row">
      <svg viewBox="0 0 ${donutSize} ${donutSize}" style="width:200px;height:200px;">
        ${donutSlices.map((s) => `<path d="${s.path}" fill="${s.color}" />`).join("\n        ")}
        <text x="100" y="95" text-anchor="middle" fill="#fff" font-size="16" font-weight="700" font-family="monospace">${formatCurrency(summary.totalValue)}</text>
        <text x="100" y="112" text-anchor="middle" fill="#737373" font-size="10">total</text>
      </svg>
      <div class="donut-legend">
        ${donutSlices.map((s) => `<div class="legend-item"><div class="legend-dot" style="background:${s.color}"></div><span>${s.label}</span><span class="legend-pct">${s.pct.toFixed(1)}%</span><span class="legend-val">${formatCurrency(s.value)}</span></div>`).join("\n        ")}
      </div>
    </div>
  </div>

  <!-- Top Holdings -->
  <div class="section">
    <div class="section-title">Top Holdings</div>
    <div style="border:1px solid #262626;border-radius:12px;overflow:hidden;">
      <table>
        <thead>
          <tr><th>Ticker</th><th>Name</th><th class="right">Value</th><th class="right">Weight</th><th class="right">Gain/Loss</th></tr>
        </thead>
        <tbody>
          ${sortedHoldings.map((h) => {
            const gl = calculateGainLoss(h);
            const weight = summary.totalValue > 0 ? (Number(h.currentValue) / summary.totalValue) * 100 : 0;
            return `<tr>
              <td class="ticker">${h.ticker}</td>
              <td style="color:#a3a3a3;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.name}</td>
              <td class="right mono">${formatCurrency(Number(h.currentValue))}</td>
              <td class="right mono" style="color:#737373">${weight.toFixed(1)}%</td>
              <td class="right mono ${gl === null ? "" : gl.gainLoss >= 0 ? "green" : "red"}">${gl === null ? NO_BASIS : `${formatCurrency(gl.gainLoss)} <span class="badge ${gl.gainLoss >= 0 ? "badge-green" : "badge-red"}">${formatPercent(gl.gainLossPct)}</span>`}</td>
            </tr>`;
          }).join("\n          ")}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Accounts -->
  <div class="section">
    <div class="section-title">Accounts</div>
    <div style="border:1px solid #262626;border-radius:12px;overflow:hidden;">
      <table>
        <thead>
          <tr><th>Account</th><th>Type</th><th>Owner</th><th class="right">Value</th></tr>
        </thead>
        <tbody>
          ${accountsList.map((a) => {
            const acctVal = holdings.filter((h) => h.accountId === a.id).reduce((s, h) => s + Number(h.currentValue), 0);
            return `<tr>
              <td style="font-weight:500">${a.name}</td>
              <td style="color:#737373">${ACCOUNT_TYPE_LABELS[a.accountType] || a.accountType}</td>
              <td style="color:#737373">${ACCOUNT_OWNER_LABELS[a.owner]}</td>
              <td class="right mono">${formatCurrency(acctVal)}</td>
            </tr>`;
          }).join("\n          ")}
        </tbody>
      </table>
    </div>
  </div>

  <!-- AI Insights -->
  <div class="section">
    <div class="section-title">AI Insights</div>
    <div class="insights-box">
      ${insightItems.length > 0
        ? `<ul>${insightItems.map((item) => `<li>${item}</li>`).join("")}</ul>`
        : `<p style="color:#737373;font-size:14px">${aiInsights}</p>`}
    </div>
  </div>

  <div class="footer">
    <p>Generated by RetireWise · ${today}</p>
    <p style="margin-top:4px">For informational purposes only. Not financial advice. Past performance does not guarantee future results.</p>
  </div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
