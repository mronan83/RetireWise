"use client";

import { AlertTriangle, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Alert = {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  createdAt: Date;
};

export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;

  const handleDismiss = async (id: string) => {
    await fetch("/api/alerts/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    window.location.reload();
  };

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            "flex items-start gap-3 rounded-md border p-2.5 text-sm",
            alert.severity === "critical"
              ? "border-red-500/30 bg-red-500/5"
              : alert.severity === "warning"
                ? "border-yellow-500/30 bg-yellow-500/5"
                : "border-blue-500/30 bg-blue-500/5"
          )}
        >
          {alert.severity === "critical" ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          ) : alert.severity === "warning" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{alert.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 break-words">
              {alert.message}
            </p>
          </div>
          <button
            onClick={() => handleDismiss(alert.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
