import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import type { OnboardingState } from "@/lib/onboarding";

/**
 * Shown while the projection is missing an input it needs.
 *
 * The dashboard renders a complete-looking set of figures whether or not the
 * data behind them exists — a portfolio with no contributions recorded still
 * projects, it just projects someone who never saves again. This says which
 * input is missing, rather than leaving the reader to notice that the number
 * is wrong.
 */
export function SetupBanner({ state }: { state: OnboardingState }) {
  if (state.projectionTrustworthy) return null;

  const missing = state.steps.filter((s) => s.required && !s.done);
  if (missing.length === 0) return null;

  return (
    <Link
      href="/onboarding"
      className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm transition-colors hover:bg-amber-500/10"
    >
      <ListChecks className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          {missing.length} thing{missing.length === 1 ? "" : "s"} still needed
        </span>{" "}
        <span className="text-muted-foreground">
          before these figures mean much — {missing.map((s) => s.title.toLowerCase()).join(", ")}.
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
