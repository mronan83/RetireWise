"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsCompact } from "@/lib/hooks/use-media-query";

/**
 * One setting: inline on a wide screen, a row you tap on a narrow one.
 *
 * A control panel with ten settings is roughly sixty lines of label, slider,
 * end captions and helper text. Beside a chart that is a panel; stacked on a
 * phone it is a wall the reader has to scroll past every single visit, and
 * shrinking the type to make it fit only makes it a smaller wall.
 *
 * On a phone each setting collapses to its name and current value. Tapping
 * one opens it alone, at full size, in a sheet — the pattern every phone
 * settings screen uses, and the reason those screens work at this width.
 * The control itself is unchanged; only where it lives moves.
 */
export function ControlRow({
  label,
  value,
  children,
  hint,
  live,
}: {
  label: string;
  /** What the setting currently says, shown on the collapsed row. */
  value: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
  /**
   * The result this setting moves, shown inside the sheet while it is open.
   * Without it the sheet covers the page and the reader is adjusting a number
   * with no way to see what it does — which is the whole reason to adjust it.
   */
  live?: React.ReactNode;
}) {
  const compact = useIsCompact();
  const [open, setOpen] = useState(false);

  if (!compact) return <div className="space-y-2">{children}</div>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // 48px min height: a row that is merely visible is not the same as a
        // row that can be hit with a thumb.
        className="-mx-1 flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left transition-colors active:bg-accent/50"
      >
        <span className="shrink-0 text-sm font-medium">{label}</span>
        <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
          <span className="truncate font-mono">{value}</span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader className="pb-0">
            <SheetTitle>{label}</SheetTitle>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            {live && (
              <div className="mt-2 rounded-lg border bg-muted/40 px-3 py-2">
                {live}
              </div>
            )}
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The list the rows sit in, with separators only in the collapsed form. */
export function ControlList({ children }: { children: React.ReactNode }) {
  const compact = useIsCompact();
  return (
    <div className={compact ? "divide-y" : "space-y-6"}>{children}</div>
  );
}
