import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Brain,
  Link2,
  PieChart,
  TrendingUp,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/40 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">RetireWise</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Retire with
            <span className="text-primary"> Confidence</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            AI-powered retirement investment analysis. Track your portfolio,
            model scenarios, and get intelligent recommendations — all in one
            place.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/sign-up">
              <Button size="lg" className="px-8">
                Start Tracking
              </Button>
            </Link>
            <Link href="/?demo=true">
              <Button variant="outline" size="lg" className="px-8">
                Try Demo
              </Button>
            </Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: PieChart,
              title: "Portfolio Dashboard",
              description:
                "Interactive charts showing allocation, performance, and holdings across all your accounts.",
            },
            {
              icon: Brain,
              title: "AI Analysis",
              description:
                "Get intelligent portfolio reviews, rebalancing suggestions, and risk assessments powered by Claude.",
            },
            {
              icon: Link2,
              title: "Account Connections",
              description:
                "Connect your brokerage accounts via Plaid for automatic data sync, or import via CSV.",
            },
            {
              icon: BarChart3,
              title: "Retirement Projections",
              description:
                "Monte Carlo simulations and scenario modeling to plan your retirement with confidence.",
            },
            {
              icon: TrendingUp,
              title: "Performance Tracking",
              description:
                "Track returns, compare against benchmarks, and monitor your progress toward retirement goals.",
            },
            {
              icon: Shield,
              title: "Tax Optimization",
              description:
                "Identify tax-loss harvesting opportunities and optimize withdrawal strategies across account types.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border bg-card p-6 transition-colors hover:bg-accent/50"
            >
              <feature.icon className="mb-3 h-8 w-8 text-primary" />
              <h3 className="mb-2 font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        RetireWise &mdash; AI-powered retirement investment modeling
      </footer>
    </div>
  );
}
