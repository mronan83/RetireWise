"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { accounts } from "../db/schema";

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  institution: z.string().min(1, "Institution is required"),
  owner: z.enum(["self", "spouse"]),
  accountType: z.enum([
    "401k",
    "403b",
    "ira_traditional",
    "ira_roth",
    "brokerage",
    "hsa",
    "529",
    "pension",
    "annuity",
    "social_security",
    "other",
  ]),
  taxTreatment: z.enum(["tax_deferred", "tax_free", "taxable"]),
  isActivelyContributing: z.coerce.boolean().optional(),
});

export async function createAccount(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const parsed = accountSchema.parse({
    name: formData.get("name"),
    institution: formData.get("institution"),
    owner: formData.get("owner"),
    accountType: formData.get("accountType"),
    taxTreatment: formData.get("taxTreatment"),
    isActivelyContributing: formData.get("isActivelyContributing") === "on",
  });

  const db = getDb();
  await db.insert(accounts).values({
    clerkId: userId,
    ...parsed,
    isActivelyContributing: parsed.isActivelyContributing ?? true,
  });

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}

export async function updateAccount(id: string, formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const parsed = accountSchema.parse({
    name: formData.get("name"),
    institution: formData.get("institution"),
    owner: formData.get("owner"),
    accountType: formData.get("accountType"),
    taxTreatment: formData.get("taxTreatment"),
    isActivelyContributing: formData.get("isActivelyContributing") === "on",
  });

  const db = getDb();
  await db
    .update(accounts)
    .set({ ...parsed, isActivelyContributing: parsed.isActivelyContributing ?? true, updatedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.clerkId, userId)));

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
}

export async function deleteAccount(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();
  await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.clerkId, userId)));

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}
