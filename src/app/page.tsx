import Link from "next/link";
import { auth } from "@/lib/auth";
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
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border/40 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M3 20L8 13L12 16L21 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M17 4L21 4L21 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="truncate text-lg font-bold tracking-tight">RetireWise</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
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
        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Retire with
            <span className="text-primary"> Confidence</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            AI-powered retirement investment analysis. Track your portfolio,
            model scenarios, and get intelligent recommendations — all in one
            place.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
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

        <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-24 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
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
