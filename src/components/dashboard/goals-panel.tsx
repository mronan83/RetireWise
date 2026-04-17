"use client";

import { useState, useActionState } from "react";
import { Plus, Trash2, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { createGoal, deleteGoal } from "@/lib/actions/goals";
import { cn } from "@/lib/utils";

type Goal = {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string | null;
  targetDate: string | null;
  category: string | null;
  isCompleted: boolean | null;
};

export function GoalsPanel({
  goals,
  portfolioValue,
}: {
  goals: Goal[];
  portfolioValue: number;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Goals & Milestones
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Goal
        </Button>
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Set retirement goals to track your progress. Try &quot;$2M by age 60&quot;
            or &quot;$1M milestone&quot;.
          </p>
        ) : (
          <div className="space-y-3">
            {goals.map((goal) => {
              const target = Number(goal.targetAmount);
              const progress = Math.min(100, (portfolioValue / target) * 100);
              const reached = portfolioValue >= target;

              return (
                <div key={goal.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {reached ? (
                        <Trophy className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <Target className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={cn("font-medium", reached && "text-green-500")}>
                        {goal.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">
                        {formatCurrency(portfolioValue)} / {formatCurrency(target)}
                      </span>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        reached ? "bg-green-500" : "bg-primary"
                      )}
                      style={{ width: `${Math.min(100, progress)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{progress.toFixed(1)}%</span>
                    {goal.targetDate && <span>Target: {goal.targetDate}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Goal</DialogTitle>
          </DialogHeader>
          <AddGoalForm onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AddGoalForm({ onSuccess }: { onSuccess: () => void }) {
  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await createGoal(formData);
        onSuccess();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Failed";
      }
    },
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Goal Name</Label>
        <Input id="name" name="name" placeholder="e.g. $2M retirement target" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="targetAmount">Target Amount ($)</Label>
        <Input
          id="targetAmount"
          name="targetAmount"
          type="number"
          step="0.01"
          placeholder="2000000"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="targetDate">Target Date (optional)</Label>
        <Input id="targetDate" name="targetDate" type="date" />
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Adding..." : "Add Goal"}
      </Button>
    </form>
  );
}
