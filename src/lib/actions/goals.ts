"use server";

import { requireWriteClerkId, withWriteHousehold } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { goalLinks, goals } from "../db/schema";
import { getLinkableItems } from "../queries/goals";
import { validateBasis, type GoalDirection } from "../goals/progress";

const ITEM_TYPES = ["account", "debt", "cash_reserve", "real_estate", "vehicle"] as const;

const goalSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.coerce.number().min(0),
  targetDate: z.string().optional(),
  category: z.string().optional(),
  direction: z.enum(["accumulate", "reduce"]).default("accumulate"),
});

/** "debt:uuid" pairs from the link picker. */
function parseLinks(formData: FormData): { itemType: (typeof ITEM_TYPES)[number]; itemId: string }[] {
  const raw = formData.getAll("links").map(String);
  const out: { itemType: (typeof ITEM_TYPES)[number]; itemId: string }[] = [];
  for (const entry of raw) {
    const [type, id] = entry.split(":");
    if (!id) continue;
    const itemType = ITEM_TYPES.find((t) => t === type);
    if (!itemType) continue;
    if (!out.some((o) => o.itemType === itemType && o.itemId === id)) {
      out.push({ itemType, itemId: id });
    }
  }
  return out;
}

export async function createGoal(...args: Parameters<typeof createGoalImpl>) {
  return withWriteHousehold(() => createGoalImpl(...args));
}

/**
 * Create a goal and strike its basis.
 *
 * The basis is the sum of the linked accounts' balances at this moment, stored
 * per link, and it is never recomputed. Everything the goal reports afterwards
 * divides by this number.
 */
async function createGoalImpl(formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const parsed = goalSchema.parse({
    name: formData.get("name"),
    targetAmount: formData.get("targetAmount"),
    targetDate: formData.get("targetDate") || undefined,
    category: formData.get("category") || "retirement",
    direction: formData.get("direction") || "accumulate",
  });

  const requested = parseLinks(formData);
  const items = await getLinkableItems(userId);
  const itemBy = new Map(items.map((i) => [`${i.itemType}|${i.itemId}`, i]));

  // Only link things this household actually owns. An id from the form is an
  // id from the client.
  const resolved = requested
    .map((r) => itemBy.get(`${r.itemType}|${r.itemId}`))
    .filter((i): i is NonNullable<typeof i> => i !== undefined);

  const links = resolved.map((i) => ({
    itemType: i.itemType,
    itemId: i.itemId,
    baselineAmount: i.value,
  }));

  const check = validateBasis({
    direction: parsed.direction as GoalDirection,
    target: parsed.targetAmount,
    links,
  });
  if (!check.ok) throw new Error(check.reason);

  const db = getDb();
  const today = new Date().toISOString().split("T")[0];

  const [created] = await db
    .insert(goals)
    .values({
      clerkId: userId,
      name: parsed.name,
      direction: parsed.direction as GoalDirection,
      targetAmount: String(parsed.targetAmount),
      targetDate: parsed.targetDate || null,
      baselineDate: today,
      category: parsed.category,
    })
    .returning({ id: goals.id });

  await db.insert(goalLinks).values(
    links.map((l) => ({
      clerkId: userId,
      goalId: created.id,
      itemType: l.itemType,
      itemId: l.itemId,
      baselineAmount: String(l.baselineAmount),
    }))
  );

  revalidatePath("/dashboard");
}

export async function updateGoal(...args: Parameters<typeof updateGoalImpl>) {
  return withWriteHousehold(() => updateGoalImpl(...args));
}

/**
 * Rename a goal, or move its target.
 *
 * The basis and the links are not editable here. Both are what every reading
 * is measured against, and a basis that can be revised is not a basis — a goal
 * whose scope has changed is a new goal.
 */
async function updateGoalImpl(id: string, formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const parsed = goalSchema.parse({
    name: formData.get("name"),
    targetAmount: formData.get("targetAmount"),
    targetDate: formData.get("targetDate") || undefined,
    category: formData.get("category") || "retirement",
    direction: formData.get("direction") || "accumulate",
  });

  const db = getDb();
  await db
    .update(goals)
    .set({
      name: parsed.name,
      targetAmount: String(parsed.targetAmount),
      targetDate: parsed.targetDate || null,
      category: parsed.category,
      updatedAt: new Date(),
    })
    .where(and(eq(goals.id, id), eq(goals.clerkId, userId)));

  revalidatePath("/dashboard");
}

export async function deleteGoal(...args: Parameters<typeof deleteGoalImpl>) {
  return withWriteHousehold(() => deleteGoalImpl(...args));
}

async function deleteGoalImpl(id: string) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const db = getDb();
  // goal_links cascades from the goal.
  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.clerkId, userId)));
  revalidatePath("/dashboard");
}
