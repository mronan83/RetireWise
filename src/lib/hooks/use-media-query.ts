"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Track a media query without breaking server rendering.
 *
 * `useSyncExternalStore` takes a separate server snapshot, so the markup React
 * produces on the server and the markup it hydrates against agree, and the
 * real value is applied on the first client render instead of throwing a
 * hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // The server has no viewport. Assuming the wide layout keeps the
    // server-rendered HTML identical to what a desktop hydrates into, and a
    // phone corrects on its first client render.
    () => false
  );
}

/**
 * True on a screen too narrow to show a control panel beside its results —
 * the point at which a form has to become a list you drill into rather than a
 * wall you scroll past. Matches Tailwind's `lg` breakpoint, which is also
 * where the app's sidebar appears.
 */
export function useIsCompact(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
