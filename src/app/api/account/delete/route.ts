import { eq } from "drizzle-orm";
import { withApiHousehold, withApiWriteHousehold } from "@/lib/auth-helpers";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { households } from "@/lib/db/schema";
import { deleteHouseholdData } from "@/lib/account/delete";
import { summariseAccountData } from "@/lib/account/export";

/** What deletion would remove, so the confirmation screen can be specific. */
export async function GET() {
  return withApiHousehold(async (clerkId) => {
    const { userId } = await auth();
    const summary = await summariseAccountData(clerkId);
    return Response.json({
      canDelete: await isPrimary(clerkId, userId),
      summary,
      totalRows: summary.reduce((total, r) => total + r.rows, 0),
    });
  });
}

async function isPrimary(clerkId: string, accountId: string | null): Promise<boolean> {
  if (!accountId) return false;
  // The household's data is keyed to the primary. A member who joined can
  // leave, but erasing the dataset is the owner's decision, not theirs.
  if (accountId === clerkId) return true;
  const rows = await getDb()
    .select({ id: households.id })
    .from(households)
    .where(eq(households.primaryClerkId, accountId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Erase this household's data.
 *
 * Requires the exact phrase, typed. A destructive action reached by clicking
 * through two dialogs is one people perform by accident; typing the words is
 * the smallest barrier that requires actually reading the screen.
 *
 * This does not delete the login itself — that lives with the auth provider
 * and is removed separately, which the response says plainly rather than
 * implying the account is gone when the email can still sign in.
 */
const CONFIRMATION = "DELETE MY DATA";

export async function POST(request: Request) {
  return withApiWriteHousehold(async (clerkId) => {
    const { userId } = await auth();

    if (!(await isPrimary(clerkId, userId))) {
      return Response.json(
        {
          error:
            "Only the household owner can erase the household's data. " +
            "You can leave the household instead.",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== CONFIRMATION) {
      return Response.json(
        { error: `Type "${CONFIRMATION}" to confirm.`, expected: CONFIRMATION },
        { status: 400 }
      );
    }

    const result = await deleteHouseholdData(clerkId);

    return Response.json({
      deleted: true,
      rowsByTable: result.deleted,
      totalRows: result.totalRows,
      note:
        "Your financial data is gone. Your sign-in still exists — RetireWise " +
        "does not control it. Delete it from your account settings, or ask the " +
        "person who runs this deployment to remove it.",
    });
  });
}
