"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function RefreshPricesButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  const handleRefresh = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/prices/refresh", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const diag = data.diagnostic;
        const detail = data.updated > 0
          ? `${data.updated} prices updated (${data.tickers?.length || 0} tickers)`
          : `0 updated — ${diag?.holdingsFound?.length || 0} holdings, ${diag?.fetchErrors?.length || 0} errors. ${diag?.fetchErrors?.[0]?.error || 'unknown'}`;
        if (data.updated === 0) console.log("Price refresh diagnostic:", JSON.stringify(data, null, 2));
        setResult(detail);
        if (data.updated > 0) router.refresh();
      } else {
        setResult(data.error || "Failed");
      }
    } catch {
      setResult("Failed to refresh prices");
    } finally {
      setLoading(false);
      setTimeout(() => setResult(null), 4000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        disabled={loading}
      >
        <RefreshCw
          className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
        />
        {loading ? "Updating..." : "Refresh Prices"}
      </Button>
      {result && (
        <span className="text-xs text-muted-foreground">{result}</span>
      )}
    </div>
  );
}
