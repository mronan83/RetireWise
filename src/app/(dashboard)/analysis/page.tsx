import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Brain, MessageSquare, BarChart3, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AnalysisPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Analysis</h1>
        <p className="text-muted-foreground">
          AI-powered insights and recommendations for your portfolio
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="cursor-pointer transition-colors hover:bg-accent/50">
          <CardHeader className="flex flex-row items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-base">Portfolio Review</CardTitle>
              <p className="text-sm text-muted-foreground">
                Comprehensive analysis of your portfolio health
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Get a detailed review of your allocation, diversification, risk
              exposure, and performance. Use the chat button in the bottom-right
              corner to start.
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-accent/50">
          <CardHeader className="flex flex-row items-center gap-3">
            <Target className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-base">Allocation Drift</CardTitle>
              <p className="text-sm text-muted-foreground">
                Compare current vs target allocation
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Identify which asset classes are over or underweight and get
              specific rebalancing suggestions.
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-accent/50">
          <CardHeader className="flex flex-row items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-base">Holdings Analysis</CardTitle>
              <p className="text-sm text-muted-foreground">
                Deep dive into individual positions
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Analyze concentration risk, identify your best and worst
              performers, and spot opportunities.
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-accent/50">
          <CardHeader className="flex flex-row items-center gap-3">
            <MessageSquare className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-base">Ask Anything</CardTitle>
              <p className="text-sm text-muted-foreground">
                Chat with your AI financial analyst
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ask questions about your portfolio, retirement planning, tax
              strategies, or any investment topic.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
        <strong>Tip:</strong> Use the chat button (bottom-right) from any page
        to interact with the AI. It has access to your real portfolio data and
        can provide personalized analysis.
      </div>
    </div>
  );
}
