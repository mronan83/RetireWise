"use client";

import { useState, useActionState } from "react";
import { Plus, Trash2, Pencil, Target, Trophy, Link2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { createGoal, updateGoal, deleteGoal } from "@/lib/actions/goals";
import { cn } from "@/lib/utils";

type LinkableItem = {
  itemType: "account" | "debt" | "cash_reserve" | "real_estate" | "vehicle";
  itemId: string;
  label: string;
  detail: string;
  value: number;
};

type GoalLinkView = {
  itemType: string;
  itemId: string;
  label: string;
  baseline: number;
  current: number | null;
};

type GoalProgressView = {
  baseline: number;
  current: number;
  target: number;
  pct: number | null;
  moved: number;
  remaining: number;
  satisfied: boolean;
  linkedCount: number;
  orphanedCount: number;
};

export type GoalView = {
  id: string;
  name: string;
  direction: "accumulate" | "reduce";
  targetAmount: string;
  targetDate: string | null;
  baselineDate: string | null;
  closedAt: Date | string | null;
  category: string | null;
  progress: GoalProgressView | null;
  links: GoalLinkView[];
};

const pctLabel = (pct: number | null) =>
  pct === null ? "—" : `${pct > 0 ? "" : ""}${pct.toFixed(1)}%`;

export function GoalsPanel({
  goals,
  linkable,
}: {
  goals: GoalView[];
  linkable: LinkableItem[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalView | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Goals &amp; Milestones
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Goal
        </Button>
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Link accounts to a goal to track progress — paying down a set of
            cards, or building toward a retirement target.
          </p>
        ) : (
          <div className="space-y-5">
            {goals.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                onEdit={() => setEditingGoal(goal)}
              />
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Goal</DialogTitle>
          </DialogHeader>
          <GoalForm linkable={linkable} onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={editingGoal !== null} onOpenChange={(open) => !open && setEditingGoal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Goal</DialogTitle>
          </DialogHeader>
          {editingGoal && (
            <GoalForm
              goal={editingGoal}
              linkable={linkable}
              onSuccess={() => setEditingGoal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function GoalRow({ goal, onEdit }: { goal: GoalView; onEdit: () => void }) {
  const p = goal.progress;
  const closed = goal.closedAt !== null;
  const reduce = goal.direction === "reduce";

  // Backwards movement is a real reading, not an error state, and it is the
  // reason nothing here is clamped: a card charged inside a payoff goal has
  // moved the household away from being debt free and must say so.
  const behind = p !== null && p.pct !== null && p.pct < 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          {closed ? (
            <Trophy className="h-4 w-4 shrink-0 text-yellow-500" />
          ) : behind ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className={cn("truncate font-medium", closed && "text-green-600 dark:text-green-500")}>
            {goal.name}
          </span>
          {reduce && (
            <span className="shrink-0 rounded border px-1 py-0 text-[10px] text-muted-foreground">
              payoff
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {p !== null && (
            <span className="font-mono text-xs">
              {formatCurrency(p.current)} / {formatCurrency(p.target)}
            </span>
          )}
          <button onClick={onEdit} className="p-0.5 text-muted-foreground hover:text-primary">
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => deleteGoal(goal.id)}
            className="p-0.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {p === null ? (
        <p className="flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          No accounts linked — this goal has nothing to measure. Edit it to link
          the accounts it is about.
        </p>
      ) : (
        <>
          {/* The bar is clamped for layout only. The number beside it is not. */}
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                closed
                  ? "bg-green-500"
                  : behind
                    ? "bg-destructive"
                    : "bg-primary"
              )}
              style={{
                width: `${Math.min(100, Math.max(0, p.pct ?? 0))}%`,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={cn("font-medium", behind && "text-destructive")}>
              {pctLabel(p.pct)}
              {p.pct !== null && (
                <span className="ml-1.5 font-normal">
                  {reduce
                    ? `· ${formatCurrency(Math.abs(p.moved))} ${p.moved >= 0 ? "paid down" : "added"} of ${formatCurrency(p.baseline)}`
                    : `· ${formatCurrency(p.current)} of ${formatCurrency(p.target)}`}
                </span>
              )}
            </span>
            {closed ? (
              <span className="text-green-600 dark:text-green-500">
                Closed {new Date(goal.closedAt!).toISOString().split("T")[0]}
              </span>
            ) : (
              goal.targetDate && <span>Target: {goal.targetDate}</span>
            )}
          </div>

          {p.orphanedCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {p.orphanedCount} linked{" "}
              {p.orphanedCount === 1 ? "account has" : "accounts have"} been
              deleted and {p.orphanedCount === 1 ? "is" : "are"} no longer
              counted on either side.
            </p>
          )}

          {/* Per-account rows: a single aggregate bar hides which account
              moved, and in a payoff goal the committed amortisation will
              otherwise drown out the part you actually control. */}
          {goal.links.length > 1 && (
            <ul className="space-y-0.5 pt-0.5 text-xs">
              {goal.links.map((l) => {
                const gone = l.current === null;
                const delta = gone ? 0 : l.baseline - l.current!;
                return (
                  <li
                    key={`${l.itemType}-${l.itemId}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate text-muted-foreground">{l.label}</span>
                    <span className="shrink-0 font-mono tabular-nums">
                      {gone ? (
                        <span className="text-amber-600 dark:text-amber-500">deleted</span>
                      ) : (
                        <>
                          <span className="text-muted-foreground">
                            {formatCurrency(l.current!)}
                          </span>
                          {reduce && delta !== 0 && (
                            <span
                              className={cn(
                                "ml-1.5",
                                delta > 0
                                  ? "text-green-600 dark:text-green-500"
                                  : "text-destructive"
                              )}
                            >
                              {delta > 0 ? "−" : "+"}
                              {formatCurrency(Math.abs(delta))}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function GoalForm({
  goal,
  linkable,
  onSuccess,
}: {
  goal?: GoalView;
  linkable: LinkableItem[];
  onSuccess: () => void;
}) {
  const [direction, setDirection] = useState<"accumulate" | "reduce">(
    goal?.direction ?? "accumulate"
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(goal?.links.map((l) => `${l.itemType}:${l.itemId}`) ?? [])
  );
  const editing = goal !== undefined;

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        if (goal) await updateGoal(goal.id, formData);
        else await createGoal(formData);
        onSuccess();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Failed";
      }
    },
    null
  );

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const debtsFirst = direction === "reduce";
  const shown = [...linkable].sort((a, b) => {
    const rank = (i: LinkableItem) =>
      debtsFirst ? (i.itemType === "debt" ? 0 : 1) : i.itemType === "account" ? 0 : 1;
    return rank(a) - rank(b) || b.value - a.value;
  });

  const basis = shown
    .filter((i) => selected.has(`${i.itemType}:${i.itemId}`))
    .reduce((s, i) => s + i.value, 0);

  return (
    <form action={formAction} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Goal Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={goal?.name || ""}
          placeholder="e.g. Clear the credit cards"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>What kind of goal?</Label>
        <div className="flex gap-2">
          {(["accumulate", "reduce"] as const).map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={direction === d ? "default" : "outline"}
              onClick={() => setDirection(d)}
              disabled={editing}
            >
              {d === "accumulate" ? "Build toward" : "Pay down"}
            </Button>
          ))}
        </div>
        <input type="hidden" name="direction" value={direction} />
        {editing && (
          <p className="text-xs text-muted-foreground">
            The kind and the linked accounts are fixed once a goal is created —
            they are what every reading is measured against.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="targetAmount">
          {direction === "reduce" ? "Target balance ($)" : "Target amount ($)"}
        </Label>
        <Input
          id="targetAmount"
          name="targetAmount"
          type="number"
          step="0.01"
          min="0"
          defaultValue={goal?.targetAmount || (direction === "reduce" ? "0" : "")}
          placeholder={direction === "reduce" ? "0" : "2000000"}
          required
        />
      </div>

      {!editing && (
        <div className="space-y-2">
          <Label>
            Linked accounts
            <span className="ml-1.5 font-normal text-muted-foreground">
              — the goal is measured over these and nothing else
            </span>
          </Label>
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border p-1.5">
            {shown.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">
                No accounts to link yet.
              </p>
            ) : (
              shown.map((i) => {
                const key = `${i.itemType}:${i.itemId}`;
                const on = selected.has(key);
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent",
                      on && "bg-accent"
                    )}
                  >
                    <input
                      type="checkbox"
                      name="links"
                      value={key}
                      checked={on}
                      onChange={() => toggle(key)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {i.label}
                      <span className="ml-1.5 text-xs text-muted-foreground">{i.detail}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(i.value)}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          {selected.size > 0 && (
            <p className="text-xs text-muted-foreground">
              Starting basis:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatCurrency(basis)}
              </span>{" "}
              across {selected.size}{" "}
              {selected.size === 1 ? "account" : "accounts"}. Fixed at creation —
              every later reading is measured against it.
              {direction === "reduce" && basis === 0 && (
                <span className="mt-1 block text-destructive">
                  Every account selected is already at zero, so there is nothing
                  to measure. Include one that carries a balance.
                </span>
              )}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="targetDate">Target Date (optional)</Label>
        <Input id="targetDate" name="targetDate" type="date" defaultValue={goal?.targetDate || ""} />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : goal ? "Save Changes" : "Add Goal"}
      </Button>
    </form>
  );
}
