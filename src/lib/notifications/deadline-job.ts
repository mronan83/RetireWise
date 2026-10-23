import { arrayContains, inArray } from "drizzle-orm";
import { getBaseDb } from "@/lib/db";
import { pushSubscriptions, userPreferences } from "@/lib/db/schema";
import { deadlinesDue } from "./kinds";
import { notifySafely } from "./send";

/**
 * The yearly deadline reminders, for every household with a device that
 * wants them. Run daily by the bank refresh; the notification log makes each
 * reminder fire once a year, and starting from the reminder date rather than
 * on it means a missed day is caught by the next.
 */
export async function sendDeadlineReminders(today: string): Promise<number> {
  const db = getBaseDb();
  const households = [
    ...new Set(
      (
        await db
          .select({ clerkId: pushSubscriptions.clerkId })
          .from(pushSubscriptions)
          .where(arrayContains(pushSubscriptions.kinds, ["deadlines"]))
      ).map((r) => r.clerkId)
    ),
  ];
  if (households.length === 0) return 0;
  const prefs = await db
    .select({
      clerkId: userPreferences.clerkId,
      currentAge: userPreferences.currentAge,
      spouseCurrentAge: userPreferences.spouseCurrentAge,
    })
    .from(userPreferences)
    .where(inArray(userPreferences.clerkId, households));
  let due = 0;
  for (const clerkId of households) {
    const p = prefs.find((r) => r.clerkId === clerkId);
    for (const d of deadlinesDue(today, [p?.currentAge ?? null, p?.spouseCurrentAge ?? null])) {
      await notifySafely({ clerkId, kind: "deadlines", eventKey: d.key, message: d.message });
      due++;
    }
  }
  return due;
}
