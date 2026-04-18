"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ASSET_CLASS_LABELS } from "@/lib/constants";
import {
  formatCurrency,
  formatGainLoss,
  formatGainLossPct,
  formatNumber,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";

type HoldingRow = {
  id: string;
  ticker: string;
  name: string;
  assetClass: string;
  shares: string;
  costBasisPerShare: string;
  currentPrice: string;
  currentValue: string;
  accountName: string;
  gainLoss: number;
  gainLossPct: number;
};

export function HoldingsTable({ holdings }: { holdings: HoldingRow[] }) {
  if (holdings.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border text-muted-foreground">
        No holdings yet. Add accounts and holdings to get started.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticker</TableHead>
            <TableHead className="hidden sm:table-cell">Name</TableHead>
            <TableHead className="hidden md:table-cell">Class</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">Gain/Loss</TableHead>
            <TableHead className="hidden lg:table-cell">Account</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdings.map((holding) => (
            <TableRow key={holding.id}>
              <TableCell className="font-mono font-medium">
                {holding.ticker}
              </TableCell>
              <TableCell className="hidden max-w-[200px] truncate sm:table-cell">
                {holding.name}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="secondary" className="text-xs">
                  {ASSET_CLASS_LABELS[holding.assetClass] || holding.assetClass}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatNumber(Number(holding.shares), 4)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(Number(holding.currentPrice))}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {formatCurrency(Number(holding.currentValue))}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono",
                  holding.gainLoss >= 0 ? "text-green-500" : "text-red-500"
                )}
              >
                <div>{formatGainLoss(holding.gainLoss)}</div>
                <div className="text-xs">
                  {formatGainLossPct(holding.gainLossPct)}
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell text-muted-foreground">
                {holding.accountName}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
