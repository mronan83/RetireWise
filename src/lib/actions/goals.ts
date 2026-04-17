"use server";

import { auth } from "@clerk/nextjs/server";
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

export async function createGoal(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

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

export async function updateGoal(id: string, formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

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

export async function deleteGoal(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();
  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.clerkId, userId)));
  revalidatePath("/dashboard");
}
