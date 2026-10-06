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
import { absoluteTimestamp, freshnessOf, relativeAge } from "@/lib/utils/freshness";
import { CostBasisDialog } from "@/components/forms/cost-basis-dialog";

type HoldingRow = {
  id: string;
  ticker: string;
  name: string;
  assetClass: string;
  shares: string;
  /** Null when the institution did not report one. Not zero. */
  costBasisPerShare: string | null;
  currentPrice: string;
  currentValue: string;
  accountName: string;
  /** Where the basis came from, so the reader knows who to believe. */
  costBasisSource?: "plaid" | "manual" | "derived" | null;
  /** Null when there is no basis to measure against. */
  gainLoss: number | null;
  gainLossPct: number | null;
  /** When this price was last fetched. Null means it never was. */
  lastPriceUpdate?: Date | string | null;
};

/**
 * A stale price is the quietest way this app can be wrong: the value column
 * still adds up, the gain still has a sign, and nothing says the number came
 * from last month.
 */
function priceTone(state: ReturnType<typeof freshnessOf>): string {
  if (state === "stale") return "text-destructive";
  if (state === "aging") return "text-amber-600 dark:text-amber-500";
  return "text-muted-foreground";
}

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
              {/* The age sits under the price rather than in a column of its
                  own: it describes that number specifically, and the table is
                  already at its width on a phone. */}
              <TableCell className="text-right font-mono">
                <div>{formatCurrency(Number(holding.currentPrice))}</div>
                {holding.lastPriceUpdate !== undefined && (
                  <div
                    title={`Price as of ${absoluteTimestamp(holding.lastPriceUpdate)}`}
                    className={cn(
                      "font-sans text-[11px]",
                      priceTone(freshnessOf(holding.lastPriceUpdate, "price"))
                    )}
                  >
                    {relativeAge(holding.lastPriceUpdate)}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {formatCurrency(Number(holding.currentValue))}
              </TableCell>
              {/* An unknown basis is shown as unknown. This cell used to
                  render the whole position as profit at a stated 0%, because
                  a missing basis arrived as Number(null) === 0. */}
              {holding.gainLoss === null || holding.gainLossPct === null ? (
                <TableCell className="text-right font-mono text-muted-foreground">
                  <div>&mdash;</div>
                  {/* Actionable, not just absent. The institution did not
                      report a basis; the owner can supply one from their
                      statement and it will survive every later sync. */}
                  <CostBasisDialog
                    holdingId={holding.id}
                    ticker={holding.ticker}
                    shares={Number(holding.shares)}
                    currentValue={Number(holding.currentValue)}
                    costBasisPerShare={null}
                    source={holding.costBasisSource ?? null}
                  />
                </TableCell>
              ) : (
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
                  {holding.costBasisSource === "manual" && (
                    <div className="text-[10px] font-sans text-muted-foreground">
                      basis entered by you
                    </div>
                  )}
                  {holding.costBasisSource === "derived" && (
                    <div className="text-[10px] font-sans text-muted-foreground">
                      basis from transactions
                    </div>
                  )}
                  <CostBasisDialog
                    holdingId={holding.id}
                    ticker={holding.ticker}
                    shares={Number(holding.shares)}
                    currentValue={Number(holding.currentValue)}
                    costBasisPerShare={
                      holding.costBasisPerShare === null
                        ? null
                        : Number(holding.costBasisPerShare)
                    }
                    source={holding.costBasisSource ?? null}
                  />
                </TableCell>
              )}
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
