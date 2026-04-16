"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ASSET_CLASS_LABELS } from "@/lib/constants";
import { formatCurrency, formatPercent } from "@/lib/utils/format";

// Modern color palette
const MODERN_COLORS: Record<string, string> = {
  us_stock: "#6366f1",     // indigo
  intl_stock: "#22c55e",   // green
  bond: "#f59e0b",         // amber
  reit: "#a855f7",         // purple
  commodity: "#f97316",    // orange
  crypto: "#ec4899",       // pink
  cash: "#64748b",         // slate
  other: "#94a3b8",        // gray
};

type AllocationData = Record<string, { value: number; pct: number }>;

export function AllocationChart({ data }: { data: AllocationData }) {
  const chartData = Object.entries(data)
    .map(([key, val]) => ({
      name: ASSET_CLASS_LABELS[key] || key,
      value: val.value,
      pct: val.pct,
      fill: MODERN_COLORS[key] || "#94a3b8",
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asset Allocation</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[280px] items-center justify-center text-muted-foreground text-sm">
          No holdings data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Asset Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          <div className="w-full h-[200px] sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                  cornerRadius={4}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    fontSize: "13px",
                    padding: "8px 12px",
                  }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full grid grid-cols-2 gap-x-4 gap-y-1.5">
            {chartData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: entry.fill }}
                />
                <span className="truncate text-muted-foreground text-xs">
                  {entry.name}
                </span>
                <span className="ml-auto font-mono text-xs font-medium">
                  {formatPercent(entry.pct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
