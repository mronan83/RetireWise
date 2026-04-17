import Link from "next/link";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ACCOUNT_TYPE_LABELS,
  TAX_TREATMENT_LABELS,
  ACCOUNT_OWNER_LABELS,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/format";
import type { Account } from "@/lib/types";

type Props = {
  account: Account;
  totalValue: number;
};

export function AccountCard({ account, totalValue }: Props) {
  return (
    <Link href={`/accounts/${account.id}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {account.name}
          </CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-xl font-bold font-mono">
            {formatCurrency(totalValue)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              variant={account.owner === "spouse" ? "default" : "secondary"}
              className="text-xs"
            >
              {ACCOUNT_OWNER_LABELS[account.owner] || account.owner}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {ACCOUNT_TYPE_LABELS[account.accountType] || account.accountType}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {TAX_TREATMENT_LABELS[account.taxTreatment] ||
                account.taxTreatment}
            </Badge>
            {!account.isActivelyContributing && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                No contributions
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {account.institution}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
