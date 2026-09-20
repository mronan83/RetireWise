import { requireWriteClerkId } from "@/lib/auth-helpers";
import { auth } from "@/lib/auth";
import {
  INVITE_TTL_DAYS,
  createInvite,
  householdFor,
  listInvites,
  revokeInvite,
} from "@/lib/invites";

/**
 * Only the household's primary member may issue or revoke invitations.
 *
 * An invite grants a full read of the household's finances, so the ability to
 * mint one is not something every member should inherit by joining.
 */
async function requirePrimary() {
  await requireWriteClerkId();
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized", status: 401 as const };

  const household = await householdFor(userId);
  if (!household) return { error: "No household yet.", status: 404 as const };
  if (household.primaryClerkId !== userId) {
    return { error: "Only the household owner can manage invites.", status: 403 as const };
  }
  return { householdId: household.id, userId };
}

export async function GET() {
  let ctx;
  try {
    ctx = await requirePrimary();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  return Response.json({ invites: await listInvites(ctx.householdId), ttlDays: INVITE_TTL_DAYS });
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requirePrimary();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { label } = await request.json().catch(() => ({ label: undefined }));
  const { code, invite } = await createInvite(ctx.householdId, ctx.userId, label);

  // The only time the plaintext exists outside the inviter's hands. Nothing
  // stores it, so a later GET can never return it again.
  return Response.json({ code, invite, ttlDays: INVITE_TTL_DAYS });
}

export async function DELETE(request: Request) {
  let ctx;
  try {
    ctx = await requirePrimary();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await request.json().catch(() => ({ id: null }));
  if (typeof id !== "string") {
    return Response.json({ error: "Missing invite id." }, { status: 400 });
  }

  const revoked = await revokeInvite(id, ctx.householdId);
  if (!revoked) {
    return Response.json({ error: "That invite cannot be revoked." }, { status: 404 });
  }
  return Response.json({ revoked: true });
}
