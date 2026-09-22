import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  accounts,
  cashReserves,
  debts,
  goalLinks,
  goals,
  holdings,
  realEstate,
  vehicles,
} from "../db/schema";
import { computeGoalProgress, type LinkCurrent } from "../goals/progress";

export type LinkableItem = {
  itemType: "account" | "debt" | "cash_reserve" | "real_estate" | "vehicle";
  itemId: string;
  label: string;
  detail: string;
  /** Today's balance or value. Debts are positive amounts owed. */
  value: number;
};

/**
 * Everything a goal can be linked to, with what it is worth today.
 *
 * One pass over the five tracked kinds. Investment accounts are valued from
 * their holdings rather than a stored total, so the figure is the same one
 * the dashboard shows.
 */
export async function getLinkableItems(clerkId: string): Promise<LinkableItem[]> {
  const db = getDb();

  const [accountRows, debtRows, cashRows, propertyRows, vehicleRows] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        institution: accounts.institution,
        accountType: accounts.accountType,
        value: sql<string>`coalesce((
          select sum(${holdings.currentValue}) from ${holdings}
          where ${holdings.accountId} = ${accounts.id}
        ), 0)`,
      })
      .from(accounts)
      .where(eq(accounts.clerkId, clerkId)),
    db
      .select({
        id: debts.id,
        name: debts.name,
        debtType: debts.debtType,
        balance: debts.currentBalance,
      })
      .from(debts)
      .where(eq(debts.clerkId, clerkId)),
    db
      .select({ id: cashReserves.id, name: cashReserves.name, balance: cashReserves.balance })
      .from(cashReserves)
      .where(eq(cashReserves.clerkId, clerkId)),
    db
      .select({ id: realEstate.id, name: realEstate.name, value: realEstate.estimatedValue })
      .from(realEstate)
      .where(eq(realEstate.clerkId, clerkId)),
    db
      .select({ id: vehicles.id, name: vehicles.name, value: vehicles.estimatedValue })
      .from(vehicles)
      .where(eq(vehicles.clerkId, clerkId)),
  ]);

  const items: LinkableItem[] = [];

  for (const a of accountRows) {
    items.push({
      itemType: "account",
      itemId: a.id,
      label: a.name,
      detail: `${a.institution} · ${a.accountType}`,
      value: Number(a.value),
    });
  }
  for (const d of debtRows) {
    items.push({
      itemType: "debt",
      itemId: d.id,
      label: d.name,
      detail: String(d.debtType).replace(/_/g, " "),
      value: Number(d.balance),
    });
  }
  for (const c of cashRows) {
    items.push({ itemType: "cash_reserve", itemId: c.id, label: c.name, detail: "cash", value: Number(c.balance) });
  }
  for (const r of propertyRows) {
    items.push({ itemType: "real_estate", itemId: r.id, label: r.name, detail: "property", value: Number(r.value) });
  }
  for (const v of vehicleRows) {
    items.push({ itemType: "vehicle", itemId: v.id, label: v.name, detail: "vehicle", value: Number(v.value) });
  }

  return items;
}

export type GoalWithProgress = Awaited<ReturnType<typeof getGoalsWithProgress>>[number];

/**
 * Goals, each rolled up over its own links.
 *
 * A goal with no links returns a progress of null rather than a figure: it has
 * not been told what to measure, and the panel asks for accounts instead of
 * inventing a number from the portfolio.
 */
export async function getGoalsWithProgress(clerkId: string) {
  const db = getDb();

  const [goalRows, linkRows, items] = await Promise.all([
    db.select().from(goals).where(eq(goals.clerkId, clerkId)).orderBy(goals.createdAt),
    db.select().from(goalLinks).where(eq(goalLinks.clerkId, clerkId)),
    getLinkableItems(clerkId),
  ]);

  const currents: LinkCurrent[] = items.map((i) => ({
    itemType: i.itemType,
    itemId: i.itemId,
    current: i.value,
  }));
  const itemBy = new Map(items.map((i) => [`${i.itemType}|${i.itemId}`, i]));

  return goalRows.map((goal) => {
    const links = linkRows.filter((l) => l.goalId === goal.id);
    const progress =
      links.length === 0
        ? null
        : computeGoalProgress({
            direction: goal.direction,
            target: Number(goal.targetAmount),
            links,
            currents,
          });

    return {
      id: goal.id,
      name: goal.name,
      direction: goal.direction,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate,
      baselineDate: goal.baselineDate,
      closedAt: goal.closedAt,
      category: goal.category,
      progress,
      links: links.map((l) => {
        const item = itemBy.get(`${l.itemType}|${l.itemId}`);
        return {
          itemType: l.itemType,
          itemId: l.itemId,
          label: item?.label ?? "Deleted account",
          baseline: Number(l.baselineAmount),
          current: item ? item.value : null,
        };
      }),
    };
  });
}

/** Goals whose linked items have reached the target and are not yet closed. */
export async function findGoalsToClose(clerkId: string) {
  const withProgress = await getGoalsWithProgress(clerkId);
  return withProgress.filter((g) => g.closedAt === null && g.progress?.satisfied);
}

export async function goalIdsFor(clerkId: string) {
  const db = getDb();
  const rows = await db.select({ id: goals.id }).from(goals).where(eq(goals.clerkId, clerkId));
  return rows.map((r) => r.id);
}

export async function linksForGoals(goalIds: string[]) {
  if (goalIds.length === 0) return [];
  const db = getDb();
  return db.select().from(goalLinks).where(inArray(goalLinks.goalId, goalIds));
}
