import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { accounts } from "../db/schema";

export async function getAccounts(clerkId: string) {
  const db = getDb();
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.clerkId, clerkId))
    .orderBy(accounts.name);
}

export async function getAccountById(id: string, clerkId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  const account = result[0];
  if (!account || account.clerkId !== clerkId) return null;
  return account;
}
