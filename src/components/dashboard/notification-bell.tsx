"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Alert = {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  createdAt: string;
};

function formatAlertDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const alertDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (alertDay.getTime() === today.getTime()) return "Today";
  if (alertDay.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/alerts", { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (!controller.signal.aborted) setAlerts(data);
      } catch {
        // An aborted request is the component going away, not a failure.
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const handleDismiss = async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    await fetch("/api/alerts/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const handleDismissAll = async () => {
    setAlerts([]);
    await fetch("/api/alerts/dismiss-all", { method: "POST" });
  };

  const count = alerts.length;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "relative"
        )}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {loaded && count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {count > 0 && (
            <button
              onClick={handleDismissAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss all
            </button>
          )}
        </div>

        {!loaded ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : count === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="divide-y">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex gap-2.5 px-3 py-3">
                  <div className="mt-0.5 shrink-0">
                    {alert.severity === "critical" ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : alert.severity === "warning" ? (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <Info className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{alert.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-snug break-words">
                      {alert.message}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/60">
                      {formatAlertDate(alert.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    aria-label="Dismiss notification"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
