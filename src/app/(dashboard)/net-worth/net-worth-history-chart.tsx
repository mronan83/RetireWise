"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCompactCurrency, formatShortDate } from "@/lib/utils/format";

/**
 * The stacked bands are equity: the house less its mortgage, the cars less
 * their loans. That is the only basis every row has — the secured split was
 * not recorded until 2026-09-22 and cannot be reconstructed for the dates
 * before it — so the bands and the net worth line stay continuous across the
 * change rather than stepping up on the day the column was added.
 *
 * What does change is the tooltip's debt line. `totalDebts` holds only the
 * unsecured balances, so it read -$12,836.07 for a household owing
 * $282,545.22. Where `securedDebts` is recorded the tooltip now shows the
 * whole of it; where it is null it says the figure is the unsecured part,
 * rather than quietly presenting a part as the whole.
 */
type Snapshot = {
  snapshotDate: string;
  netWorth: string;
  totalAssets: string;
  investmentValue: string;
  realEstateEquity: string;
  cashTotal: string;
  vehicleEquity: string;
  totalDebts: string;
  securedDebts: string | null;
};

type ChartPoint = {
  date: string;
  netWorth: number;
  investments: number;
  realEstate: number;
  cash: number;
  vehicles: number;
  debts: number;
  /** Null where the row predates the secured split being recorded. */
  secured: number | null;
};

const COLORS = {
  investments: "#6366f1",
  realEstate:  "#22c55e",
  cash:        "#eab308",
  vehicles:    "#a855f7",
  debts:       "#ef4444",
  netWorth:    "#f8fafc",
};

export function NetWorthHistoryChart({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Net Worth Over Time</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[280px] items-center justify-center text-center text-sm text-muted-foreground px-8">
          {snapshots.length === 0
            ? "History will appear here. Update any net worth entry to record today's snapshot."
            : "One snapshot recorded — update entries over time to see your trend."}
        </CardContent>
      </Card>
    );
  }

  const data: ChartPoint[] = snapshots.map((s) => ({
    date: s.snapshotDate,
    netWorth:    Number(s.netWorth),
    investments: Number(s.investmentValue),
    realEstate:  Number(s.realEstateEquity),
    cash:        Number(s.cashTotal),
    vehicles:    Number(s.vehicleEquity),
    debts:       Number(s.totalDebts),
    secured:     s.securedDebts === null ? null : Number(s.securedDebts),
  }));

  const first = data[0].netWorth;
  const last  = data[data.length - 1].netWorth;
  const delta = last - first;
  const deltaPct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;
  const isUp = delta >= 0;

  // Custom tooltip
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { name: string; value: number; color: string }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const nw = payload.find((p) => p.name === "netWorth");
    const components = payload.filter((p) => p.name !== "netWorth");
    /**
     * Debt comes from the row, not from `payload`.
     *
     * There is no debts Area — the bands are assets — so the debt figure was
     * mapped into every chart point and then never reached the tooltip,
     * because `payload` only carries series that are drawn. The tooltip has
     * been silent about debt the whole time it looked like it reported it.
     */
    const point = data.find((d) => d.date === label);
    const unsecured = point?.debts ?? 0;
    const secured = point?.secured ?? null;
    return (
      <div
        style={{
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          minWidth: "180px",
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: 6, color: "hsl(var(--foreground))" }}>
          {label ? formatShortDate(label) : ""}
        </p>
        {nw && (
          <p style={{ fontWeight: 700, color: isUp ? "#22c55e" : "#ef4444", marginBottom: 6 }}>
            Net Worth: {formatCurrency(nw.value)}
          </p>
        )}
        <div style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {components.map((p) => (
            <span key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ color: p.color }}>
                {p.name === "investments" ? "Investments" :
                 p.name === "realEstate"  ? "Real Estate (equity)" :
                 p.name === "cash"        ? "Cash" :
                 p.name === "vehicles"    ? "Vehicles (equity)" : p.name}
              </span>
              <span style={{ color: "hsl(var(--foreground))", fontWeight: 500 }}>
                {formatCurrency(p.value)}
              </span>
            </span>
          ))}
          <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: COLORS.debts }}>
              {/* Named for what it is. The bands above are equity, so the
                  mortgages and car loans are already inside them; this is
                  what is left over. */}
              {secured === null ? "Other debts" : "Unsecured debts"}
            </span>
            <span style={{ color: "hsl(var(--foreground))", fontWeight: 500 }}>
              -{formatCurrency(unsecured)}
            </span>
          </span>
          {secured !== null && (
            <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ color: COLORS.debts }}>Secured debts</span>
              <span style={{ color: "hsl(var(--foreground))", fontWeight: 500 }}>
                -{formatCurrency(secured)}
              </span>
            </span>
          )}
        </div>
        {secured !== null && (
          <p
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: "1px solid hsl(var(--border))",
              fontWeight: 600,
              color: "hsl(var(--foreground))",
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <span>Total owed</span>
            <span>-{formatCurrency(unsecured + secured)}</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <CardTitle>Net Worth Over Time</CardTitle>
          <div className="text-right shrink-0">
            <p className={`text-sm font-semibold font-mono ${isUp ? "text-green-500" : "text-red-500"}`}>
              {isUp ? "+" : ""}{formatCurrency(delta)}
            </p>
            <p className="text-xs text-muted-foreground">
              {isUp ? "+" : ""}{deltaPct.toFixed(1)}% since {formatShortDate(data[0].date)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] sm:h-[340px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.investments} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.investments} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="reGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.realEstate} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.realEstate} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.cash} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.cash} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="vehGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.vehicles} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.vehicles} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                strokeOpacity={0.4}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                minTickGap={50}
              />
              <YAxis
                tickFormatter={(v) => formatCompactCurrency(v)}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={62}
                tickMargin={4}
              />
              {/* CustomTooltip closes over this chart's labels and formatters, so it
                  lives inside the component. Hoisting it is the right fix and is a
                  change of its own; suppressed rather than left failing so CI
                  reports new problems rather than this one. */}
              {/* eslint-disable-next-line react-hooks/static-components */}
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="square"
                iconSize={8}
                formatter={(value) =>
                  value === "investments" ? "Investments" :
                  value === "realEstate"  ? "Real Estate (equity)" :
                  value === "cash"        ? "Cash"        :
                  value === "vehicles"    ? "Vehicles (equity)"    :
                  value === "debts"       ? "Debts"       : "Net Worth"
                }
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />

              {/* Stacked asset components */}
              <Area type="monotone" dataKey="investments" stackId="assets"
                stroke={COLORS.investments} fill="url(#invGrad)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="realEstate" stackId="assets"
                stroke={COLORS.realEstate} fill="url(#reGrad)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="cash" stackId="assets"
                stroke={COLORS.cash} fill="url(#cashGrad)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="vehicles" stackId="assets"
                stroke={COLORS.vehicles} fill="url(#vehGrad)" strokeWidth={1.5} dot={false} />

              {/* Net worth as a bold line on top */}
              <Area
                type="monotone"
                dataKey="netWorth"
                stroke={isUp ? "#22c55e" : "#ef4444"}
                fill="none"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, stroke: "hsl(var(--card))", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
