"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ASSET_CLASS_LABELS, ASSET_CLASS_COLORS } from "@/lib/constants";
import { formatCurrency, formatPercent } from "@/lib/utils/format";

type AllocationData = Record<string, { value: number; pct: number }>;

export function AllocationChart({ data }: { data: AllocationData }) {
  const chartData = Object.entries(data)
    .map(([key, val]) => ({
      name: ASSET_CLASS_LABELS[key] || key,
      value: val.value,
      pct: val.pct,
      fill: ASSET_CLASS_COLORS[key] || "hsl(0, 0%, 50%)",
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asset Allocation</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-muted-foreground">
          No holdings data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asset Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-[250px] w-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
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
                    borderRadius: "var(--radius)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2">
            {chartData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-3 text-sm">
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.fill }}
                />
                <span className="min-w-[120px] text-muted-foreground">
                  {entry.name}
                </span>
                <span className="font-mono font-medium">
                  {formatPercent(entry.pct)}
                </span>
                <span className="font-mono text-muted-foreground">
                  {formatCurrency(entry.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
