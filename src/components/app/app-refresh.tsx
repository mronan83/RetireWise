"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pullState } from "@/lib/utils/pull-to-refresh";

/**
 * Refreshing the app: the page's data is read again from the server, and
 * anything that loads its own data (the alert bell) is told to reload too.
 *
 * It does not fetch new market prices; Refresh Prices on the dashboard does
 * that. It shows what is already stored, as it is now.
 */
export const APP_REFRESH_EVENT = "retirewise:refresh";

export function useAppRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
    window.dispatchEvent(new Event(APP_REFRESH_EVENT));
  }, [router]);
  return { refresh, pending };
}

/** The refresh button in the header. */
export function RefreshButton() {
  const { refresh, pending } = useAppRefresh();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={refresh}
      disabled={pending}
      aria-busy={pending}
      data-testid="app-refresh"
    >
      <RotateCw className={cn("h-5 w-5", pending && "animate-spin")} />
      <span className="sr-only">Refresh the page</span>
    </Button>
  );
}

/**
 * Pull down from the top of the page and let go to refresh.
 *
 * Touch only. A pull starts only with the page scrolled to the top and
 * never inside a dialog, sheet or anything marked `data-no-pull`, so it
 * cannot fire while someone is scrolling a list or filling in a form.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { refresh, pending } = useAppRefresh();
  const [distance, setDistance] = useState(0);
  const startY = useRef<number | null>(null);
  const travelled = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      if (window.scrollY > 0 || e.touches.length !== 1) return;
      if (target?.closest?.('[role="dialog"], [data-slot="sheet-content"], [data-no-pull]')) return;
      startY.current = e.touches[0].clientY;
      travelled.current = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const d = e.touches[0].clientY - startY.current;
      if (d < -8 || window.scrollY > 0) {
        // Scrolling up, or the page moved: this is not a pull.
        startY.current = null;
        travelled.current = 0;
        setDistance(0);
        return;
      }
      // A finger wobbles a few pixels before it commits to a direction.
      if (d <= 0) return;
      travelled.current = d;
      setDistance(d);
      // Hold the page still while pulling, instead of the browser's bounce.
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if (startY.current === null) return;
      const ready = pullState(travelled.current).ready;
      startY.current = null;
      travelled.current = 0;
      setDistance(0);
      if (ready) refresh();
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refresh]);

  const { offset, progress, ready } = pullState(distance);
  const visible = distance > 0 || pending;

  return (
    <>
      <div
        aria-hidden={!visible}
        data-testid="pull-indicator"
        data-ready={ready}
        className={cn(
          "pointer-events-none fixed left-1/2 top-16 z-40 -translate-x-1/2 rounded-full border bg-background p-2 shadow-md transition-opacity",
          visible ? "opacity-100" : "opacity-0"
        )}
        style={{ transform: `translate(-50%, ${pending ? 24 : offset - 24}px)` }}
      >
        <RotateCw
          className={cn("h-5 w-5", ready || pending ? "text-primary" : "text-muted-foreground", pending && "animate-spin")}
          style={pending ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </div>
      {pending && <span className="sr-only" role="status">Refreshing</span>}
      {children}
    </>
  );
}
