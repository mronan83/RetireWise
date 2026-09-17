"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { formatCurrency, formatCompactCurrency, formatShortDate } from "@/lib/utils/format";

export type HistoryPoint = {
  recordedDate: string;
  value: string;
  secondaryValue: string | null;
};

type Props = {
  itemName: string;
  itemType: "real_estate" | "cash_reserve" | "vehicle" | "debt";
  history: HistoryPoint[];
};

const TYPE_LABEL: Record<Props["itemType"], { primary: string; secondary?: string }> = {
  real_estate: { primary: "Equity", secondary: "Market Value" },
  cash_reserve: { primary: "Balance" },
  vehicle: { primary: "Equity", secondary: "Market Value" },
  debt: { primary: "Balance" },
};

export function ItemHistoryChart({ itemName, itemType, history }: Props) {
  if (history.length < 2) return null;

  const labels = TYPE_LABEL[itemType];
  const data = history.map((h) => ({
    date: h.recordedDate,
    value: Number(h.value),
    secondaryValue: h.secondaryValue !== null ? Number(h.secondaryValue) : undefined,
  }));

  const first = data[0].value;
  const last = data[data.length - 1].value;
  const delta = last - first;
  const isUp = delta >= 0;
  const isDebt = itemType === "debt";
  // For debt: going down is good (green), going up is bad (red)
  const positiveColor = isDebt ? "#ef4444" : "#22c55e";
  const negativeColor = isDebt ? "#22c55e" : "#ef4444";
  const lineColor = delta >= 0 ? positiveColor : negativeColor;

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { name: string; value: number }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        style={{
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "6px",
          padding: "8px 12px",
          fontSize: "11px",
          minWidth: "150px",
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: 4, color: "hsl(var(--foreground))" }}>
          {label ? formatShortDate(label) : ""}
        </p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: "hsl(var(--foreground))" }}>
            {p.name === "value" ? labels.primary : labels.secondary}:{" "}
            <span style={{ fontWeight: 600 }}>{formatCurrency(p.value)}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="pt-3 pb-1">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>{itemName}</span>
        </div>
        <span className={`text-xs font-semibold font-mono ${delta >= 0 ? (isDebt ? "text-red-500" : "text-green-500") : (isDebt ? "text-green-500" : "text-red-500")}`}>
          {delta >= 0 ? "+" : ""}{formatCurrency(delta)}
        </span>
      </div>
      <div className="h-[120px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.4}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickMargin={6}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v) => formatCompactCurrency(v)}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickMargin={4}
            />
            <Tooltip content={<CustomTooltip />} />
            {labels.secondary && (
              <Line
                type="monotone"
                dataKey="secondaryValue"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="4 2"
                dot={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-1">
        {data.length} data points · since {formatShortDate(data[0].date)}
      </p>
    </div>
  );
}
