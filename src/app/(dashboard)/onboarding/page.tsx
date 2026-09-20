import Link from "next/link";
import { Check, ArrowRight, CircleDashed, ShieldCheck } from "lucide-react";
import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { getOnboardingState } from "@/lib/onboarding";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default async function OnboardingPage() {
  return withHousehold(() => OnboardingContent());
}

/**
 * A checklist, not a wizard.
 *
 * Setting this up means finding statements, looking up a salary and deciding
 * what "retirement" means — none of which happens in one sitting. A wizard
 * that has to be finished in order traps someone who cannot answer step two
 * yet; a list they can come back to does not, and it doubles as the answer to
 * "how much of this is real yet" long after the first run.
 */
async function OnboardingContent() {
  const { dataClerkId } = await getAuthContext();
  const state = await getOnboardingState(dataClerkId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Getting set up
        </h1>
        <p className="text-muted-foreground">
          {state.projectionTrustworthy
            ? "Everything a projection needs is in place. The rest is refinement."
            : "Each step below changes what RetireWise can actually tell you."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="h-2 min-w-[140px] flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(state.completed / state.total) * 100}%` }}
          />
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {state.completed} of {state.total}
        </span>
      </div>

      {!state.projectionTrustworthy && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm">
              Projections will still draw until these are done — they just will not
              mean much. A number on a chart looks the same whether or not the
              inputs behind it exist, which is the reason for this page.
            </p>
          </CardContent>
        </Card>
      )}

      <ol className="space-y-3">
        {state.steps.map((step, i) => {
          const isNext = state.next?.id === step.id;
          return (
            <li key={step.id}>
              <Card
                className={cn(
                  "transition-colors",
                  isNext && "border-primary/60 shadow-sm",
                  step.done && "bg-muted/30"
                )}
              >
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                        step.done
                          ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-600"
                          : isNext
                            ? "border-primary bg-primary text-primary-foreground"
                            : "text-muted-foreground"
                      )}
                    >
                      {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-heading font-medium">{step.title}</span>
                        {step.required && !step.done && (
                          <Badge variant="outline" className="text-[10px]">
                            Needed
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {step.done && step.detail ? step.detail : step.why}
                      </p>
                    </div>
                  </div>

                  <Link
                    href={step.href}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-md px-3 text-sm font-medium transition-colors sm:self-auto",
                      isNext
                        ? "bg-primary text-primary-foreground hover:opacity-90"
                        : "border hover:bg-accent"
                    )}
                  >
                    {step.done ? "Review" : step.action}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>

      <Card>
        <CardContent className="space-y-2 py-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <CircleDashed className="h-4 w-4" />
            Stuck on any of it?
          </p>
          <p>
            <Link href="/help" className="underline">
              Help
            </Link>{" "}
            covers what to do when an institution will not link, why a balance
            looks stale, and how the projection arrives at its number.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
