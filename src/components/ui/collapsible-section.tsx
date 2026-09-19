"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useIsCompact } from "@/lib/hooks/use-media-query";

/**
 * A page section that is open on a wide screen and collapsed on a phone.
 *
 * Six full sections stacked is roughly eight screens of scrolling to reach the
 * last one, and every visit pays that cost even when you came to change one
 * thing. Collapsed, the page opens as a short index: section names, a line of
 * summary each, and the one you want a tap away.
 *
 * Desktop keeps everything visible, because there the whole page is a glance
 * rather than a journey.
 */
export function CollapsibleSection({
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  title: string;
  /** A line describing the section's current state, shown when collapsed. */
  summary?: React.ReactNode;
  children: React.ReactNode;
  /** Open this one on a phone too — for the section people came for. */
  defaultOpen?: boolean;
}) {
  const compact = useIsCompact();
  const [open, setOpen] = useState(defaultOpen);

  if (!compact) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden py-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        // 56px of header: the whole row is the target, not just the chevron.
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-accent/50"
      >
        <span className="min-w-0">
          <span className="block font-heading text-base font-medium">
            {title}
          </span>
          {summary && !open && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {summary}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && <div className="border-t px-4 py-4">{children}</div>}
    </Card>
  );
}
