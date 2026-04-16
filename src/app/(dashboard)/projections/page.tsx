import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LineChart, Calculator, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProjectionsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Retirement Projections
        </h1>
        <p className="text-muted-foreground">
          Model your retirement timeline with Monte Carlo simulations and
          scenario analysis
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <Calculator className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-base">
                Retirement Calculator
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Project your portfolio growth to retirement
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Based on your current portfolio, contribution rate, and expected
              returns, see when you can retire comfortably.
            </p>
            <p className="mt-3 text-xs text-muted-foreground italic">
              Coming in Phase 3
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <LineChart className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-base">
                Monte Carlo Simulation
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Probability-based outcome analysis
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Run thousands of simulations to see the range of possible outcomes
              and your probability of meeting retirement goals.
            </p>
            <p className="mt-3 text-xs text-muted-foreground italic">
              Coming in Phase 3
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <TrendingUp className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-base">Scenario Analysis</CardTitle>
              <p className="text-sm text-muted-foreground">
                &quot;What if&quot; modeling
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Test different scenarios: market crash, early retirement, increased
              savings rate, Social Security timing, and more.
            </p>
            <p className="mt-3 text-xs text-muted-foreground italic">
              Coming in Phase 3
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <Clock className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-base">
                Withdrawal Strategy
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Optimize your drawdown plan
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Plan optimal withdrawal sequencing across traditional, Roth, and
              taxable accounts to minimize taxes in retirement.
            </p>
            <p className="mt-3 text-xs text-muted-foreground italic">
              Coming in Phase 3
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
        <strong>Tip:</strong> While advanced projections are coming soon, you can
        ask the AI assistant questions like &quot;Will I have enough to
        retire?&quot; or &quot;What if I increase my contributions?&quot; for
        preliminary analysis.
      </div>
    </div>
  );
}
