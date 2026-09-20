"use server";

import { requireWriteClerkId, withWriteHousehold } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { goals } from "../db/schema";

const goalSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.coerce.number().positive(),
  targetDate: z.string().optional(),
  category: z.string().optional(),
});

export async function createGoal(
  ...args: Parameters<typeof createGoalImpl>
) {
  return withWriteHousehold(() => createGoalImpl(...args));
}

async function createGoalImpl(formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const parsed = goalSchema.parse({
    name: formData.get("name"),
    targetAmount: formData.get("targetAmount"),
    targetDate: formData.get("targetDate") || undefined,
    category: formData.get("category") || "retirement",
  });

  const db = getDb();
  await db.insert(goals).values({
    clerkId: userId,
    name: parsed.name,
    targetAmount: String(parsed.targetAmount),
    targetDate: parsed.targetDate || null,
    category: parsed.category,
  });

  revalidatePath("/dashboard");
}

export async function updateGoal(
  ...args: Parameters<typeof updateGoalImpl>
) {
  return withWriteHousehold(() => updateGoalImpl(...args));
}

async function updateGoalImpl(id: string, formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const parsed = goalSchema.parse({
    name: formData.get("name"),
    targetAmount: formData.get("targetAmount"),
    targetDate: formData.get("targetDate") || undefined,
    category: formData.get("category") || "retirement",
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

export async function deleteGoal(
  ...args: Parameters<typeof deleteGoalImpl>
) {
  return withWriteHousehold(() => deleteGoalImpl(...args));
}

async function deleteGoalImpl(id: string) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const db = getDb();
  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.clerkId, userId)));
  revalidatePath("/dashboard");
}
